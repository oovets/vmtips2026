"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Live-filtrering: filtrerar så fort man skriver (debouncad) genom att skriva
// söksträngen till URL:ens ?q=. Sidorna läser searchParams.q på servern och
// renderar om träffarna. Ingen Filtrera-knapp behövs.
export function CountryGroupFilters({
  basePath,
  query,
  count,
}: {
  basePath: string;
  query: string;
  count?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(query);

  // Håll inputfältet i synk om query ändras externt (t.ex. via Rensa).
  useEffect(() => {
    setValue(query);
  }, [query]);

  // Debounce: skriv värdet till URL:en strax efter att man slutat skriva.
  const lastPushed = useRef(query);
  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === lastPushed.current.trim()) return;
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      lastPushed.current = trimmed;
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 200);
    return () => clearTimeout(t);
  }, [value, pathname, router, searchParams]);

  const active = value.trim().length > 0;

  const clear = () => {
    setValue("");
    lastPushed.current = "";
    router.replace(basePath, { scroll: false });
  };

  return (
    <div className="card flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
      <label className="sr-only" htmlFor={`${basePath}-q`}>Filtrera på land</label>
      <input
        id={`${basePath}-q`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Sök land eller kod..."
        autoComplete="off"
        className="input min-w-0 flex-1"
      />

      <div className="flex items-center gap-2">
        {active && (
          <button type="button" onClick={clear} className="btn-ghost btn-sm">
            Rensa
          </button>
        )}
        {count != null && (
          <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-slate-500 sm:ml-1">
            {count} träffar
          </span>
        )}
      </div>
    </div>
  );
}
