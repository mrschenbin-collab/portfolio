import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "登录", robots: { index: false, follow: false } };

function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) {
    return "/admin";
  }
  try {
    const parsed = new URL(value, "https://portfolio.local");
    const exactPaths = new Set(["/", "/admin", "/work", "/community", "/archive", "/about", "/contact"]);
    const allowed = parsed.origin === "https://portfolio.local"
      && (
        exactPaths.has(parsed.pathname)
        || parsed.pathname.startsWith("/work/")
        || parsed.pathname.startsWith("/community/")
      );
    return allowed ? `${parsed.pathname}${parsed.search}${parsed.hash}` : "/admin";
  } catch {
    return "/admin";
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/admin");
  return <main className="login-page section-pad"><AuthForm nextPath={safeNext((await searchParams).next)} /></main>;
}
