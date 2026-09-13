/**
 * Server-only Supabase access layer.
 *
 * This project intentionally keeps Supabase credentials on the server and uses
 * Supabase only for PostgreSQL + private object storage. Authentication remains
 * the app's existing email/password + signed HttpOnly session flow.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const jsonHeaders = { "content-type": "application/json" };

type QueryParams = URLSearchParams | Record<string, string>;
type SupabaseErrorLike = {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};
type SupabaseResult<T> = {
  data: T | null;
  error: SupabaseErrorLike | null;
  status?: number;
};
type MutationRows = Record<string, unknown> | Record<string, unknown>[];
type QueryBuilder = {
  eq(column: string, value: string): QueryBuilder;
  neq(column: string, value: string): QueryBuilder;
  gt(column: string, value: string): QueryBuilder;
  gte(column: string, value: string): QueryBuilder;
  lt(column: string, value: string): QueryBuilder;
  lte(column: string, value: string): QueryBuilder;
  is(column: string, value: null | boolean): QueryBuilder;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder;
  limit(count: number): QueryBuilder;
  then<TResult1 = SupabaseResult<unknown[]>, TResult2 = never>(
    onfulfilled?: ((value: SupabaseResult<unknown[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

let cachedClient: SupabaseClient | null = null;
let cachedClientConfig = "";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required ${name}.`);
  return value;
}

function config() {
  const url = requireEnv("SUPABASE_URL").replace(/\/+$/, "");
  const key = requireEnv("SUPABASE_SECRET_KEY");
  const bucket = (process.env.SUPABASE_STORAGE_BUCKET || "portfolio-media").trim();
  return { url, key, bucket };
}

function adminHeaders(extra?: HeadersInit): Headers {
  const { key } = config();
  const headers = new Headers(extra);
  headers.set("apikey", key);
  return headers;
}

function supabaseServerClient(): SupabaseClient {
  const { url, key } = config();
  const cacheKey = `${url}\n${key}`;
  if (cachedClient && cachedClientConfig === cacheKey) return cachedClient;

  cachedClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        headers.delete("authorization");
        return fetch(input, { ...init, headers });
      },
    },
  });
  cachedClientConfig = cacheKey;
  return cachedClient;
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

function paramsEntries(params?: QueryParams): [string, string][] {
  if (params instanceof URLSearchParams) {
    return [...params.entries()];
  }
  return params ? Object.entries(params) : [];
}

function applyQueryParams(builder: QueryBuilder, params?: QueryParams): QueryBuilder {
  let query = builder;
  for (const [key, value] of paramsEntries(params)) {
    if (key === "select") continue;
    if (key === "limit") {
      const count = Number(value);
      if (Number.isInteger(count) && count >= 0) query = query.limit(count);
      continue;
    }
    if (key === "order") {
      for (const item of value.split(",").map((part) => part.trim()).filter(Boolean)) {
        const [column, direction] = item.split(".");
        if (column) query = query.order(column, { ascending: direction !== "desc" });
      }
      continue;
    }

    const separator = value.indexOf(".");
    const operator = separator === -1 ? "eq" : value.slice(0, separator);
    const operand = separator === -1 ? value : value.slice(separator + 1);
    if (operator === "eq") query = query.eq(key, operand);
    else if (operator === "neq") query = query.neq(key, operand);
    else if (operator === "gt") query = query.gt(key, operand);
    else if (operator === "gte") query = query.gte(key, operand);
    else if (operator === "lt") query = query.lt(key, operand);
    else if (operator === "lte") query = query.lte(key, operand);
    else if (operator === "is") {
      const value = operand === "null" ? null : operand === "true";
      query = query.is(key, value);
    } else {
      throw new Error(`Unsupported Supabase filter operator: ${operator}`);
    }
  }
  return query;
}

function selectColumns(params?: QueryParams): string {
  return paramsEntries(params).find(([key]) => key === "select")?.[1] || "*";
}

function dataOrThrow<T>(result: SupabaseResult<T[]>, label: string): T[] {
  if (result.error) {
    const message = result.error.message || result.error.details || result.error.hint || result.error.code || "unknown error";
    throw new Error(`${label} failed (${result.status ?? "unknown"}): ${message.slice(0, 500)}`);
  }
  return result.data ?? [];
}

export async function dbSelect<T>(table: string, params: QueryParams = { select: "*" }): Promise<T[]> {
  const query = applyQueryParams(
    supabaseServerClient().from(table).select(selectColumns(params)) as unknown as QueryBuilder,
    params,
  );
  const result = await query as SupabaseResult<T[]>;
  return dataOrThrow<T>(result, `Supabase select ${table}`);
}

export async function dbInsert<T>(table: string, rows: unknown): Promise<T[]> {
  const result = await supabaseServerClient()
    .from(table)
    .insert(rows as MutationRows)
    .select() as SupabaseResult<T[]>;
  return dataOrThrow<T>(result, `Supabase insert ${table}`);
}

export async function dbUpsert<T>(
  table: string,
  rows: unknown,
  onConflict: string,
): Promise<T[]> {
  const result = await supabaseServerClient()
    .from(table)
    .upsert(rows as MutationRows, { onConflict })
    .select() as SupabaseResult<T[]>;
  return dataOrThrow<T>(result, `Supabase upsert ${table}`);
}

export async function dbUpdate<T>(
  table: string,
  values: unknown,
  params: QueryParams,
): Promise<T[]> {
  const query = applyQueryParams(
    supabaseServerClient().from(table).update(values as Record<string, unknown>).select() as unknown as QueryBuilder,
    params,
  );
  const result = await query as SupabaseResult<T[]>;
  return dataOrThrow<T>(result, `Supabase update ${table}`);
}

export async function dbDelete<T>(
  table: string,
  params: QueryParams,
): Promise<T[]> {
  const query = applyQueryParams(
    supabaseServerClient().from(table).delete().select() as unknown as QueryBuilder,
    params,
  );
  const result = await query as SupabaseResult<T[]>;
  return dataOrThrow<T>(result, `Supabase delete ${table}`);
}

export async function dbRpc<T>(name: string, args: Record<string, unknown>): Promise<T[]> {
  const result = await supabaseServerClient()
    .rpc(name, args) as SupabaseResult<T[]>;
  return dataOrThrow<T>(result, `Supabase rpc ${name}`);
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

export async function downloadStorageObjectRange(
  path: string,
  start = 0,
  end = 4095,
): Promise<{ body: Buffer; contentType: string; contentLength: number | null }> {
  const response = await fetch(`${storageBase()}/object/${bucketPath(path)}`, {
    headers: adminHeaders({ range: `bytes=${start}-${end}` }),
    cache: "no-store",
  });
  if (!response.ok && response.status !== 206) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Supabase range download object failed (${response.status}): ${detail}`);
  }
  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "application/octet-stream",
    contentLength: Number(response.headers.get("content-length")) || null,
  };
}

export async function getStorageObjectInfo(path: string): Promise<{ contentType: string; contentLength: number | null }> {
  const response = await fetch(`${storageBase()}/object/${bucketPath(path)}`, {
    method: "HEAD",
    headers: adminHeaders(),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Supabase object info failed (${response.status}): ${detail}`);
  }
  return {
    contentType: response.headers.get("content-type") || "application/octet-stream",
    contentLength: Number(response.headers.get("content-length")) || null,
  };
}

export async function uploadStorageObject(
  path: string,
  body: Buffer,
  contentType: string,
  cacheControl = "private, max-age=600",
): Promise<void> {
  // Node.js Buffer is valid at runtime for fetch, but newer DOM typings used by
  // Next.js/Netlify do not accept Buffer<ArrayBufferLike> as BodyInit. Copy the
  // bytes into a plain Uint8Array backed by ArrayBuffer so both the runtime and
  // TypeScript agree on the request body type.
  const payload = new Uint8Array(body.byteLength);
  payload.set(body);

  const response = await fetch(`${storageBase()}/object/${bucketPath(path)}`, {
    method: "POST",
    headers: adminHeaders({
      "cache-control": cacheControl,
      "content-type": contentType,
      "x-upsert": "false",
    }),
    body: payload,
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Supabase upload object failed (${response.status}): ${detail}`);
  }
}

export async function moveStorageObject(fromPath: string, toPath: string): Promise<void> {
  const { bucket } = config();
  const response = await fetch(`${storageBase()}/object/move`, {
    method: "POST",
    headers: adminHeaders(jsonHeaders),
    body: JSON.stringify({
      bucketId: bucket,
      sourceKey: fromPath.replace(/^\/+/, ""),
      destinationKey: toPath.replace(/^\/+/, ""),
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Supabase move object failed (${response.status}): ${detail}`);
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

export async function createSignedStorageReadUrls(paths: string[], expiresIn = 600): Promise<Map<string, string>> {
  const normalized = [...new Set(paths.map((item) => item.replace(/^\/+/, "")).filter(Boolean))];
  const signed = new Map<string, string>();
  if (!normalized.length) return signed;
  const { bucket } = config();
  const response = await fetch(`${storageBase()}/object/sign/${encodeURIComponent(bucket)}`, {
    method: "POST",
    headers: adminHeaders(jsonHeaders),
    body: JSON.stringify({ expiresIn, paths: normalized }),
    cache: "no-store",
  });
  const data = await parseJsonResponse<{ path: string; signedURL?: string; signedUrl?: string | null; error?: string }[]>(
    response,
    "Supabase create signed read URLs",
  );
  for (const item of data) {
    const signedUrl = item.signedURL || item.signedUrl;
    if (!item.path || !signedUrl || item.error) continue;
    signed.set(item.path.replace(/^\/+/, ""), encodeURI(signedUrl.startsWith("http") ? signedUrl : `${storageBase()}${signedUrl}`));
  }
  return signed;
}

export function supabaseStorageBucketName(): string {
  return config().bucket;
}
