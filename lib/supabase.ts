/**
 * Server-only Supabase access layer.
 *
 * This project intentionally keeps Supabase credentials on the server and uses
 * Supabase only for PostgreSQL + private object storage. Authentication remains
 * the app's existing email/password + signed HttpOnly session flow.
 */

const jsonHeaders = { "content-type": "application/json" };

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required ${name}.`);
  return value;
}

function config() {
  const url = requireEnv("SUPABASE_URL").replace(/\/+$/, "");
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!key) throw new Error("Missing required SUPABASE_SECRET_KEY.");
  const bucket = (process.env.SUPABASE_STORAGE_BUCKET || "portfolio-media").trim();
  return { url, key, bucket };
}

function adminHeaders(extra?: HeadersInit): Headers {
  const { key } = config();
  const headers = new Headers(extra);
  headers.set("apikey", key);
  // New sb_secret_* keys are API keys, not JWTs, and must not be sent as
  // Authorization: Bearer. Keep Bearer only for the legacy service_role JWT.
  if (!key.startsWith("sb_secret_")) headers.set("authorization", `Bearer ${key}`);
  return headers;
}

async function parseJsonResponse<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try {
      const payload = JSON.parse(text) as { message?: string; error?: string; details?: string };
      detail = payload.message || payload.error || payload.details || text;
    } catch {
      // Keep the original response text.
    }
    throw new Error(`${label} failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

function restUrl(table: string, params?: URLSearchParams | Record<string, string>): string {
  const { url } = config();
  const target = new URL(`${url}/rest/v1/${encodeURIComponent(table)}`);
  if (params instanceof URLSearchParams) {
    for (const [key, value] of params) target.searchParams.append(key, value);
  } else if (params) {
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  }
  return target.toString();
}

export async function dbSelect<T>(
  table: string,
  params: URLSearchParams | Record<string, string> = { select: "*" },
): Promise<T[]> {
  const response = await fetch(restUrl(table, params), {
    headers: adminHeaders({ accept: "application/json" }),
    cache: "no-store",
  });
  return parseJsonResponse<T[]>(response, `Supabase select ${table}`);
}

export async function dbInsert<T>(table: string, rows: unknown): Promise<T[]> {
  const response = await fetch(restUrl(table), {
    method: "POST",
    headers: adminHeaders({
      ...jsonHeaders,
      accept: "application/json",
      prefer: "return=representation",
    }),
    body: JSON.stringify(rows),
    cache: "no-store",
  });
  return parseJsonResponse<T[]>(response, `Supabase insert ${table}`);
}

export async function dbUpsert<T>(
  table: string,
  rows: unknown,
  onConflict: string,
): Promise<T[]> {
  const params = new URLSearchParams({ on_conflict: onConflict });
  const response = await fetch(restUrl(table, params), {
    method: "POST",
    headers: adminHeaders({
      ...jsonHeaders,
      accept: "application/json",
      prefer: "resolution=merge-duplicates,return=representation",
    }),
    body: JSON.stringify(rows),
    cache: "no-store",
  });
  return parseJsonResponse<T[]>(response, `Supabase upsert ${table}`);
}

export async function dbUpdate<T>(
  table: string,
  values: unknown,
  params: URLSearchParams | Record<string, string>,
): Promise<T[]> {
  const response = await fetch(restUrl(table, params), {
    method: "PATCH",
    headers: adminHeaders({
      ...jsonHeaders,
      accept: "application/json",
      prefer: "return=representation",
    }),
    body: JSON.stringify(values),
    cache: "no-store",
  });
  return parseJsonResponse<T[]>(response, `Supabase update ${table}`);
}

export async function dbDelete<T>(
  table: string,
  params: URLSearchParams | Record<string, string>,
): Promise<T[]> {
  const response = await fetch(restUrl(table, params), {
    method: "DELETE",
    headers: adminHeaders({
      accept: "application/json",
      prefer: "return=representation",
    }),
    cache: "no-store",
  });
  return parseJsonResponse<T[]>(response, `Supabase delete ${table}`);
}

function storageBase(): string {
  return `${config().url}/storage/v1`;
}

function encodeStoragePath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function bucketPath(path: string): string {
  const { bucket } = config();
  return `${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`;
}

export async function createSignedStorageUpload(path: string): Promise<{ signedUrl: string; token: string }> {
  const response = await fetch(`${storageBase()}/object/upload/sign/${bucketPath(path)}`, {
    method: "POST",
    headers: adminHeaders(jsonHeaders),
    body: "{}",
    cache: "no-store",
  });
  const data = await parseJsonResponse<{ url: string }>(response, "Supabase create signed upload URL");
  const signedUrl = new URL(`${storageBase()}${data.url}`);
  const token = signedUrl.searchParams.get("token");
  if (!token) throw new Error("Supabase signed upload URL did not contain a token.");
  return { signedUrl: signedUrl.toString(), token };
}

export async function downloadStorageObject(path: string): Promise<{ body: Buffer; contentType: string }> {
  const response = await fetch(`${storageBase()}/object/${bucketPath(path)}`, {
    headers: adminHeaders(),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Supabase download object failed (${response.status}): ${detail}`);
  }
  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
}

export async function uploadStorageObject(path: string, body: Buffer, contentType: string): Promise<void> {
  const response = await fetch(`${storageBase()}/object/${bucketPath(path)}`, {
    method: "POST",
    headers: adminHeaders({
      "cache-control": "private, max-age=0, no-store",
      "content-type": contentType,
      "x-upsert": "false",
    }),
    body,
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Supabase upload object failed (${response.status}): ${detail}`);
  }
}

export async function removeStorageObjects(paths: string[]): Promise<void> {
  const normalized = [...new Set(paths.map((item) => item.replace(/^\/+/, "")).filter(Boolean))];
  if (!normalized.length) return;
  const { bucket } = config();
  const response = await fetch(`${storageBase()}/object/${encodeURIComponent(bucket)}`, {
    method: "DELETE",
    headers: adminHeaders(jsonHeaders),
    body: JSON.stringify({ prefixes: normalized }),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Supabase remove object failed (${response.status}): ${detail}`);
  }
}

export async function createSignedStorageReadUrl(path: string, expiresIn = 60): Promise<string> {
  const response = await fetch(`${storageBase()}/object/sign/${bucketPath(path)}`, {
    method: "POST",
    headers: adminHeaders(jsonHeaders),
    body: JSON.stringify({ expiresIn }),
    cache: "no-store",
  });
  const data = await parseJsonResponse<{ signedURL: string }>(response, "Supabase create signed read URL");
  return encodeURI(`${storageBase()}${data.signedURL}`);
}

export function supabaseStorageBucketName(): string {
  return config().bucket;
}
