import type { ReactNode } from "react";

// Enhetlig sektionsrubrik med en tunn guldaccent till vänster. Valfritt
// innehåll till höger (t.ex. en länk eller undertext) via `children`.
export function SectionHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <span className="inline-block h-4 w-1 shrink-0 self-center rounded-full bg-flag-500" aria-hidden />
        {title}
      </h2>
      {children && <div className="shrink-0 text-xs text-slate-500">{children}</div>}
    </div>
  );
}
