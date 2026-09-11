import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

const contentTypes = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const distDir = path.join(projectRoot, "dist");
const clientDir = path.join(distDir, "client");
const serverEntry = path.join(distDir, "server", "index.js");

function readArg(name) {
  const long = `--${name}`;
  const prefix = `${long}=`;
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (value === long) return process.argv[index + 1];
    if (value.startsWith(prefix)) return value.slice(prefix.length);
  }
  return "";
}

function isGetLike(method) {
  return method === "GET" || method === "HEAD";
}

function safeHeaders(headers) {
  const result = {};
  for (const [key, value] of headers) {
    if (key.toLowerCase() !== "set-cookie") result[key] = value;
  }
  const cookies = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  if (cookies.length) result["set-cookie"] = cookies;
  const fallbackCookie = headers.get("set-cookie");
  if (!cookies.length && fallbackCookie) result["set-cookie"] = fallbackCookie;
  return result;
}

function securityHeaders(request) {
  const headers = {
    "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
  const forwardedProto = request?.headers?.["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  if (process.env.NODE_ENV === "production" && (process.env.ENABLE_HSTS === "1" || protocol === "https")) {
    headers["Strict-Transport-Security"] = "max-age=15552000; includeSubDomains";
  }
  return headers;
}

function withSecurityHeaders(headers, request) {
  return {
    ...headers,
    ...securityHeaders(request),
  };
}

function assertProductionSecret() {
  if (process.env.NODE_ENV !== "production") return;
  if (typeof process.env.APP_SECRET === "string" && process.env.APP_SECRET.length >= 24) return;
  console.error("生产环境缺少 APP_SECRET，或 APP_SECRET 少于 24 个字符。请配置后再启动。");
  process.exit(1);
}

export async function findStaticAsset(pathname, root = clientDir) {
  if (!pathname || pathname === "/" || pathname.includes("\0")) return null;
  if (pathname.startsWith("/api/") || pathname.startsWith("/_vinext/")) return null;

  let decodedPathname;
  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const normalizedPathname = decodedPathname.replaceAll("\\", "/");
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, `.${normalizedPathname}`);
  const rootPrefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  if (candidate !== resolvedRoot && !candidate.startsWith(rootPrefix)) return null;

  try {
    const fileStat = await stat(candidate);
    if (!fileStat.isFile()) return null;
    const ext = path.extname(candidate).toLowerCase();
    return {
      filePath: candidate,
      contentLength: fileStat.size,
      contentType: contentTypes[ext] ?? "application/octet-stream",
      cacheControl: normalizedPathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600",
    };
  } catch {
    return null;
  }
}

async function serveStaticAsset(request, response, pathname) {
  const asset = await findStaticAsset(pathname);
  if (!asset) return false;

  response.writeHead(200, {
    ...securityHeaders(request),
    "Cache-Control": asset.cacheControl,
    "Content-Length": String(asset.contentLength),
    "Content-Type": asset.contentType,
  });
  if (request.method === "HEAD") {
    response.end();
    return true;
  }
  createReadStream(asset.filePath).pipe(response);
  return true;
}

function createExecutionContext() {
  return {
    waitUntil(promise) {
      Promise.resolve(promise).catch((error) => console.error(error));
    },
    passThroughOnException() {},
  };
}

function nodeRequestToWebRequest(request, host, port) {
  const protoHeader = request.headers["x-forwarded-proto"];
  const protocol = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader || "http";
  const requestHost = request.headers.host || `${host}:${port}`;
  const url = new URL(request.url || "/", `${protocol}://${requestHost}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  return new Request(url, {
    method: request.method,
    headers,
    body: isGetLike(request.method) ? undefined : Readable.toWeb(request),
    duplex: isGetLike(request.method) ? undefined : "half",
  });
}

async function sendWebResponse(webResponse, nodeRequest, nodeResponse) {
  nodeResponse.writeHead(webResponse.status, withSecurityHeaders(safeHeaders(webResponse.headers), nodeRequest));
  if (nodeRequest.method === "HEAD" || !webResponse.body) {
    nodeResponse.end();
    return;
  }
  Readable.fromWeb(webResponse.body).pipe(nodeResponse);
}

async function start() {
  assertProductionSecret();

  if (!existsSync(serverEntry)) {
    console.error("没有找到构建结果，请先运行 npm run build。");
    process.exit(1);
  }

  const host = readArg("host") || process.env.HOST || "0.0.0.0";
  const port = Number(readArg("port") || process.env.PORT || 3000);
  const imported = await import(`${pathToFileURL(serverEntry).href}?t=${Date.now()}`);
  const worker = imported.default;
  const handleFetch = typeof worker === "function"
    ? (request) => worker(request)
    : (request) => worker.fetch(request, process.env, createExecutionContext());

  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`).pathname;
      if (isGetLike(request.method) && await serveStaticAsset(request, response, pathname)) return;
      const webRequest = nodeRequestToWebRequest(request, host, port);
      const webResponse = await handleFetch(webRequest);
      await sendWebResponse(webResponse, request, response);
    } catch (error) {
      console.error(error);
      if (!response.headersSent) {
        response.writeHead(500, withSecurityHeaders({ "Content-Type": "text/plain; charset=utf-8" }, request));
        response.end("服务器暂时无法响应。");
      } else {
        response.destroy(error);
      }
    }
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  console.log(`Portfolio server running at http://${host}:${actualPort}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start();
}
