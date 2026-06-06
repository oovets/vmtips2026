"use client";

import { useMemo, useState } from "react";
import type { NewsItem } from "@/lib/news";

// Favicon för nyhetskällan, härledd ur artikelns domän (Googles publika tjänst).
function faviconUrl(link: string): string {
  try {
    const host = new URL(link).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return "https://www.google.com/s2/favicons?domain=example.com&sz=64";
  }
}

interface Props {
  items: NewsItem[];
  swedishSources: string[];
}

export function NewsFeed({ items, swedishSources }: Props) {
  const [swedishOnly, setSwedishOnly] = useState(false);
  const swedishSet = useMemo(() => new Set(swedishSources), [swedishSources]);

  const shown = useMemo(
    () => (swedishOnly ? items.filter((i) => swedishSet.has(i.source)) : items),
    [items, swedishOnly, swedishSet],
  );

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Fotbollsnyheter</h2>
        <button
          type="button"
          onClick={() => setSwedishOnly((v) => !v)}
          aria-pressed={swedishOnly}
          className={`chip ${swedishOnly ? "bg-flag/20 text-flag" : "text-slate-300"}`}
          title="Visa bara svenska nyheter"
        >
          🇸🇪 Endast svenska
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="card p-4 text-sm text-slate-400">
          {swedishOnly ? "Inga svenska nyheter just nu." : "Kunde inte hämta nyheter just nu."}
        </p>
      ) : (
        <div className="card divide-y divide-white/5">
          {shown.map((item, i) => (
            <a
              key={i}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={faviconUrl(item.link)}
                alt=""
                width={20}
                height={20}
                loading="lazy"
                className="h-5 w-5 shrink-0 rounded-sm bg-white/5"
              />
              <span className="min-w-0 text-sm text-slate-200">{item.title}</span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
