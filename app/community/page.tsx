import type { Metadata } from "next";
import { ProjectIndex } from "@/components/project-index";
import { requireAppUser } from "@/lib/auth";
import { getCommunityProjects } from "@/lib/portfolio";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "社区" };

export default async function CommunityPage() {
  const user = await requireAppUser("/community");
  const projects = await getCommunityProjects(user.id);

  return <main className="page-main section-pad">
    <header className="page-hero page-hero-left">
      <h1><span className="mask-line"><span data-reveal-line>社区</span></span></h1>
      <p data-reveal>查看同学们已展示的视觉传达设计作品。这里是只读区域，你只能观看，不能修改或下架他人的项目。</p>
    </header>
    {projects.length ? <ProjectIndex projects={projects} basePath="/community" showAuthor /> : <div className="empty-state"><span>社区暂时没有公开作品</span><p>等其他同学提交并展示作品后，这里会自动出现。</p></div>}
  </main>;
}
