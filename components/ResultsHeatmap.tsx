// Resultatkarta: en heatmap över ALLA lag × ALLA omgångar. Varje cell färgas
// grön (vinst), grå (oavgjort) eller röd (förlust). Intensiteten speglar
// målskillnaden så stora segrar/förluster lyser starkare. Kommande matcher visas
// som tomma rutor och pågående matcher pulserar. Rent presentationslager – all
// data räknas fram i serverkomponenten och skickas in via `teams`.

export type CellState = "W" | "D" | "L" | "live" | "upcoming" | "none";

export interface HeatCell {
  state: CellState;
  margin: number; // målskillnad (positiv = lagets fördel), 0 om ej spelad
  title: string; // tooltip, t.ex. "32-del: 🇸🇪 SWE 2–1 🇧🇷 BRA"
}

export interface HeatTeam {
  id: string;
  code: string;
  flag: string;
  name: string;
  points: number; // poäng i turneringen (W=3, D=1) för sortering
  played: number;
  cells: HeatCell[]; // exakt COLUMNS.length celler
}

export const HEATMAP_COLUMNS = [
  { key: "G1", short: "1", title: "Grupp omg. 1" },
  { key: "G2", short: "2", title: "Grupp omg. 2" },
  { key: "G3", short: "3", title: "Grupp omg. 3" },
  { key: "R32", short: "32", title: "Sextondelsfinal" },
  { key: "R16", short: "8", title: "Åttondelsfinal" },
  { key: "QF", short: "K", title: "Kvartsfinal" },
  { key: "SF", short: "S", title: "Semifinal" },
  { key: "FINAL", short: "F", title: "Final / brons" },
] as const;

function cellClass(c: HeatCell): string {
  if (c.state === "none") return "bg-white/[0.02]";
  if (c.state === "upcoming") return "border border-dashed border-white/15 bg-white/[0.03]";
  if (c.state === "live") return "animate-pulse bg-amber-400/80 ring-1 ring-amber-300";
  if (c.state === "D") return "bg-slate-500/70";
  // Fulla literala klassnamn så Tailwind-JIT plockar upp dem.
  if (c.state === "W") {
    return c.margin >= 3 ? "bg-green-500/90" : c.margin === 2 ? "bg-green-500/75" : "bg-green-500/55";
  }
  return c.margin >= 3 ? "bg-red-500/90" : c.margin === 2 ? "bg-red-500/75" : "bg-red-500/55"; // L
}

// Själva rutnätet (kolumnrubriker + en rad per lag). Återanvänds både för
// mobilens enkolumnsvy och desktopens tvåkolumnsuppdelning.
function HeatGrid({ teams }: { teams: HeatTeam[] }) {
  return (
    <div>
      {/* Kolumnrubriker */}
      <div className="mb-1 flex items-center gap-1 pl-[104px] text-[10px] uppercase tracking-wide text-slate-500">
        {HEATMAP_COLUMNS.map((col) => (
          <div key={col.key} className="w-6 text-center" title={col.title}>
            {col.short}
          </div>
        ))}
        <div className="ml-2 w-8 text-right">P</div>
      </div>

      {/* Rader: ett lag per rad */}
      <div className="space-y-0.5">
        {teams.map((t) => (
          <div key={t.id} className="flex items-center gap-1">
            <div className="flex w-[100px] shrink-0 items-center gap-1.5 truncate text-xs">
              <span>{t.flag}</span>
              <span className="font-semibold text-slate-200">{t.code}</span>
            </div>
            {t.cells.map((c, i) => (
              <div
                key={i}
                title={c.title}
                className={`h-6 w-6 shrink-0 rounded-[3px] ${cellClass(c)}`}
              />
            ))}
            <div className="ml-2 w-8 text-right text-xs font-bold tabular-nums text-slate-300">
              {t.played > 0 ? t.points : "–"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResultsHeatmap({ teams }: { teams: HeatTeam[] }) {
  if (teams.length === 0) {
    return <p className="card p-4 text-sm text-slate-400">Ingen matchdata att visa än.</p>;
  }

  // Dela upp lagen i två halvor för desktopvyn. Lagen är redan sorterade på
  // poäng, så vänster kolumn = topplaget och fortsätter neråt i höger kolumn.
  const mid = Math.ceil(teams.length / 2);
  const leftTeams = teams.slice(0, mid);
  const rightTeams = teams.slice(mid);

  return (
    <div className="card p-4">
      {/* Mobil/surfplatta: en kolumn med horisontell scroll vid behov */}
      <div className="overflow-x-auto lg:hidden">
        <div className="min-w-[560px]">
          <HeatGrid teams={teams} />
        </div>
      </div>

      {/* Desktop: två kolumner sida vid sida så hela bredden utnyttjas */}
      <div className="hidden gap-x-8 lg:grid lg:grid-cols-2">
        <HeatGrid teams={leftTeams} />
        <HeatGrid teams={rightTeams} />
      </div>

      {/* Teckenförklaring */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-[3px] bg-green-500/75" /> Vinst</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-[3px] bg-slate-500/70" /> Oavgjort</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-[3px] bg-red-500/75" /> Förlust</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-[3px] bg-amber-400/80" /> Live</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-[3px] border border-dashed border-white/20" /> Kommande</span>
        <span className="text-slate-600">Starkare färg = större målskillnad</span>
      </div>
    </div>
  );
}
