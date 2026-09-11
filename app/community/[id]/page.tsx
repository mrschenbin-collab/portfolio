import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ImageLightbox } from "@/components/image-lightbox";
import { TransitionLink } from "@/components/transition-link";
import { getCurrentUser, requireAppUser } from "@/lib/auth";
import { getCommunityProject, getCommunityProjects } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = await getCurrentUser();
  const id = parseId((await params).id);
  if (!user || !id) return { title: "社区作品" };
  const project = await getCommunityProject(user.id, id);
  return project ? { title: `${project.title}｜社区`, description: project.summary } : {};
}

export default async function CommunityProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) notFound();
  const user = await requireAppUser(`/community/${id}`);
  const project = await getCommunityProject(user.id, id);
  if (!project) notFound();
  const all = await getCommunityProjects(user.id);
  const currentIndex = all.findIndex((item) => item.id === project.id);
  const next = all.length > 1 ? all[(currentIndex + 1) % all.length] : null;
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
        <p className="eyebrow">社区作品</p>
        <h1><span className="mask-line"><span data-reveal-line>{project.title}</span></span></h1>
        <dl>
          <div><dt>作者</dt><dd>{project.authorName}</dd></div>
          <div><dt>设计年份</dt><dd>{project.year}</dd></div>
          <div><dt>设计主题</dt><dd>{project.category}</dd></div>
          {project.summary ? <div><dt>作品概述</dt><dd>{project.summary}</dd></div> : null}
        </dl>
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
    <TransitionLink href={next ? `/community/${next.id}` : "/community"} className="next-project section-pad" data-cursor="继续"><span>{next ? "下一个社区作品" : "返回社区"}</span><strong>{next?.title ?? "社区"}</strong><em>→</em></TransitionLink>
  </main>;
}
