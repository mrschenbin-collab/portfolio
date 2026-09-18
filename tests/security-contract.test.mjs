import assert from "node:assert/strict";
import { readFile, access, readdir } from "node:fs/promises";
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
  const [manager, mediaRoute, supabase, portfolio, profile] = await Promise.all([
    read("components/admin-manager.tsx"),
    read("app/api/media/[key]/route.ts"),
    read("lib/supabase.ts"),
    read("lib/portfolio.ts"),
    read("lib/profile.ts"),
  ]);
  assert.match(manager, /stageImageUpload/);
  assert.match(manager, /ticket\.signedUrl/);
  assert.match(manager, /method: "PUT"/);
  assert.match(supabase, /createSignedStorageReadUrls/);
  assert.match(portfolio, /withSignedMediaUrls/);
  assert.match(profile, /withSignedProfileUrls/);
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
    "supabase/migrations/005_restrict_registration_rpc.sql",
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
  assert.match(media, /getStorageObjectInfo/);
  assert.match(media, /downloadStorageObjectRange/);
  assert.match(media, /moveStorageObject/);
  assert.doesNotMatch(media, /const temporary = await downloadStorageObject\(normalizedTempKey\);\s*if \(temporary\.body\.length > maxVideoBytes\)/);
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
  const [auth, migration, rpcRestrictionMigration, envExample] = await Promise.all([
    read("lib/auth.ts"),
    read("supabase/migrations/002_registration_capacity.sql"),
    read("supabase/migrations/005_restrict_registration_rpc.sql"),
    read(".env.example"),
  ]);

  assert.doesNotMatch(auth, /ALLOWED_EMAILS|allowedEmailSet|registrationAccessError|REGISTRATION_CODE/);
  assert.doesNotMatch(envExample, /ALLOWED_EMAILS|REGISTRATION_CODE/);
  assert.match(auth, /const maxRegisteredUsers = 20/);
  assert.match(auth, /register_user_with_capacity/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /select count\(\*\) from public\.users/);
  assert.match(migration, /MAX_REGISTERED_USERS_REACHED/);
  assert.match(rpcRestrictionMigration, /revoke execute on function public\.register_user_with_capacity/);
  assert.match(rpcRestrictionMigration, /from anon/);
  assert.match(rpcRestrictionMigration, /from authenticated/);
  assert.match(rpcRestrictionMigration, /grant execute on function public\.register_user_with_capacity[\s\S]*to service_role/);
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

test("rate limits prefer Netlify client IP header in production", async () => {
  const auth = await read("lib/auth.ts");

  assert.match(auth, /x-nf-client-connection-ip/);
  assert.ok(auth.indexOf("x-nf-client-connection-ip") < auth.indexOf("x-forwarded-for"));
});

test("list and next-project routes use lightweight media queries", async () => {
  const [portfolio, work, archive, workDetail, community, communityDetail, projectIndex] = await Promise.all([
    read("lib/portfolio.ts"),
    read("app/work/page.tsx"),
    read("app/archive/page.tsx"),
    read("app/work/[slug]/page.tsx"),
    read("app/community/page.tsx"),
    read("app/community/[id]/page.tsx"),
    read("components/project-index.tsx"),
  ]);

  assert.match(portfolio, /getPublishedProjectSummaries/);
  assert.match(portfolio, /getCommunityProjectSummaries/);
  assert.match(portfolio, /getArchiveProjects/);
  assert.match(portfolio, /getNextPublishedProject/);
  assert.match(portfolio, /getNextCommunityProject/);
  assert.match(portfolio, /"project_images\.limit": "1"/);
  assert.match(portfolio, /"project_videos\.limit": "1"/);
  assert.match(work, /getPublishedProjectSummaries/);
  assert.match(community, /getCommunityProjectSummaries/);
  assert.match(archive, /getArchiveProjects/);
  assert.doesNotMatch(archive, /getPublishedProjects/);
  assert.match(workDetail, /getNextPublishedProject/);
  assert.match(communityDetail, /getNextCommunityProject/);
  assert.doesNotMatch(projectIndex, /^"use client"/);
  assert.match(projectIndex, /preload="none"/);
});

test("current user lookup is request-memoized and primary navigation prefetches on intent", async () => {
  const [auth, header] = await Promise.all([
    read("lib/auth.ts"),
    read("components/site-header.tsx"),
  ]);

  assert.match(auth, /import \{ cache \} from "react"/);
  assert.match(auth, /getCurrentUser = cache\(/);
  assert.match(header, /router\.prefetch\(href\)/);
  assert.match(header, /onMouseEnter/);
  assert.match(header, /onFocus/);
});

test("all production mutation routes enforce the same-origin guard", async () => {
  const sameOrigin = await read("lib/same-origin.ts");
  assert.match(sameOrigin, /https:\/\/cblworks\.site/);
  assert.match(sameOrigin, /sec-fetch-site/);
  assert.match(sameOrigin, /if \(!rawOrigin\) return null/);
  assert.match(sameOrigin, /localhost/);

  async function routeFiles(directory) {
    const entries = await readdir(new URL(`../${directory}/`, import.meta.url), { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const path = `${directory}/${entry.name}`;
      return entry.isDirectory() ? routeFiles(path) : entry.name === "route.ts" ? [path] : [];
    }));
    return nested.flat();
  }

  const files = await routeFiles("app/api");
  for (const file of files) {
    const source = await read(file);
    if (!/export async function (POST|PUT|PATCH|DELETE)/.test(source)) continue;
    assert.match(source, /assertSameOrigin/, `${file} must import and call assertSameOrigin`);
  }
});
