"use client";

import { useEffect, useRef, useState } from "react";

// Räknar mjukt upp till `value` (easeOutCubic). Startar från föregående värde,
// så vid auto-uppdatering animeras bara förändringen. Respekterar reducerad
// rörelse via prefers-reduced-motion.
export function CountUp({
  value,
  decimals = 0,
  durationMs = 900,
  className,
}: {
  value: number;
  decimals?: number;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    const from = fromRef.current;
    const to = value;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (to - from) * eased);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  return <span className={className}>{display.toFixed(decimals)}</span>;
}
