import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { scoreGroupMatch } from "@/lib/scoring";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  GROUP: "Gruppspel",
  R32: "32-delsfinal",
  R16: "Åttondel",
  QF: "Kvartsfinal",
  SF: "Semifinal",
  THIRD: "Bronsmatch",
  FINAL: "Final",
};

export default async function MatcherPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const [matches, preds] = await Promise.all([
    prisma.match.findMany({
      include: { homeTeam: true, awayTeam: true },
      orderBy: { matchNumber: "asc" },
    }),
    prisma.matchPrediction.findMany({
      where: { userId: user.id },
      include: { match: { select: { matchNumber: true } } },
    }),
  ]);

  const predByNum = new Map(preds.map((p) => [p.match.matchNumber, p]));

  // Gruppera efter datum
  const byDate = new Map<string, typeof matches>();
  for (const m of matches) {
    const key = m.kickoff.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" });
    (byDate.get(key) ?? byDate.set(key, []).get(key)!).push(m);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Matcher</h1>
        <p className="text-sm text-slate-400">Resultat, ditt tips och poäng — uppdateras under turneringen.</p>
      </div>

      {[...byDate.entries()].map(([date, ms]) => (
        <section key={date} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{date}</h2>
          <div className="card divide-y divide-white/5">
            {ms.map((m) => {
              const pred = predByNum.get(m.matchNumber);
              const finished = m.status === "FINISHED" && m.homeScore != null && m.awayScore != null;
              const live = m.status === "LIVE";
              let pts: number | null = null;
              if (finished && pred && m.stage === "GROUP") {
                pts = scoreGroupMatch(
                  { predHome: pred.predHome, predAway: pred.predAway },
                  { homeScore: m.homeScore!, awayScore: m.awayScore! },
                ).points;
              }
              const homeName = m.homeTeam ? `${m.homeTeam.flag} ${m.homeTeam.code}` : m.homeSlot ?? "?";
              const awayName = m.awayTeam ? `${m.awayTeam.flag} ${m.awayTeam.code}` : m.awaySlot ?? "?";
              return (
                <div key={m.id} className="px-3 py-2.5 sm:px-4">
                  <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-500">
                    <span>{m.kickoff.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="chip">{STAGE_LABEL[m.stage]}</span>
                    {live && <span className="chip bg-red-500/20 text-red-300">LIVE</span>}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-right font-medium">{homeName}</span>
                    <span className="shrink-0 rounded-md bg-white/5 px-2 py-0.5 text-center text-base font-bold tabular-nums">
                      {finished || live ? `${m.homeScore ?? 0}–${m.awayScore ?? 0}` : "–"}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{awayName}</span>
                  </div>
                  {pred && (
                    <div className="mt-1 text-center text-xs text-slate-400">
                      Ditt tips: {pred.predHome}–{pred.predAway}
                      {pts != null && (
                        <span className={`ml-1 font-semibold ${pts > 0 ? "text-pitch-300" : "text-slate-500"}`}>
                          (+{pts} p)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
