import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("lets upload-sized multipart requests reach the image route", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("upload-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const boundary = "upload-limit-test";
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="images"; filename="test.png"',
    "Content-Type: image/png",
    "",
    "x",
    `--${boundary}--`,
    "",
  ].join("\r\n");

  const response = await worker.fetch(
    new Request("http://localhost/api/admin/projects/1/images", {
      method: "POST",
      headers: {
        "content-length": String(2 * 1024 * 1024),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "请先登录" });
});

test("maps built CSS asset URLs to files for the Node starter", async () => {
  const cssFile = (await readdir(path.join(root, "dist", "client", "assets")))
    .find((file) => file.endsWith(".css"));
  assert.ok(cssFile);

  const serverUrl = new URL("../scripts/start-node.mjs", import.meta.url);
  serverUrl.searchParams.set("static-test", `${process.pid}-${Date.now()}`);
  const { findStaticAsset } = await import(serverUrl.href);
  const asset = await findStaticAsset(
    `/assets/${cssFile}`,
    path.join(root, "dist", "client"),
  );

  assert.ok(asset);
  assert.equal(asset.contentType, "text/css; charset=utf-8");
  assert.match(asset.filePath, /dist[\\/]client[\\/]assets/);
});
