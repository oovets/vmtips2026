"use client";

import Link from "next/link";

// Verktygsrad ovanför "pappret" — döljs i utskrift (ligger utanför .print-doc).
export function ExportActions() {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
      <Link href="/mitt-lag" className="btn-ghost btn-sm">
        ← Tillbaka
      </Link>
      <button onClick={() => window.print()} className="btn-primary btn-sm">
        Spara som PDF
      </button>
    </div>
  );
}
