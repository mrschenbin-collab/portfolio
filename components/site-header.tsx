"use client";

import { usePathname, useRouter } from "next/navigation";
import { TransitionLink } from "./transition-link";

const links = [["/about", "本人介绍"], ["/work", "作品"], ["/community", "社区"], ["/archive", "档案"]];

export function SiteHeader({ isAuthenticated }: { isAuthenticated: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <header className="site-header">
      <TransitionLink href="/" className="wordmark" data-cursor="打开" aria-label="返回首页">视觉档案</TransitionLink>
      {isAuthenticated ? <nav aria-label="主导航">
        {links.map(([href, label]) => <TransitionLink
          key={href}
          href={href}
          className={pathname.startsWith(href) ? "active" : ""}
          data-cursor="打开"
          onMouseEnter={() => router.prefetch(href)}
          onFocus={() => router.prefetch(href)}
        >{label}</TransitionLink>)}
      </nav> : <span className="guest-header-note">视觉传达设计作品集展示网站</span>}
      <TransitionLink href={isAuthenticated ? "/admin" : "/login"} className="lab-link" data-cursor="打开">
        {isAuthenticated ? "作品后台" : "登录 / 注册"} ↗
      </TransitionLink>
    </header>
  );
}
