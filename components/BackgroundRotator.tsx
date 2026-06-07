"use client";

import { useEffect, useState } from "react";

// Historiska VM-bilder (public domain / CC) som ligger i public/backgrounds.
// Källor och licenser dokumenteras i public/backgrounds/CREDITS.md.
const IMAGES = [
  "/backgrounds/wc-1958-final.jpg",
  "/backgrounds/wc-1958-pele.jpg",
  "/backgrounds/wc-1950-maracana.jpg",
  "/backgrounds/wc-1950-ghiggia.jpg",
  "/backgrounds/wc-1970-stadio-galleana.jpg",
] as const;

// Hur ofta bakgrunden byts (ms). "Lite då och då" – var 30:e sekund.
const ROTATE_INTERVAL_MS = 30_000;

/**
 * Mörkt nedtonad, roterande bakgrund med historiska VM-bilder.
 * Två fasta lager korstonar mjukt mellan bilderna. Ligger bakom allt innehåll
 * (z-index negativt, pointer-events: none) och stör varken klick eller layout.
 * Respekterar prefers-reduced-motion: byter då utan animering.
 */
export function BackgroundRotator() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (IMAGES.length <= 1) return;

    // Förladda nästa bild så övergången blir mjuk.
    const preload = (i: number) => {
      const img = new Image();
      img.src = IMAGES[i];
    };
    preload((index + 1) % IMAGES.length);

    const id = setInterval(() => {
      setIndex((prev) => {
        const next = (prev + 1) % IMAGES.length;
        preload((next + 1) % IMAGES.length);
        return next;
      });
    }, ROTATE_INTERVAL_MS);

    return () => clearInterval(id);
  }, [index]);

  return (
    <>
      <div className="bg-rotator" aria-hidden="true">
        {IMAGES.map((src, i) => (
          <div
            key={src}
            className={`bg-rotator__layer${i === index ? " is-active" : ""}`}
            style={{ backgroundImage: `url("${src}")` }}
          />
        ))}
      </div>
      <div className="bg-rotator__overlay" aria-hidden="true" />
    </>
  );
}
