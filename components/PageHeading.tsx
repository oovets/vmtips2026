import type { ReactNode } from "react";

// Sidrubrik: sidans stora H1-text visas högst upp på sidan. Sidans innehåll
// (`children`) renderas normalt. Undertexten (`subtitle`) och eventuell sidoinfo
// (`aside`, t.ex. totalpoäng) bär verklig status/data och visas bredvid/under titeln.
export function PageHeading({
  title,
  subtitle,
  aside,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      {children}
    </>
  );
}
