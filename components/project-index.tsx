import Link from "next/link";
import type { PortfolioProjectSummary } from "@/lib/portfolio";

type ProjectIndexProject = PortfolioProjectSummary & {
  authorName?: string;
};

export function ProjectIndex({
  projects,
  basePath = "/work",
  showAuthor = false,
}: {
  projects: ProjectIndexProject[];
  basePath?: "/work" | "/community";
  showAuthor?: boolean;
}) {
  return (
    <div className="project-grid">
      {projects.map((project, index) => (
        <Link
          href={basePath === "/community" ? `/community/${project.id}` : `/work/${project.slug}`}
          className="project-card"
          key={`${basePath}-${project.authorId}-${project.id}`}
        >
          <div className="project-card-image">
            {project.images[0]
              ? <img
                src={project.images[0].url}
                alt={project.images[0].altText}
                loading={index < 3 ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={index === 0 ? "high" : "auto"}
              />
              : project.videos[0]
                ? <><video src={project.videos[0].url} muted playsInline preload="none" /><span className="media-badge">视频</span></>
                : <div className={`art-surface ${project.tone}`}><span className="serif">{String(index + 1).padStart(2, "0")}</span><strong>{project.title}</strong></div>}
          </div>
          <div className="project-card-body">
            <div><span className="project-number serif">{String(index + 1).padStart(2, "0")}</span><strong>{project.title}</strong></div>
            <dl>
              {showAuthor && project.authorName ? <div><dt>作者</dt><dd>{project.authorName}</dd></div> : null}
              <div><dt>创作时间</dt><dd>{project.year}</dd></div>
              <div><dt>项目类别</dt><dd>{project.category}</dd></div>
            </dl>
            <p>{project.summary || "创作背景待补充。"}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
