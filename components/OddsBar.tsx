// En stapel som visar fördelningen hemmavinst / oavgjort / bortavinst. Varje
// segment har en färgprick + lagkod + procent under sig så det är självförklarande.
export function OddsBar({
  title,
  hint,
  homeCode,
  awayCode,
  home,
  draw,
  away,
  dim = false,
  highlight = "away",
}: {
  title: string;
  hint: string;
  homeCode: string;
  awayCode: string;
  home: number;
  draw: number;
  away: number;
  dim?: boolean;
  // Vilken sida som ska få den gula accentfärgen (resten blir blå/grön).
  // Default "home" bevarar tidigare beteende på dashboarden.
  highlight?: "home" | "away";
}) {
  const gold = dim ? "bg-flag-500/60" : "bg-flag-500";
  const blue = dim ? "bg-pitch-500/60" : "bg-pitch-500";
  const homeC = highlight === "home" ? gold : blue;
  const awayC = highlight === "away" ? gold : blue;
  const drawC = dim ? "bg-slate-500/60" : "bg-slate-500";
  const homeDot = highlight === "home" ? "bg-flag-500" : "bg-pitch-500";
  const awayDot = highlight === "away" ? "bg-flag-500" : "bg-pitch-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-slate-200">{title}</span>
        <span className="tabular-nums text-slate-500">{hint}</span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-white/5">
        <div style={{ width: `${home}%` }} className={homeC} />
        <div style={{ width: `${draw}%` }} className={drawC} />
        <div style={{ width: `${away}%` }} className={awayC} />
      </div>
      <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className={`h-2 w-2 shrink-0 rounded-full ${homeDot}`} />
          <span className="font-semibold text-slate-300">{homeCode}</span>
          <span className="tabular-nums">{home}%</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 shrink-0 rounded-full bg-slate-500" />
          Oavgjort <span className="tabular-nums">{draw}%</span>
        </span>
        <span className="flex items-center gap-1">
          <span className={`h-2 w-2 shrink-0 rounded-full ${awayDot}`} />
          <span className="font-semibold text-slate-300">{awayCode}</span>
          <span className="tabular-nums">{away}%</span>
        </span>
      </div>
    </div>
  );
}
