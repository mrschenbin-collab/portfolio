import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ImageLightbox } from "@/components/image-lightbox";
import { TransitionLink } from "@/components/transition-link";
import { getCurrentUser, requireAppUser } from "@/lib/auth";
import { getContactLinks, type ContactKind, type ContactLink } from "@/lib/contact-links";
import { getCommunityProject, getCommunityProjectMetadata, getCommunityProjects } from "@/lib/portfolio";
import { getProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const contactKindLabels: Record<ContactKind, string> = {
  email: "邮箱",
  social: "社交平台",
  portfolio: "作品平台",
  other: "其他",
};

function CommunityContactItem({ link }: { link: ContactLink }) {
  const content = <>
    <span>{contactKindLabels[link.kind]}</span>
    <strong>{link.label}</strong>
    <small>{link.value}</small>
  </>;

  return link.href
    ? <a href={link.href} target="_blank" rel="noreferrer">{content}</a>
    : <span>{content}</span>;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = await getCurrentUser();
  const id = parseId((await params).id);
  if (!user || !id) return { title: "社区作品" };
  const project = await getCommunityProjectMetadata(user.id, id);
  return project ? { title: `${project.title}｜社区`, description: project.summary } : {};
}

export default async function CommunityProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) notFound();
  const user = await requireAppUser(`/community/${id}`);
  const project = await getCommunityProject(user.id, id);
  if (!project) notFound();
  const [all, authorProfile, authorContactLinks] = await Promise.all([
    getCommunityProjects(user.id),
    getProfile(project.authorId),
    project.authorId === user.id ? Promise.resolve([]) : getContactLinks(project.authorId),
  ]);
  const currentIndex = all.findIndex((item) => item.id === project.id);
  const next = all.length > 1 ? all[(currentIndex + 1) % all.length] : null;
  const profileImages = authorProfile.imageUrls.map((url, index) => ({
    id: authorProfile.imageKeys[index] ?? `author-profile-${index}`,
    url,
    altText: `${project.authorName}本人介绍图片 ${index + 1}`,
  }));
  const visibleContactLinks = authorContactLinks.filter((link) => (
    !link.id.startsWith("default-")
    && link.value
    && !/待补充/.test(link.value)
  ));
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
    <section className="project-detail community-detail section-pad">
      <aside className="project-detail-meta" data-reveal>
        <section className="community-author-card" aria-label="作者资料">
          <p className="eyebrow">作者资料</p>
          <ImageLightbox
            images={profileImages}
            className={`community-author-photos image-count-${profileImages.length}`}
            empty={<figure className="community-author-empty"><span>作者头像</span><small>暂未上传</small></figure>}
          />
          <div className="community-author-heading">
            <h2>{project.authorName}</h2>
            <p>{authorProfile.roleZh}</p>
          </div>
          <p className="community-author-intro">{authorProfile.intro}</p>
          <dl className="community-author-info">
            <div><dt>研究方向</dt><dd>{authorProfile.focus.join(" · ") || "待补充"}</dd></div>
            {authorProfile.education ? <div><dt>教育经历</dt><dd>{authorProfile.education}</dd></div> : null}
            {authorProfile.experience ? <div><dt>实践经历</dt><dd>{authorProfile.experience}</dd></div> : null}
            {authorProfile.awards ? <div><dt>奖项与展览</dt><dd>{authorProfile.awards}</dd></div> : null}
          </dl>
          {visibleContactLinks.length ? <div className="community-contact-panel" aria-label="联系展示区">
            <p>联系展示区</p>
            <div>{visibleContactLinks.map((link) => <CommunityContactItem link={link} key={link.id} />)}</div>
          </div> : null}
        </section>
      </aside>
      <div className="project-detail-body">
        <header className="community-project-overview" data-reveal>
          <p className="eyebrow">社区作品</p>
          <h1><span className="mask-line"><span data-reveal-line>{project.title}</span></span></h1>
          <dl>
            <div><dt>作者</dt><dd>{project.authorName}</dd></div>
            <div><dt>设计年份</dt><dd>{project.year}</dd></div>
            <div><dt>设计主题</dt><dd>{project.category}</dd></div>
            {project.summary ? <div className="wide"><dt>作品概述</dt><dd>{project.summary}</dd></div> : null}
          </dl>
          {project.tags.length ? <ul>{project.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul> : null}
        </header>
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
