"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    let cleanup = () => {};
    let cancelled = false;
    async function init() {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) return;
      const [{ gsap }, { ScrollTrigger }, { default: Lenis }] = await Promise.all([
        import("gsap"), import("gsap/ScrollTrigger"), import("lenis"),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      const lenis = new Lenis({ lerp: 0.085, smoothWheel: true, anchors: true });
      const onScroll = () => ScrollTrigger.update();
      lenis.on("scroll", onScroll);
      const ticker = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(ticker);
      gsap.ticker.lagSmoothing(0);
      const ctx = gsap.context(() => {
        gsap.fromTo("[data-reveal-line]", { yPercent: 108 }, { yPercent: 0, duration: 1.15, stagger: 0.1, ease: "power4.out", delay: 0.08 });
        gsap.fromTo("[data-reveal]", { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, stagger: 0.08, ease: "power3.out", delay: 0.35 });
        document.querySelectorAll<HTMLElement>("[data-image-reveal]").forEach((element) => {
          gsap.fromTo(element, { clipPath: "inset(100% 0 0 0)", scale: 1.055 }, {
            clipPath: "inset(0% 0 0 0)", scale: 1, duration: 1.05, ease: "power4.out",
            scrollTrigger: { trigger: element, start: "top 86%", once: true },
          });
        });
        const horizontal = document.querySelector<HTMLElement>("[data-horizontal]");
        const track = horizontal?.querySelector<HTMLElement>(".horizontal-track");
        if (horizontal && track && window.innerWidth >= 768) {
          const travel = () => Math.max(0, track.scrollWidth - window.innerWidth);
          gsap.to(track, { x: () => -travel(), ease: "none", scrollTrigger: {
            trigger: horizontal, start: "top top", end: () => `+=${travel() + window.innerHeight * 0.7}`,
            pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1,
          }});
        }
      });
      cleanup = () => { ctx.revert(); lenis.destroy(); gsap.ticker.remove(ticker); };
      ScrollTrigger.refresh();
    }
    init();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [pathname]);

  return <>{children}</>;
}
