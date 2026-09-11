import type { Metadata } from "next";
import { AdminManager } from "@/components/admin-manager";
import { requireAppUser } from "@/lib/auth";
import { getContactLinks } from "@/lib/contact-links";
import { getProfile } from "@/lib/profile";
import { getAllProjects } from "@/lib/portfolio";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "作品管理", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const user = await requireAppUser("/admin");
  const [projects, contactLinks, profile] = await Promise.all([getAllProjects(user.id), getContactLinks(user.id), getProfile(user.id)]);

  return <main className="admin-page section-pad">
    <header className="admin-hero"><div><p className="eyebrow">作者后台</p><h1>作品提交</h1></div><div className="admin-account"><span>{user.displayName}</span><small>{user.email}</small><form action="/api/auth/logout" method="post"><button type="submit" className="logout-button">退出登录</button></form></div></header>
    <AdminManager initialProjects={projects} initialContactLinks={contactLinks} initialProfile={profile} />
  </main>;
}
