import type { Metadata } from "next";
import { TransitionLink } from "@/components/transition-link";
import { requireAppUser } from "@/lib/auth";
import { getPublishedProjects } from "@/lib/portfolio";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "档案" };
export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const user = await requireAppUser("/archive");
  const projects = await getPublishedProjects(user.id);
  const years = Array.from(new Set(projects.map((project) => project.year))).sort((a, b) => b.localeCompare(a));
  const selectedYear = (await searchParams).year;
  const activeYear = years.includes(selectedYear ?? "") ? selectedYear : "";
  const visibleProjects = activeYear ? projects.filter((project) => project.year === activeYear) : projects;

  return <main className="page-main section-pad"><header className="page-hero page-hero-left archive-hero"><h1><span className="mask-line"><span data-reveal-line>档案</span></span></h1><div className="archive-intro" data-reveal><p>按照年份、项目与类别查看已公开的设计记录。</p>{years.length ? <nav className="year-filter" aria-label="按年份筛选作品"><TransitionLink href="/archive" className={!activeYear ? "active" : ""}>全部年份</TransitionLink>{years.map((year) => <TransitionLink href={`/archive?year=${year}`} className={activeYear === year ? "active" : ""} key={year}>{year}</TransitionLink>)}</nav> : null}</div></header>{visibleProjects.length ? <div className="archive-table" role="table" aria-label="作品档案"><div className="archive-row archive-head" role="row"><span role="columnheader">年份</span><span role="columnheader">项目</span><span role="columnheader">类别</span><span role="columnheader">编号</span></div>{visibleProjects.map((project, index) => <TransitionLink href={`/work/${project.slug}`} className="archive-row" role="row" key={project.slug}><span role="cell" className="serif">{project.year}</span><span role="cell"><strong>{project.title}</strong><small>{project.summary}</small></span><span role="cell">{project.category}<small>{project.tags.join(" · ")}</small></span><span role="cell" className="serif">{String(index + 1).padStart(2, "0")}</span></TransitionLink>)}</div> : <div className="empty-state"><span>{activeYear ? `${activeYear} 暂无公开作品` : "档案尚未建立"}</span><p>公开作品后，这里会自动生成作品档案。</p></div>}</main>;
}
