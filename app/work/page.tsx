import type { Metadata } from "next";
import { ProjectIndex } from "@/components/project-index";
import { requireAppUser } from "@/lib/auth";
import { getPublishedProjects } from "@/lib/portfolio";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "作品" };
export default async function WorkPage() {
  const user = await requireAppUser("/work");
  const projects = await getPublishedProjects(user.id);
  return <main className="page-main section-pad"><header className="page-hero page-hero-left"><h1><span className="mask-line"><span data-reveal-line>作品</span></span></h1><p data-reveal>以图片卡片展示视觉识别、海报、品牌、编辑、字体与动态视觉项目。</p></header>{projects.length ? <ProjectIndex projects={projects} /> : <div className="empty-state"><span>暂无公开作品</span><p>作品正在整理中，发布后会在这里出现。</p></div>}</main>;
}
