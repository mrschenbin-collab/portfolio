"use client";

import { useEffect, useState, type ReactNode } from "react";

export type LightboxImage = {
  id: string | number;
  url: string;
  altText: string;
};

export function ImageLightbox({
  images,
  className,
  empty,
}: {
  images: LightboxImage[];
  className: string;
  empty?: ReactNode;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const activeImage = activeIndex === null ? null : images[activeIndex];

  function open(index: number) {
    setActiveIndex(index);
    setZoom(1);
  }

  function close() {
    setActiveIndex(null);
    setZoom(1);
  }

  function move(step: number) {
    if (activeIndex === null || images.length < 2) return;
    setActiveIndex((activeIndex + step + images.length) % images.length);
    setZoom(1);
  }

  useEffect(() => {
    if (activeIndex === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
      if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(3, value + 0.2));
      if (event.key === "-") setZoom((value) => Math.max(0.6, value - 0.2));
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeIndex, images.length]);

  return <>
    {images.length ? <div className={className}>
      {images.map((image, index) => <button className="lightbox-thumb" type="button" key={image.id} onClick={() => open(index)} aria-label={`查看大图：${image.altText}`}>
        <img src={image.url} alt={image.altText} loading={index > 0 ? "lazy" : undefined} />
      </button>)}
    </div> : empty}

    {activeImage ? <div className="lightbox-backdrop" role="dialog" aria-modal="true" aria-label="图片查看器" onClick={close}>
      <div className="lightbox-shell" onClick={(event) => event.stopPropagation()}>
        <div className="lightbox-toolbar">
          <span>{activeImage.altText}</span>
          <div>
            <button type="button" onClick={() => setZoom((value) => Math.max(0.6, value - 0.2))}>缩小</button>
            <button type="button" onClick={() => setZoom(1)}>还原</button>
            <button type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.2))}>放大</button>
            <button type="button" onClick={close}>关闭</button>
          </div>
        </div>
        <div className="lightbox-stage">
          {images.length > 1 ? <button className="lightbox-nav prev" type="button" onClick={() => move(-1)} aria-label="上一张">←</button> : null}
          <img src={activeImage.url} alt={activeImage.altText} style={{ transform: `scale(${zoom})` }} />
          {images.length > 1 ? <button className="lightbox-nav next" type="button" onClick={() => move(1)} aria-label="下一张">→</button> : null}
        </div>
      </div>
    </div> : null}
  </>;
}
