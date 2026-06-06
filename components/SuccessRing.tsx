// Träffsäkerhetsring: andel av spelarens avgjorda gruppmatcher med rätt utfall.
// Ren presentationskomponent — all data räknas fram i serverkomponenten.
// Guldfärgad båge (flag-500) som knyter an till "guldkant"-temat.
export function SuccessRing({
  pct,
  correct,
  predicted,
  exact,
}: {
  pct: number;
  correct: number;
  predicted: number;
  exact: number;
}) {
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(100, Math.max(0, pct)) / 100);

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-16 w-16 shrink-0">
        <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke="#fecc02"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-sm font-extrabold tabular-nums">
          {pct}%
        </div>
      </div>
      <div className="text-xs text-slate-400">
        <div className="font-semibold text-slate-300">Träffsäkerhet</div>
        <div className="tabular-nums">{correct}/{predicted} rätt utfall</div>
        {exact > 0 && <div className="tabular-nums text-flag-300">{exact} exakta resultat</div>}
      </div>
    </div>
  );
}
