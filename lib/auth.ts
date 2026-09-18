import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { sendVerificationEmail } from "@/lib/email";
import {
  dbDelete,
  dbInsert,
  dbRpc,
  dbSelect,
  dbUpdate,
} from "@/lib/supabase";
import type {
  StoredEmailCode,
  StoredEmailCodePurpose,
  StoredLoginAttempt,
  StoredOtpSendAttempt,
  StoredUser,
} from "@/lib/file-store";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  displayName: string;
  authVersion: number;
};

type AuthFailure = { error: string; status?: number };
type RequestMeta = { ip?: string };

const sessionCookieName = "portfolio_session";
const sessionMaxAge = 60 * 60 * 24 * 30;
const codeMaxAgeMs = 10 * 60 * 1000;
const codeCooldownMs = 60 * 1000;
const otpWindowMs = 10 * 60 * 1000;
const loginWindowMs = 15 * 60 * 1000;
const maxCodeAttempts = 5;
const maxOtpSendsPerEmail = 5;
const maxOtpSendsPerIp = 15;
const maxLoginFailuresPerEmail = 7;
const maxLoginFailuresPerIp = 20;
const maxRegisteredUsers = 20;
const registrationFullMessage = `当前注册名额已满（${maxRegisteredUsers}/${maxRegisteredUsers}），暂时无法创建新账号。`;
const minPasswordLength = 12;
const maxPasswordLength = 128;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const codePattern = /^\d{6}$/;
const purposes = new Set<StoredEmailCodePurpose>(["register", "reset"]);

let runtimeSecret = "";

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeEmail(value: unknown): string {
  return clean(value, 180).toLocaleLowerCase("en-US");
}

function normalizeIp(value: unknown): string {
  return clean(value, 120) || "unknown";
}

function rateLimitIp(value: unknown): string {
  const normalized = normalizeIp(value);
  if (normalized === "unknown") return normalized;
  return createHmac("sha256", getSecret()).update(`rate-limit-ip:${normalized}`).digest("base64url");
}

function rateLimitEmail(value: string): string {
  return createHmac("sha256", getSecret()).update(`rate-limit-email:${value}`).digest("base64url");
}

async function padResetCodeResponse(startedAt: number): Promise<void> {
  const minimumMs = 700 + randomInt(0, 201);
  const remaining = minimumMs - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

function getSecret(): string {
  const configured = process.env.APP_SECRET;
  if (configured && configured.length >= 24) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing required APP_SECRET. Production needs an APP_SECRET with at least 24 characters.");
  }
  runtimeSecret ||= randomBytes(32).toString("base64url");
  return runtimeSecret;
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("base64url");
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashPassword(password, salt), "base64url");
  const expected = Buffer.from(expectedHash, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const dummyPasswordSalt = "portfolio-login-timing-salt";
const dummyPasswordHash = hashPassword("not-a-real-user-password", dummyPasswordSalt);

function safeTextEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

function hashEmailCode(email: string, purpose: StoredEmailCodePurpose, code: string, salt: string): string {
  return createHmac("sha256", getSecret()).update(`${purpose}:${email}:${code}:${salt}`).digest("base64url");
}

function toPublicUser(user: StoredUser): AppUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    displayName: user.name || user.email,
    authVersion: Math.max(1, Number(user.authVersion) || 1),
  };
}

function parseCookie(header: string | null, name: string): string {
  if (!header) return "";
  for (const item of header.split(";")) {
    const [key, ...rest] = item.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

function createSessionValue(userId: string, authVersion: number): string {
  const payload = Buffer.from(JSON.stringify({
    userId,
    authVersion,
    expiresAt: Date.now() + sessionMaxAge * 1000,
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readSessionValue(value: string): { userId: string; authVersion: number } | null {
  const [payload, signature] = value.split(".");
  if (!payload || !signature || !safeTextEqual(sign(payload), signature)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId?: unknown;
      authVersion?: unknown;
      expiresAt?: unknown;
    };
    if (typeof parsed.userId !== "string") return null;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) return null;
    return {
      userId: parsed.userId,
      authVersion: Math.max(1, Number(parsed.authVersion) || 1),
    };
  } catch {
    return null;
  }
}

function parsePurpose(value: unknown): StoredEmailCodePurpose | null {
  return typeof value === "string" && purposes.has(value as StoredEmailCodePurpose)
    ? value as StoredEmailCodePurpose
    : null;
}

function normalizeCode(value: unknown): string {
  return clean(value, 16).replace(/\s+/g, "");
}

function createEmailCode(): string {
  return randomInt(100000, 1000000).toString();
}

function readPassword(value: unknown, label: string): string | AuthFailure {
  if (typeof value !== "string" || value.length === 0) return { error: `请填写${label}` };
  if (value.length < minPasswordLength) return { error: `${label}至少需要十二位` };
  if (value.length > maxPasswordLength) return { error: `${label}不能超过一百二十八位` };
  return value;
}

function readLoginPassword(value: unknown): string | AuthFailure {
  if (typeof value !== "string" || value.length === 0) return { error: "请填写邮箱和密码" };
  // 兼容整改前可能存在的 8-11 位旧密码；新注册与重置仍强制 12-128 位。
  if (value.length > 200) return { error: "邮箱或密码不正确" };
  return value;
}

async function selectUserByEmail(email: string): Promise<StoredUser | null> {
  const rows = await dbSelect<StoredUser>("users", new URLSearchParams({
    select: "*",
    email: `eq.${email}`,
    limit: "1",
  }));
  return rows[0] ?? null;
}

async function registeredUserCount(): Promise<number> {
  const rows = await dbSelect<Pick<StoredUser, "id">>("users", new URLSearchParams({
    select: "id",
    limit: String(maxRegisteredUsers + 1),
  }));
  return rows.length;
}

async function registrationCapacityError(): Promise<AuthFailure | null> {
  const count = await registeredUserCount();
  if (count >= maxRegisteredUsers) return { error: registrationFullMessage, status: 403 };
  return null;
}

async function insertUserWithCapacity(user: StoredUser): Promise<StoredUser | AuthFailure> {
  try {
    const inserted = await dbRpc<StoredUser>("register_user_with_capacity", {
      p_id: user.id,
      p_email: user.email,
      p_name: user.name,
      p_password_salt: user.passwordSalt,
      p_password_hash: user.passwordHash,
      p_auth_version: user.authVersion,
      p_created_at: user.createdAt,
      p_updated_at: user.updatedAt,
      p_max_users: maxRegisteredUsers,
    });
    return inserted[0] ?? user;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("MAX_REGISTERED_USERS_REACHED")) {
      return { error: registrationFullMessage, status: 403 };
    }
    throw error;
  }
}

async function selectUserById(id: string): Promise<StoredUser | null> {
  const rows = await dbSelect<StoredUser>("users", new URLSearchParams({
    select: "*",
    id: `eq.${id}`,
    limit: "1",
  }));
  return rows[0] ?? null;
}

async function pruneAuthRecords(): Promise<void> {
  const emailCodeCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const otpCutoff = new Date(Date.now() - otpWindowMs).toISOString();
  const loginCutoff = new Date(Date.now() - loginWindowMs).toISOString();
  await Promise.all([
    dbDelete("email_codes", { createdAt: `lt.${emailCodeCutoff}` }),
    dbDelete("otp_send_attempts", { createdAt: `lt.${otpCutoff}` }),
    dbDelete("login_attempts", { createdAt: `lt.${loginCutoff}` }),
  ]);
}

async function checkOtpRateLimit(email: string, purpose: StoredEmailCodePurpose, ip: string): Promise<AuthFailure | null> {
  const cutoff = new Date(Date.now() - otpWindowMs).toISOString();
  const emailAttempts = await dbSelect<StoredOtpSendAttempt>("otp_send_attempts", new URLSearchParams({
    select: "id,email,ip,purpose,sent,createdAt",
    email: `eq.${email}`,
    sent: "eq.true",
    createdAt: `gte.${cutoff}`,
    order: "createdAt.desc",
    limit: String(maxOtpSendsPerEmail + 2),
  }));
  const latestForPurpose = emailAttempts.find((item) => item.purpose === purpose);
  if (latestForPurpose && Date.now() - Date.parse(latestForPurpose.createdAt) < codeCooldownMs) {
    return { error: "请等待 60 秒后再次获取验证码。", status: 429 };
  }
  if (emailAttempts.length >= maxOtpSendsPerEmail) {
    return { error: "验证码请求过于频繁，请稍后再试。", status: 429 };
  }
  if (ip !== "unknown") {
    const ipAttempts = await dbSelect<StoredOtpSendAttempt>("otp_send_attempts", new URLSearchParams({
      select: "id",
      ip: `eq.${ip}`,
      createdAt: `gte.${cutoff}`,
      limit: String(maxOtpSendsPerIp + 1),
    }));
    if (ipAttempts.length >= maxOtpSendsPerIp) {
      return { error: "验证码请求过于频繁，请稍后再试。", status: 429 };
    }
  }
  return null;
}

async function recordOtpAttempt(
  id: string,
  email: string,
  purpose: StoredEmailCodePurpose,
  ip: string,
  sent: boolean,
): Promise<void> {
  await dbInsert<StoredOtpSendAttempt>("otp_send_attempts", {
    id,
    email,
    purpose,
    ip,
    sent,
    createdAt: new Date().toISOString(),
  });
}

async function removeUnsentOtpAttempt(id: string): Promise<void> {
  try {
    await dbDelete("otp_send_attempts", { id: `eq.${id}`, sent: "eq.false" });
  } catch (error) {
    console.error("[auth] Failed to remove unsent OTP attempt after email send failure.", error);
  }
}

async function findLatestEmailCode(email: string, purpose: StoredEmailCodePurpose): Promise<StoredEmailCode | null> {
  const rows = await dbSelect<StoredEmailCode>("email_codes", new URLSearchParams({
    select: "*",
    email: `eq.${email}`,
    purpose: `eq.${purpose}`,
    usedAt: "is.null",
    expiresAt: `gt.${new Date().toISOString()}`,
    order: "createdAt.desc",
    limit: "1",
  }));
  return rows[0] ?? null;
}

async function consumeEmailCode(
  email: string,
  purpose: StoredEmailCodePurpose,
  code: string,
): Promise<{ ok: true } | AuthFailure> {
  const record = await findLatestEmailCode(email, purpose);
  if (!record) return { error: "验证码无效或已过期，请重新获取" };
  if (record.attempts >= maxCodeAttempts) {
    await dbUpdate("email_codes", { usedAt: new Date().toISOString() }, { id: `eq.${record.id}`, usedAt: "is.null" });
    return { error: "验证码尝试次数过多，请重新获取" };
  }

  const matches = safeTextEqual(hashEmailCode(email, purpose, code, record.codeSalt), record.codeHash);
  const nextAttempts = record.attempts + 1;
  const updates: Record<string, unknown> = { attempts: nextAttempts };
  if (matches || nextAttempts >= maxCodeAttempts) updates.usedAt = new Date().toISOString();

  const updated = await dbUpdate<StoredEmailCode>("email_codes", updates, new URLSearchParams({
    id: `eq.${record.id}`,
    attempts: `eq.${record.attempts}`,
    usedAt: "is.null",
  }));
  if (!updated.length) return { error: "验证码状态已变化，请重新获取" };
  if (!matches) return nextAttempts >= maxCodeAttempts
    ? { error: "验证码尝试次数过多，请重新获取" }
    : { error: "验证码不正确" };
  return { ok: true };
}

function isSecureRequest(request: Request): boolean {
  const url = new URL(request.url);
  return url.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

export function clientIpFromRequest(request: Request): string {
  // Netlify sets x-nf-client-connection-ip from the edge connection. Other
  // forwarding headers are kept only as compatibility fallbacks for local
  // preview or future platform moves.
  const rawIp = request.headers.get("x-nf-client-connection-ip")
    || request.headers.get("cf-connecting-ip")
    || request.headers.get("eo-connecting-ip")
    || request.headers.get("x-real-ip")
    || request.headers.get("x-vercel-forwarded-for")
    || request.headers.get("x-forwarded-for");
  const firstIp = rawIp?.split(",")[0]?.trim();
  return rateLimitIp(firstIp);
}

export function createSessionCookie(user: Pick<AppUser, "id" | "authVersion">, request: Request): string {
  const parts = [
    `${sessionCookieName}=${createSessionValue(user.id, user.authVersion)}`,
    "Path=/",
    `Max-Age=${sessionMaxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (process.env.NODE_ENV === "production" || isSecureRequest(request)) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${sessionCookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const requestHeaders = await headers();
  const session = parseCookie(requestHeaders.get("cookie"), sessionCookieName);
  const sessionUser = readSessionValue(session);
  if (!sessionUser) return null;
  const user = await selectUserById(sessionUser.userId);
  if (!user) return null;
  const authVersion = Math.max(1, Number(user.authVersion) || 1);
  return authVersion === sessionUser.authVersion ? toPublicUser(user) : null;
});

export async function requireAppUser(returnTo = "/admin"): Promise<AppUser> {
  const user = await getCurrentUser();
  if (user) return user;
  return redirect(`/login?next=${encodeURIComponent(returnTo)}`);
}

export async function registerUser(payload: Record<string, unknown>): Promise<AppUser | AuthFailure> {
  const email = normalizeEmail(payload.email);
  const name = clean(payload.name, 80) || email.split("@")[0] || "新作者";
  const password = readPassword(payload.password, "密码");
  const code = normalizeCode(payload.code);
  if (!emailPattern.test(email)) return { error: "请输入有效的邮箱地址。" };
  if (typeof password !== "string") return password;
  if (!codePattern.test(code)) return { error: "请填写六位邮箱验证码" };

  if (await selectUserByEmail(email)) return { error: "这个邮箱已经注册，可以直接登录" };
  const capacityError = await registrationCapacityError();
  if (capacityError) return capacityError;

  const codeResult = await consumeEmailCode(email, "register", code);
  if ("error" in codeResult) return codeResult;

  const now = new Date().toISOString();
  const salt = randomBytes(16).toString("base64url");
  const user: StoredUser = {
    id: randomBytes(16).toString("base64url"),
    name,
    email,
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
    authVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
  const inserted = await insertUserWithCapacity(user);
  if ("error" in inserted) return inserted;
  return toPublicUser(inserted);
}

export async function loginUser(payload: Record<string, unknown>, meta: RequestMeta = {}): Promise<AppUser | AuthFailure> {
  const email = normalizeEmail(payload.email);
  const password = readLoginPassword(payload.password);
  const ip = normalizeIp(meta.ip);
  if (!email || typeof password !== "string") return typeof password === "string" ? { error: "请填写邮箱和密码" } : password;
  const rateEmail = rateLimitEmail(email);
  const cutoff = new Date(Date.now() - loginWindowMs).toISOString();

  await pruneAuthRecords();
  const emailFailures = await dbSelect<StoredLoginAttempt>("login_attempts", new URLSearchParams({
    select: "id",
    email: `eq.${rateEmail}`,
    success: "eq.false",
    createdAt: `gte.${cutoff}`,
    limit: String(maxLoginFailuresPerEmail + 1),
  }));
  let ipFailureCount = 0;
  if (ip !== "unknown") {
    const ipFailures = await dbSelect<StoredLoginAttempt>("login_attempts", new URLSearchParams({
      select: "id",
      ip: `eq.${ip}`,
      success: "eq.false",
      createdAt: `gte.${cutoff}`,
      limit: String(maxLoginFailuresPerIp + 1),
    }));
    ipFailureCount = ipFailures.length;
  }
  if (emailFailures.length >= maxLoginFailuresPerEmail || ipFailureCount >= maxLoginFailuresPerIp) {
    return { error: "登录尝试过多，请十五分钟后再试", status: 429 };
  }

  const user = await selectUserByEmail(email);
  const passwordMatches = user
    ? verifyPassword(password, user.passwordSalt, user.passwordHash)
    : (verifyPassword(password, dummyPasswordSalt, dummyPasswordHash) && false);
  if (!emailPattern.test(email) || !user || !passwordMatches) {
    await dbInsert<StoredLoginAttempt>("login_attempts", {
      id: randomBytes(16).toString("base64url"),
      email: rateEmail,
      ip,
      success: false,
      createdAt: new Date().toISOString(),
    });
    return { error: "邮箱或密码不正确" };
  }

  await dbDelete("login_attempts", { email: `eq.${rateEmail}` });
  return toPublicUser(user);
}

export async function requestVerificationCode(
  payload: Record<string, unknown>,
  meta: RequestMeta = {},
): Promise<{ ok: true; message: string; devCode?: string } | AuthFailure> {
  const startedAt = Date.now();
  const purpose = parsePurpose(payload.purpose);
  const email = normalizeEmail(payload.email);
  const ip = normalizeIp(meta.ip);
  if (!purpose) return { error: "验证码用途无效" };
  if (!emailPattern.test(email)) return { error: "请输入有效的邮箱地址。" };
  const rateEmail = rateLimitEmail(email);

  await pruneAuthRecords();
  const user = await selectUserByEmail(email);
  if (purpose === "register") {
    if (user) return { error: "这个邮箱已经注册，可以直接登录" };
    const capacityError = await registrationCapacityError();
    if (capacityError) return capacityError;
  }
  const rateLimit = await checkOtpRateLimit(rateEmail, purpose, ip);
  if (rateLimit) return rateLimit;

  const attemptId = randomBytes(16).toString("base64url");
  await recordOtpAttempt(attemptId, rateEmail, purpose, ip, false);

  if (purpose === "reset" && !user) {
    await padResetCodeResponse(startedAt);
    return { ok: true, message: "如果该邮箱存在，我们已发送验证码，请查看邮箱。" };
  }

  const code = createEmailCode();
  const salt = randomBytes(16).toString("base64url");
  const sendResult = await sendVerificationEmail(email, code, purpose);
  if ("error" in sendResult) {
    await removeUnsentOtpAttempt(attemptId);
    if (purpose === "reset") {
      console.error("[auth] Reset verification email was not sent; check SES configuration and server logs.");
      await padResetCodeResponse(startedAt);
      return { ok: true, message: "如果该邮箱存在，我们已发送验证码，请查看邮箱。" };
    }
    return sendResult;
  }

  await dbUpdate("otp_send_attempts", { sent: true }, { id: `eq.${attemptId}` });
  await dbDelete("email_codes", new URLSearchParams({
    email: `eq.${email}`,
    purpose: `eq.${purpose}`,
    usedAt: "is.null",
  }));
  const now = new Date();
  await dbInsert<StoredEmailCode>("email_codes", {
    id: randomBytes(16).toString("base64url"),
    email,
    purpose,
    codeSalt: salt,
    codeHash: hashEmailCode(email, purpose, code, salt),
    attempts: 0,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + codeMaxAgeMs).toISOString(),
    usedAt: null,
  });

  if (purpose === "reset") await padResetCodeResponse(startedAt);
  return {
    ok: true,
    message: purpose === "reset" ? "如果该邮箱存在，我们已发送验证码，请查看邮箱。" : sendResult.message,
    devCode: sendResult.devCode,
  };
}

export async function resetPassword(payload: Record<string, unknown>): Promise<{ ok: true } | AuthFailure> {
  const email = normalizeEmail(payload.email);
  const password = readPassword(payload.password, "新密码");
  const code = normalizeCode(payload.code);
  if (!emailPattern.test(email)) return { error: "请输入有效的邮箱地址。" };
  if (typeof password !== "string") return password;
  if (!codePattern.test(code)) return { error: "请填写六位邮箱验证码" };

  const user = await selectUserByEmail(email);
  if (!user) return { error: "验证码无效或已过期，请重新获取" };
  const codeResult = await consumeEmailCode(email, "reset", code);
  if ("error" in codeResult) return codeResult;

  const salt = randomBytes(16).toString("base64url");
  const updated = await dbUpdate<StoredUser>("users", {
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
    authVersion: Math.max(1, Number(user.authVersion) || 1) + 1,
    updatedAt: new Date().toISOString(),
  }, { id: `eq.${user.id}` });
  return updated.length ? { ok: true } : { error: "密码重置失败，请稍后再试" };
}
