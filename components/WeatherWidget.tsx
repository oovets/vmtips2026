"use client";

import { useState } from "react";
import type { WeatherInfo } from "@/lib/weather";

// Kompakt väder-widget i nav-baren. Visar dagens "ledande" väder (första arenan)
// och antal städer; klick fäller ut en modal med detaljer för alla aktuella
// spelplatser. Renderar inget om det saknas väderdata.
export function WeatherWidget({ items, isToday }: { items: WeatherInfo[]; isToday: boolean }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  const lead = items[0];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={`Väder på arenorna · ${isToday ? "idag" : "nästa matchdag"}`}
        aria-label={`Väder på arenorna · ${isToday ? "idag" : "nästa matchdag"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flag-500"
      >
        <span className="text-base leading-none" aria-hidden>{lead.emoji}</span>
        <span className="tabular-nums">{lead.tempC != null ? `${lead.tempC}°` : "–"}</span>
        {items.length > 1 && (
          <span className="rounded bg-white/10 px-1 text-[10px] tabular-nums text-slate-400">+{items.length - 1}</span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-20 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Väder på arenorna"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-night-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg font-extrabold">Väder på arenorna</h2>
                <p className="text-xs text-slate-400">{isToday ? "Dagens spelplatser" : "Nästa matchdags spelplatser"}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Stäng"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M4 4l10 10M14 4L4 14" />
                </svg>
              </button>
            </div>

            <div className="space-y-2">
              {items.map((w) => (
                <div
                  key={w.venue}
                  className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5"
                >
                  <span className="text-3xl leading-none" aria-hidden>{w.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-200">{w.city}</div>
                    <div className="truncate text-xs text-slate-400">{w.label}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xl font-extrabold tabular-nums">{w.tempC != null ? `${w.tempC}°` : "–"}</div>
                    {w.high != null && w.low != null && (
                      <div className="text-[10px] tabular-nums text-slate-500">{w.high}° / {w.low}°</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-3 text-[10px] text-slate-600">Väderdata från Open-Meteo · uppdateras ~var 30:e minut.</p>
          </div>
        </div>
      )}
    </>
  );
}
