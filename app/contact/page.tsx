import type { Metadata } from "next";
import { requireAppUser } from "@/lib/auth";
import { getContactLinks, type ContactKind, type ContactLink } from "@/lib/contact-links";

export const metadata: Metadata = { title: "联系" };
export const dynamic = "force-dynamic";

const kindLabels: Record<ContactKind, string> = {
  email: "邮箱",
  social: "社交平台",
  portfolio: "作品平台",
  other: "其他",
};

function ContactItem({ link }: { link: ContactLink }) {
  const content = <>
    <span className="contact-kind">{kindLabels[link.kind]}</span>
    <strong>{link.label}</strong>
    <small>{link.value}</small>
  </>;

  return link.href
    ? <a href={link.href} target={link.href.startsWith("http") ? "_blank" : undefined} rel={link.href.startsWith("http") ? "noreferrer" : undefined}>{content}</a>
    : <span>{content}</span>;
}

export default async function ContactPage() {
  const user = await requireAppUser("/contact");
  const links = await getContactLinks(user.id);

  return <main className="page-main contact-page section-pad"><header className="page-hero page-hero-left contact-hero"><h1><span className="mask-line"><span data-reveal-line>联系</span></span></h1><p data-reveal>围绕视觉传达、品牌系统、海报与编辑设计展开交流。</p></header><div className="contact-links" data-reveal>{links.map((link) => <ContactItem link={link} key={link.id} />)}</div><p className="contact-note">欢迎交流合作、项目咨询与作品沟通。</p></main>;
}
