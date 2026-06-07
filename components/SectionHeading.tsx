import type { ReactNode } from "react";

// Sektionsrubrik där själva rubriktexten är dold (visuellt) men finns kvar i DOM
// för skärmläsare (sr-only). Inget annat döljs: sektionens innehåll (`children`)
// och eventuella interaktiva element (`action`, t.ex. en länk, live-status eller
// undertext) renderas helt normalt och är fullt synliga. Ingen guldaccent längre.
export function SectionHeading({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <h2 className="sr-only">{title}</h2>
      {action && <div className="mb-3 flex justify-end text-xs text-slate-500">{action}</div>}
      {children}
    </>
  );
}
