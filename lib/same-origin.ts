const productionOrigin = "https://cblworks.site";
const noStoreHeaders = { "cache-control": "no-store" };

function isLocalDevelopmentOrigin(origin: URL): boolean {
  return process.env.NODE_ENV !== "production"
    && (origin.hostname === "localhost" || origin.hostname === "127.0.0.1" || origin.hostname === "[::1]")
    && (origin.protocol === "http:" || origin.protocol === "https:");
}

function rejection(): Response {
  return Response.json({ error: "跨站请求已被拒绝" }, { status: 403, headers: noStoreHeaders });
}

/**
 * Reject obvious cross-site browser mutations without blocking trusted
 * server-to-server callers that legitimately omit browser fetch metadata.
 */
export function assertSameOrigin(request: Request): Response | null {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return rejection();

  const rawOrigin = request.headers.get("origin");
  if (!rawOrigin) return null;

  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    return rejection();
  }

  if (origin.origin === productionOrigin || isLocalDevelopmentOrigin(origin)) return null;
  return rejection();
}
