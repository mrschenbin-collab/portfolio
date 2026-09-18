import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ImageLightbox } from "@/components/image-lightbox";
import { ProjectOwnerActions } from "@/components/project-owner-actions";
import { TransitionLink } from "@/components/transition-link";
import { getCurrentUser, requireAppUser } from "@/lib/auth";
import { getAuthorProject, getNextPublishedProject, getPublishedProjectMetadata } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user) return { title: "作品" };
  const project = await getPublishedProjectMetadata(user.id, (await params).slug);
  return project ? { title: project.title, description: project.summary } : {};
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireAppUser(`/work/${slug}`);
  const project = await getAuthorProject(user.id, slug);
  if (!project) notFound();
  const next = await getNextPublishedProject(user.id, project.slug);
  const galleryItems = [
    ...project.images.map((image, index) => ({
      id: `image-${image.id}`,
      url: image.url,
      altText: image.altText || `${project.title}作品图 ${index + 1}`,
      type: "image" as const,
    })),
    ...project.videos.map((video, index) => ({
      id: `video-${video.id}`,
      url: video.url,
      altText: video.altText || `${project.title}视频 ${index + 1}`,
      type: "video" as const,
    })),
  ];

  return <main className="project-page">
    <section className="project-detail section-pad">
      <aside className="project-detail-meta" data-reveal>
        <p className="eyebrow">作品资料</p>
        <h1><span className="mask-line"><span data-reveal-line>{project.title}</span></span></h1>
        <dl>
          <div><dt>设计年份</dt><dd>{project.year}</dd></div>
          <div><dt>设计主题</dt><dd>{project.category}</dd></div>
        </dl>
        <dl className="project-summary-meta"><div><dt>作品概述</dt><dd>{project.summary || "作品概述待补充。"}</dd></div></dl>
        <ProjectOwnerActions projectId={project.id} initialStatus={project.status} />
        {project.tags.length ? <ul>{project.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul> : null}
      </aside>
      <div className="project-detail-body">
        <ImageLightbox
          images={galleryItems}
          className={`project-image-grid media-count-${galleryItems.length}`}
          empty={<div className={`project-image-empty art-surface ${project.tone}`} data-image-reveal><strong>{project.title}</strong><small>作品图片或视频待上传</small></div>}
        />
        <div className="project-detail-copy">
          <article>
            <span>01</span>
            <div><h2>项目背景</h2><p>{project.context || "项目背景待补充。"}</p></div>
          </article>
          <article>
            <span>02</span>
            <div><h2>设计概念</h2><p>{project.concept || "设计概念待补充。"}</p></div>
          </article>
        </div>
      </div>
    </section>
    <TransitionLink href={next ? `/work/${next.slug}` : "/work"} className="next-project section-pad" data-cursor="继续"><span>{next ? "下一个项目" : "返回作品目录"}</span><strong>{next?.title ?? "作品目录"}</strong><em>→</em></TransitionLink>
  </main>;
}
