import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Vercel build uses standard Next.js", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(pkg.scripts.build, "next build");
  assert.equal(pkg.scripts.start, "next start");
});

test("runtime persistence uses Supabase instead of local JSON/files", async () => {
  const auth = await read("lib/auth.ts");
  const portfolio = await read("lib/portfolio.ts");
  const profile = await read("lib/profile.ts");
  const media = await read("lib/file-media.ts");
  for (const source of [auth, portfolio, profile]) {
    assert.match(source, /@\/lib\/supabase/);
    assert.doesNotMatch(source, /readStore|updateStore/);
  }
  assert.match(media, /createSignedStorageUpload/);
  assert.doesNotMatch(media, /node:fs\/promises/);
});

test("large images use direct signed upload and signed private reads", async () => {
  const manager = await read("components/admin-manager.tsx");
  const mediaRoute = await read("app/api/media/[key]/route.ts");
  assert.match(manager, /stageImageUpload/);
  assert.match(manager, /ticket\.signedUrl/);
  assert.match(manager, /method: "PUT"/);
  assert.match(mediaRoute, /createMediaReadUrl/);
  assert.match(mediaRoute, /status: 307/);
});

test("passwords remain hashed and session cookies remain HttpOnly", async () => {
  const auth = await read("lib/auth.ts");
  assert.match(auth, /scryptSync/);
  assert.match(auth, /passwordHash/);
  assert.match(auth, /HttpOnly/);
  assert.match(auth, /authVersion/);
});

test("required Vercel and Supabase files exist", async () => {
  await Promise.all([
    "supabase/migrations/001_initial.sql",
    "supabase/migrations/002_registration_capacity.sql",
    "supabase/migrations/003_project_videos.sql",
    "app/api/admin/uploads/sign/route.ts",
    "app/api/admin/projects/[id]/videos/route.ts",
    "app/api/admin/videos/[id]/route.ts",
    "app/work/page.tsx",
    "app/work/[slug]/page.tsx",
  ].map((path) => access(new URL(`../${path}`, import.meta.url))));
});

test("video uploads stay private and server validated", async () => {
  const [media, signRoute, migration, portfolio] = await Promise.all([
    read("lib/file-media.ts"),
    read("app/api/admin/uploads/sign/route.ts"),
    read("supabase/migrations/003_project_videos.sql"),
    read("lib/portfolio.ts"),
  ]);

  assert.match(media, /allowedVideoTypes/);
  assert.match(media, /const maxVideoBytes = 200 \* 1024 \* 1024/);
  assert.match(media, /detectVideo/);
  assert.match(media, /finalizeVideoUpload/);
  assert.match(signRoute, /payload\.kind === "video"/);
  assert.match(portfolio, /project_videos/);
  assert.match(migration, /public\.project_videos/);
  assert.match(migration, /video\/mp4/);
  assert.match(migration, /209715200/);
});

test("image uploads tolerate mobile JPG MIME aliases while still validating bytes", async () => {
  const [media, manager] = await Promise.all([
    read("lib/file-media.ts"),
    read("components/admin-manager.tsx"),
  ]);

  assert.match(media, /image\/jpg/);
  assert.match(media, /image\/pjpeg/);
  assert.match(media, /imageExtensionFromName/);
  assert.match(media, /detectImage\(original\)/);
  assert.doesNotMatch(media, /图片实际格式与文件类型不一致/);
  assert.match(manager, /imageNamePattern/);
  assert.match(manager, /normalizedFileType/);
});

test("registration uses open email signups with a race-safe 20-user cap", async () => {
  const [auth, migration, envExample] = await Promise.all([
    read("lib/auth.ts"),
    read("supabase/migrations/002_registration_capacity.sql"),
    read(".env.example"),
  ]);

  assert.doesNotMatch(auth, /ALLOWED_EMAILS|allowedEmailSet|registrationAccessError|REGISTRATION_CODE/);
  assert.doesNotMatch(envExample, /ALLOWED_EMAILS|REGISTRATION_CODE/);
  assert.match(auth, /const maxRegisteredUsers = 20/);
  assert.match(auth, /register_user_with_capacity/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /select count\(\*\) from public\.users/);
  assert.match(migration, /MAX_REGISTERED_USERS_REACHED/);
});

test("OTP send limits use the 10-minute window and no one-hour lockout", async () => {
  const auth = await read("lib/auth.ts");

  assert.match(auth, /const codeCooldownMs = 60 \* 1000/);
  assert.match(auth, /const otpWindowMs = 10 \* 60 \* 1000/);
  assert.match(auth, /const maxOtpSendsPerEmail = 5/);
  assert.match(auth, /sent:\s*"eq\.true"/);
  assert.match(auth, /请等待 60 秒后再次获取验证码。/);
  assert.match(auth, /验证码请求过于频繁，请稍后再试。/);
  assert.doesNotMatch(auth, /一小时后再试|请填写有效邮箱|白名单|注册名单/);
});
