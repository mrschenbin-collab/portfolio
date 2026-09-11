import type { Metadata } from "next";
import { MotionProvider } from "@/components/motion-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth";
import { getSiteUrl, previewMetadata } from "@/lib/site-url";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: "视觉档案 — 视觉传达设计作品集", template: "%s — 视觉档案" },
  description: "视觉传达设计作品集，涵盖视觉识别、编辑设计、海报、字体与动态视觉。",
  applicationName: "视觉档案",
  keywords: ["视觉传达设计", "作品集", "平面设计", "视觉识别", "海报设计"],
  alternates: { canonical: "/" },
  openGraph: {
    title: "视觉档案 — 视觉传达设计作品集",
    description: "关于图像、文字、系统与动态视觉的作品档案。",
    url: "/",
    siteName: "视觉档案",
    locale: "zh_CN",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "视觉档案 — 视觉传达设计作品集",
    description: "关于图像、文字、系统与动态视觉的作品档案。",
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  other: previewMetadata(),
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  return (
    <html lang="zh-CN"><body id="top">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <MotionProvider><SiteHeader isAuthenticated={Boolean(user)} /><div id="main-content">{children}</div><SiteFooter /></MotionProvider>
    </body></html>
  );
}
