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
  assert.match(mediaRoute, /createImageReadUrl/);
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
    "app/api/admin/uploads/sign/route.ts",
    "app/work/page.tsx",
    "app/work/[slug]/page.tsx",
  ].map((path) => access(new URL(`../${path}`, import.meta.url))));
});
