"use client";

import { useEffect, useState } from "react";

// Live nedräkning till en ISO-tidpunkt. Visar dd:hh:mm:ss tills target nås.
export function Countdown({ target }: { target: string }) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = Math.max(0, new Date(target).getTime() - now);
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);

  const parts: { v: number; l: string }[] = [
    { v: d, l: "d" },
    { v: h, l: "tim" },
    { v: m, l: "min" },
    { v: s, l: "sek" },
  ];

  return (
    <div className="flex gap-2">
      {parts.map((p) => (
        <div
          key={p.l}
          className="flex min-w-[3.25rem] flex-col items-center rounded-xl border border-white/10 bg-night-950/60 px-2 py-1.5"
        >
          <span className="text-xl font-extrabold tabular-nums leading-none">
            {String(p.v).padStart(2, "0")}
          </span>
          <span className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">{p.l}</span>
        </div>
      ))}
    </div>
  );
}
