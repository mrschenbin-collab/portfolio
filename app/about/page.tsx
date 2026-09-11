import type { Metadata } from "next";
import { ImageLightbox } from "@/components/image-lightbox";
import { requireAppUser } from "@/lib/auth";
import { getProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "本人介绍" };

export default async function AboutPage() {
  const user = await requireAppUser("/about");
  const profile = await getProfile(user.id);
  const profileImages = profile.imageUrls.map((url, index) => ({
    id: profile.imageKeys[index] ?? url,
    url,
    altText: index === 0 ? "本人主照片" : `本人附属照片 ${index}`,
  }));

  return <main className="page-main section-pad about-page"><header className="page-hero page-hero-left about-hero"><h1><span className="mask-line"><span data-reveal-line>本人介绍</span></span></h1><p data-reveal>以图像、文字与系统方法建立清晰的视觉表达。</p></header><section className="about-grid"><div>
    <ImageLightbox
      images={profileImages}
      className={`profile-photo-cluster image-count-${profileImages.length}`}
      empty={<figure className="profile-photo-empty" data-image-reveal><span>本人图片</span><small>可在后台上传</small></figure>}
    />
  </div><div><p className="about-lead">{profile.roleZh}</p><p className="about-copy">{profile.intro}</p></div></section><section className="profile-list"><div><h2>关注方向</h2><p>{profile.focus.join(" · ") || "待补充"}</p></div><div><h2>教育经历</h2><p>{profile.education || "待补充"}</p></div><div><h2>实践经历</h2><p>{profile.experience || "待补充"}</p></div><div><h2>奖项与展览</h2><p>{profile.awards || "待补充"}</p></div></section></main>;
}
