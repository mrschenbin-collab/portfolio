import type { Metadata } from "next";

export const metadata: Metadata = { title: "实验", robots: { index: false, follow: false } };
const experiments = ["字体实验一", "海报研究二", "动态实验三", "图像笔记四"];
export default function LabPage() {
  return <main className="page-main section-pad lab-page"><header className="page-hero"><p className="eyebrow">实验记录</p><h1><span className="mask-line"><span data-reveal-line>实验</span></span></h1><p data-reveal>用于存放未完成的图形、字体、摄影与动态实验。</p></header><section className="lab-grid">{experiments.map((item, index) => <article key={item} className={`lab-card tone-${["red", "blue", "yellow", "green"][index]}`} data-image-reveal><span className="serif">0{index + 1}</span><h2>{item}</h2><p>实验内容待加入</p></article>)}</section></main>;
}
