import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { BRACKET, BRACKET_BY_NUMBER, type KnockoutStage } from "@/lib/bracket-template";
import { ExportActions } from "@/components/ExportActions";

export const dynamic = "force-dynamic";

const LETTERS = "ABCDEFGHIJKL".split("");

const STAGE_ORDER: { stage: KnockoutStage; title: string; cols: string }[] = [
  { stage: "R32", title: "Sextondelsfinaler", cols: "grid-cols-2 sm:grid-cols-3 print:grid-cols-4" },
  { stage: "R16", title: "Åttondelsfinaler", cols: "grid-cols-2 sm:grid-cols-3 print:grid-cols-4" },
  { stage: "QF", title: "Kvartsfinaler", cols: "grid-cols-2 print:grid-cols-4" },
  { stage: "SF", title: "Semifinaler", cols: "grid-cols-2" },
  { stage: "THIRD", title: "Bronsmatch", cols: "grid-cols-1" },
  { stage: "FINAL", title: "Final", cols: "grid-cols-1" },
];

export default async function ExportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const [teams, groupMatches, matchPreds, groupPreds, bracketPreds] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true, code: true, flag: true, groupId: true } }),
    prisma.match.findMany({
      where: { stage: "GROUP" },
      select: { matchNumber: true, groupId: true, homeTeamId: true, awayTeamId: true, kickoff: true },
      orderBy: { matchNumber: "asc" },
    }),
    prisma.matchPrediction.findMany({
      where: { userId: user.id },
      include: { match: { select: { matchNumber: true } } },
    }),
    prisma.groupPrediction.findMany({ where: { userId: user.id } }),
    prisma.bracketPrediction.findMany({ where: { userId: user.id }, orderBy: { matchNumber: "asc" } }),
  ]);

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const tag = (id?: string | null) => {
    const t = id ? teamById.get(id) : null;
    return t ? `${t.flag} ${t.code}` : null;
  };

  const tippingMode = user.league.tippingMode as "EXACT" | "X12";

  const predByNum = new Map<number, { h: number | null; a: number | null; o: string | null }>();
  for (const p of matchPreds) {
    predByNum.set(p.match.matchNumber, { h: p.predHome, a: p.predAway, o: p.predOutcome });
  }
  const predText = (n: number): string => {
    const p = predByNum.get(n);
    if (!p) return "—";
    if (tippingMode === "X12") return p.o ?? "—";
    return p.h != null && p.a != null ? `${p.h}–${p.a}` : "—";
  };

  const groupPredByLetter = new Map(groupPreds.map((g) => [g.groupId, g]));
  const bracketByNum = new Map(bracketPreds.map((b) => [b.matchNumber, b]));

  const matchesByGroup: Record<string, typeof groupMatches> = {};
  for (const m of groupMatches) (matchesByGroup[m.groupId!] ??= []).push(m);

  const champion = tag(bracketByNum.get(104)?.winnerTeamId);
  const generated = new Date().toLocaleString("sv-SE", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Stockholm",
  });

  // Sidor i en knockout-match: tippat lag, annars slot-etikett ("2A", "W74"…).
  const koSide = (matchNumber: number, which: "team1" | "team2"): { label: string; muted: boolean } => {
    const b = bracketByNum.get(matchNumber);
    const teamId = which === "team1" ? b?.team1Id : b?.team2Id;
    const t = tag(teamId);
    if (t) return { label: t, muted: false };
    const slot = BRACKET_BY_NUMBER[matchNumber];
    return { label: which === "team1" ? slot.home : slot.away, muted: true };
  };

  return (
    <div className="mx-auto max-w-4xl">
      <ExportActions />

      <div className="print-doc overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
        {/* Svensk flagg-accent */}
        <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, #006AA7 50%, #FECC00 50%)" }} />

        <div className="space-y-6 p-7 sm:p-9">
          {/* Rubrik */}
          <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">VM-tips 2026 — {user.displayName}</h1>
              <p className="text-sm text-slate-500">
                Liga: {user.league.name} · Läge: {tippingMode === "X12" ? "1 / X / 2" : "Exakt resultat"}
              </p>
            </div>
            <div className="text-right text-xs text-slate-400">
              <div>Genererat {generated}</div>
              {champion && <div className="mt-0.5 text-sm font-semibold text-slate-700">🏆 {champion}</div>}
            </div>
          </header>

          {/* Gruppspel */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-pitch-700">Gruppspel</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
              {LETTERS.map((letter) => {
                const ms = matchesByGroup[letter] ?? [];
                const gp = groupPredByLetter.get(letter);
                const advance = gp ? [tag(gp.rank1TeamId), tag(gp.rank2TeamId)].filter(Boolean) : [];
                return (
                  <div key={letter} className="print-avoid-break rounded-lg border border-slate-200 p-2.5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-sm font-bold">Grupp {letter}</span>
                      {advance.length > 0 && (
                        <span className="text-[10px] font-medium text-pitch-700">
                          Vidare: {advance.join(" · ")}
                        </span>
                      )}
                    </div>
                    <table className="w-full text-[11px]">
                      <tbody>
                        {ms.map((m) => (
                          <tr key={m.matchNumber} className="border-t border-slate-100 first:border-0">
                            <td className="py-0.5 pr-1 text-right text-slate-700">{tag(m.homeTeamId) ?? "?"}</td>
                            <td className="px-1 py-0.5 text-center font-bold tabular-nums text-slate-900">{predText(m.matchNumber)}</td>
                            <td className="py-0.5 pl-1 text-slate-700">{tag(m.awayTeamId) ?? "?"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Slutspel */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-pitch-700">Slutspelsträd</h2>
            {STAGE_ORDER.map(({ stage, title, cols }) => {
              const slots = BRACKET.filter((b) => b.stage === stage);
              return (
                <div key={stage} className="space-y-1.5">
                  <h3 className="text-xs font-semibold text-slate-500">{title}</h3>
                  <div className={`grid gap-2 ${cols}`}>
                    {slots.map((slot) => {
                      const b = bracketByNum.get(slot.matchNumber);
                      const s1 = koSide(slot.matchNumber, "team1");
                      const s2 = koSide(slot.matchNumber, "team2");
                      const win = b?.winnerTeamId ?? null;
                      const w1 = win != null && b?.team1Id === win;
                      const w2 = win != null && b?.team2Id === win;
                      return (
                        <div
                          key={slot.matchNumber}
                          className="print-avoid-break rounded-lg border border-slate-200 p-2 text-[11px]"
                        >
                          <div className="mb-1 text-[9px] font-medium text-slate-400">#{slot.matchNumber}</div>
                          <div className={`flex justify-between ${w1 ? "font-bold text-pitch-700" : s1.muted ? "text-slate-400" : "text-slate-800"}`}>
                            <span className="truncate">{s1.label}</span>
                            {w1 && <span>✓</span>}
                          </div>
                          <div className={`flex justify-between ${w2 ? "font-bold text-pitch-700" : s2.muted ? "text-slate-400" : "text-slate-800"}`}>
                            <span className="truncate">{s2.label}</span>
                            {w2 && <span>✓</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>

          <footer className="border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400">
            VM-tips 2026 · {user.league.name}
          </footer>
        </div>
      </div>
    </div>
  );
}
