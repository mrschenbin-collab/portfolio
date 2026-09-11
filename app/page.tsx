import { TransitionLink } from "@/components/transition-link";
import { getCurrentUser } from "@/lib/auth";

const inspirationImages = [
  { src: "/inspiration-01.svg", title: "公共视觉灵感 01", meta: "图像构成" },
  { src: "/inspiration-02.svg", title: "公共视觉灵感 02", meta: "版式参考" },
  { src: "/inspiration-03.svg", title: "公共视觉灵感 03", meta: "色彩关系" },
  { src: "/inspiration-04.svg", title: "公共视觉灵感 04", meta: "视觉节奏" },
  { src: "/inspiration-05.svg", title: "公共视觉灵感 05", meta: "信息层级" },
  { src: "/inspiration-06.svg", title: "公共视觉灵感 06", meta: "图形秩序" },
];

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main className="guest-home">
        <section className="guest-hero section-pad" aria-labelledby="guest-title">
          <p className="eyebrow">视觉传达设计作品集展示网站</p>
          <h1 id="guest-title">欢迎你的加入</h1>
          <p>这里将收集同学们的视觉传达设计作品。登录或注册后，可以建立自己的本人介绍、提交作品、整理档案并维护联系信息。</p>
          <TransitionLink href="/login" className="login-button">登录 / 注册 ↗</TransitionLink>
        </section>
        <section className="guest-inspiration section-pad" aria-labelledby="inspiration-title">
          <div>
            <p className="eyebrow">公共灵感图</p>
            <h2 id="inspiration-title">先看一些非作者上传的公共视觉参考。</h2>
          </div>
          <div className="inspiration-grid">
            {inspirationImages.map((image) => (
              <figure key={image.src}>
                <img src={image.src} alt={image.title} />
                <figcaption><strong>{image.title}</strong><span>{image.meta}</span></figcaption>
              </figure>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="hero section-pad" aria-labelledby="hero-title">
        <div className="hero-meta meta-row" data-reveal>
          <span>视觉传达设计</span>
          <span>作品集档案</span>
          <span>© 2026</span>
        </div>

        <h1 id="hero-title" className="hero-title" aria-label="视觉传达设计作品集">
          <span className="mask-line"><span data-reveal-line>视觉</span></span>
          <span className="mask-line hero-line-offset"><span data-reveal-line>传达</span></span>
          <span className="mask-line"><span data-reveal-line>设计</span></span>
        </h1>

        <div className="hero-foot meta-row" data-reveal>
          <span>图像 · 文字 · 系统</span>
          <span className="serif">2023—2026</span>
          <a href="#language" data-cursor="浏览">向下浏览 ↓</a>
        </div>
      </section>

      <section id="language" className="section-pad language-section" aria-labelledby="language-title">
        <header className="language-heading" data-reveal>
          <p className="eyebrow">01 / 视觉语言</p>
          <h2 id="language-title">图像、文字、秩序<br />共同完成一次表达。</h2>
        </header>
        <div className="discipline-grid">
          {["视觉识别", "海报设计", "品牌设计", "编辑设计", "字体实验", "动态视觉"].map((item, index) => (
            <article key={item} className={`discipline-card tone-${["red", "ink", "blue", "green", "yellow", "mono"][index]}`} data-image-reveal>
              <span className="serif">0{index + 1}</span><h3>{item}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="manifesto section-pad" aria-labelledby="manifesto-title">
        <p className="eyebrow">02 / 设计方法</p>
        <h2 id="manifesto-title" data-reveal>从信息结构出发，<br />让形式服务于内容。</h2>
        <p className="manifesto-en serif">研究 · 构想 · 系统 · 呈现</p>
        <TransitionLink href="/about" className="text-link" data-cursor="打开">了解设计方法 ↗</TransitionLink>
      </section>

      <section className="final-cta section-pad" aria-labelledby="contact-title">
        <p className="eyebrow">03 / 作品档案</p>
        <h2 id="contact-title">在图像中思考，<br /><em>在系统中</em><br />建立秩序。</h2>
        <TransitionLink href="/work" className="round-link" data-cursor="打开" aria-label="前往作品页面">浏览<br />作品 ↗</TransitionLink>
      </section>
    </main>
  );
}
