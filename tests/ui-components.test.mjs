import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

test("uses email-password auth with signed http-only sessions", async () => {
  const authSource = await readFile(path.join(root, "lib", "auth.ts"), "utf8");
  const loginRoute = await readFile(
    path.join(root, "app", "api", "auth", "login", "route.ts"),
    "utf8",
  );
  const registerRoute = await readFile(
    path.join(root, "app", "api", "auth", "register", "route.ts"),
    "utf8",
  );

  assert.match(authSource, /scryptSync/);
  assert.match(authSource, /createHmac/);
  assert.match(authSource, /HttpOnly/);
  assert.match(authSource, /SameSite=Lax/);
  assert.match(authSource, /requestVerificationCode/);
  assert.match(authSource, /resetPassword/);
  assert.doesNotMatch(authSource, /ALLOWED_EMAILS|REGISTRATION_CODE|allowedEmailSet/);
  assert.match(loginRoute, /loginUser/);
  assert.match(registerRoute, /registerUser/);
  assert.doesNotMatch(registerRoute, /createSessionCookie/);
});

test("renders a white login card with register and reset code flows", async () => {
  const [authForm, css] = await Promise.all([
    readFile(path.join(root, "components", "auth-form.tsx"), "utf8"),
    readFile(path.join(root, "app", "globals.css"), "utf8"),
  ]);

  assert.match(authForm, /发送注册验证码/);
  assert.match(authForm, /发送重置验证码/);
  assert.doesNotMatch(authForm, /发送登录验证码/);
  assert.match(authForm, /忘记密码/);
  assert.match(authForm, /reset-password/);
  assert.match(css, /\.login-page\s*\{[^}]*background:\s*var\(--paper\)/s);
  assert.match(css, /\.login-card\s*\{[^}]*color:\s*var\(--ink\)|\.login-page\s*\{[^}]*color:\s*var\(--ink\)/s);
});

test("turns a plain-text 413 response into a clear Chinese upload error", async () => {
  const { readApiResponse } = await vite.ssrLoadModule(
    "/lib/api-response.ts",
  );
  const result = await readApiResponse(
    new Response("Payload Too Large", { status: 413 }),
  );

  assert.deepEqual(result, {
    error: "上传内容过大，请确认每张图片不超过十五兆后重试。",
  });
});

test("keeps navigation clicks direct without overlay or custom cursor chrome", async () => {
  const [layout, transitionLink] = await Promise.all([
    readFile(path.join(root, "app", "layout.tsx"), "utf8"),
    readFile(path.join(root, "components", "transition-link.tsx"), "utf8"),
  ]);

  assert.doesNotMatch(layout, /CustomCursor|transition-overlay|data-transition-overlay/);
  assert.doesNotMatch(transitionLink, /useRouter|setTimeout|is-entering/);
});

test("normalizes editable contact links for the public contact page", async () => {
  const { parseContactLinksInput } = await vite.ssrLoadModule(
    "/lib/contact-links.ts",
  );

  const result = parseContactLinksInput({
    links: [
      { kind: "email", label: "电子邮箱", value: "chen@example.com", href: "" },
      { kind: "social", label: "小红书", value: "chen", href: "xiaohongshu.com/user/chen" },
      { kind: "unknown", label: " ", value: "", href: "javascript:alert(1)" },
    ],
  });

  assert.equal("error" in result, false);
  assert.equal(result.length, 2);
  assert.equal(result[0].href, "mailto:chen@example.com");
  assert.equal(result[1].href, "https://xiaohongshu.com/user/chen");
});

test("renders the work page as image-led project cards", async () => {
  const { ProjectIndex } = await vite.ssrLoadModule(
    "/components/project-index.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(ProjectIndex, {
      projects: [
        {
          id: 1,
          slug: "poster",
          title: "海报实验",
          year: "2025",
          category: "海报设计",
          summary: "一张视觉海报。",
          context: "围绕城市文字与图像节奏展开。",
          concept: "测试概念。",
          tags: ["海报"],
          tone: "tone-ink",
          status: "published",
          featured: false,
          createdAt: "",
          updatedAt: "",
          images: [{ id: 1, url: "/api/media/poster.png", altText: "海报实验", sortOrder: 0 }],
        },
      ],
    }),
  );

  assert.match(html, /project-grid/);
  assert.match(html, /project-card/);
  assert.match(html, /创作时间/);
  assert.doesNotMatch(html, /project-row|project-preview/);
});

test("renders community cards as author-labeled read-only entries", async () => {
  const { ProjectIndex } = await vite.ssrLoadModule(
    "/components/project-index.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(ProjectIndex, {
      basePath: "/community",
      showAuthor: true,
      projects: [
        {
          id: 18,
          authorId: "classmate-a",
          authorName: "同学A",
          slug: "poster",
          title: "社区海报",
          year: "2026",
          category: "海报设计",
          summary: "社区展示。",
          context: "只读社区作品。",
          concept: "测试概念。",
          tags: ["海报"],
          tone: "tone-ink",
          status: "published",
          featured: false,
          createdAt: "",
          updatedAt: "",
          images: [],
        },
      ],
    }),
  );

  assert.match(html, /href="\/community\/18"/);
  assert.match(html, /作者/);
  assert.match(html, /同学A/);
});

test("puts the personal introduction before work in the main navigation", async () => {
  const header = await readFile(
    path.join(root, "components", "site-header.tsx"),
    "utf8",
  );

  assert.ok(header.indexOf('"本人介绍"') < header.indexOf('"作品"'));
});

test("normalizes editable profile content for the introduction page", async () => {
  const { parseProfileInput } = await vite.ssrLoadModule("/lib/profile.ts");
  const result = parseProfileInput({
    roleZh: "  视觉传达设计创作者 ",
    intro: "关注图像、文字与系统。",
    focus: "品牌设计，海报设计\n编辑设计",
    education: "教育经历待补充",
    experience: "实践经历待补充",
    awards: "奖项待补充",
    imageKeys: [
      "profile-demo.png",
      "profile-life.jpg",
      "profile-work.webp",
      "profile-extra-1.png",
      "profile-extra-2.png",
      "profile-extra-3.png",
    ],
  });

  assert.equal("error" in result, false);
  assert.deepEqual(result.focus, ["品牌设计", "海报设计", "编辑设计"]);
  assert.equal(result.imageKey, "profile-demo.png");
  assert.equal(result.imageKeys.length, 5);
});

test("keeps project detail images out of the page background", async () => {
  const detailPage = await readFile(
    path.join(root, "app", "work", "[slug]", "page.tsx"),
    "utf8",
  );

  assert.match(detailPage, /project-detail/);
  assert.match(detailPage, /ImageLightbox/);
  assert.doesNotMatch(detailPage, /backgroundImage|project-hero/);
});

test("renders click-to-view image thumbnails for work and profile pages", async () => {
  const { ImageLightbox } = await vite.ssrLoadModule("/components/image-lightbox.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ImageLightbox, {
      className: "project-image-grid",
      images: [
        { id: 1, url: "/api/media/one.png", altText: "作品一" },
        { id: 2, url: "/api/media/two.png", altText: "作品二" },
      ],
    }),
  );

  assert.match(html, /lightbox-thumb/);
  assert.match(html, /查看大图：作品一/);
});

test("keeps uploaded artwork uncropped and owner action inline", async () => {
  const [css, detailPage] = await Promise.all([
    readFile(path.join(root, "app", "globals.css"), "utf8"),
    readFile(path.join(root, "app", "work", "[slug]", "page.tsx"), "utf8"),
  ]);

  assert.match(css, /\.profile-photo-cluster\s*\{[^}]*align-items:\s*end/s);
  assert.doesNotMatch(css, /profile-photo-cluster \.lightbox-thumb:first-child\s*\{\s*grid-row:\s*span 2/);
  assert.match(css, /\.project-card-image img\s*\{[^}]*height:\s*auto;[^}]*object-fit:\s*contain/s);
  assert.match(css, /\.project-image-grid \.lightbox-thumb img\s*\{[^}]*height:\s*auto;[^}]*object-fit:\s*contain/s);
  assert.match(css, /\.project-owner-actions\s*\{[^}]*position:\s*static/s);
  assert.ok(detailPage.indexOf("<ProjectOwnerActions") < detailPage.indexOf("project-summary-meta"));
});
