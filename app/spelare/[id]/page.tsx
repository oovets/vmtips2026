import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isAdminAuthed } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isLocked } from "@/lib/lock";
import { BRACKET, BRACKET_BY_NUMBER, type KnockoutStage } from "@/lib/bracket-template";

export const dynamic = "force-dynamic";

const LETTERS = "ABCDEFGHIJKL".split("");

const STAGE_ORDER: { stage: KnockoutStage; title: string; cols: string }[] = [
  { stage: "R32", title: "Sextondelsfinaler", cols: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" },
  { stage: "R16", title: "Åttondelsfinaler", cols: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" },
  { stage: "QF", title: "Kvartsfinaler", cols: "grid-cols-2 lg:grid-cols-4" },
  { stage: "SF", title: "Semifinaler", cols: "grid-cols-2" },
  { stage: "THIRD", title: "Bronsmatch", cols: "grid-cols-1" },
  { stage: "FINAL", title: "Final", cols: "grid-cols-1" },
];

export default async function PlayerPage({ params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me) redirect("/");

  const adminAuthed = await isAdminAuthed();

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      score: true,
      league: true,
      bracketPredictions: { orderBy: { matchNumber: "asc" } },
      groupPredictions: true,
      matchPredictions: { include: { match: { select: { matchNumber: true } } } },
    },
  });
  // Admin har full insyn i alla ligor; vanliga spelare bara sin egen liga.
  if (!target || (!adminAuthed && target.leagueId !== me.leagueId)) notFound();

  const [teams, groupMatches] = await Promise.all([
    prisma.team.findMany(),
    prisma.match.findMany({
      where: { stage: "GROUP" },
      select: { matchNumber: true, groupId: true, homeTeamId: true, awayTeamId: true },
      orderBy: { matchNumber: "asc" },
    }),
  ]);

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const name = (id?: string | null) =>
    id && teamById.get(id) ? `${teamById.get(id)!.flag} ${teamById.get(id)!.code}` : "—";

  const b = (target.score?.breakdown as Record<string, number> | undefined) ?? {};
  // Admin ser alltid (full insyn). Annars: efter lås, eller sin egen sida.
  const reveal = isLocked() || target.id === me.id || adminAuthed;
  const tippingMode = target.league.tippingMode as "EXACT" | "X12";

  // Tips-uppslag per matchnummer.
  const predByNum = new Map<number, { h: number | null; a: number | null; o: string | null }>();
  for (const p of target.matchPredictions) {
    predByNum.set(p.match.matchNumber, { h: p.predHome, a: p.predAway, o: p.predOutcome });
  }
  const predText = (n: number): string => {
    const p = predByNum.get(n);
    if (!p) return "–";
    if (tippingMode === "X12") return p.o ?? "–";
    return p.h != null && p.a != null ? `${p.h}–${p.a}` : "–";
  };

  const groupPredByLetter = new Map(target.groupPredictions.map((g) => [g.groupId, g]));
  const bracketByNum = new Map(target.bracketPredictions.map((p) => [p.matchNumber, p]));
  const matchesByGroup: Record<string, typeof groupMatches> = {};
  for (const m of groupMatches) (matchesByGroup[m.groupId!] ??= []).push(m);

  const champion = bracketByNum.get(104)?.winnerTeamId;
  const finalists = [101, 102]
    .map((n) => bracketByNum.get(n)?.winnerTeamId)
    .filter((x): x is string => !!x);

  const filledCount = [...predByNum.values()].filter((p) =>
    tippingMode === "X12" ? p.o != null : p.h != null && p.a != null,
  ).length;

  // En slutspelssida: tippat lag, annars slot-etikett ("2A", "W74"…).
  const koSide = (matchNumber: number, which: "team1" | "team2") => {
    const p = bracketByNum.get(matchNumber);
    const teamId = which === "team1" ? p?.team1Id : p?.team2Id;
    const t = teamId ? teamById.get(teamId) : null;
    if (t) return { label: `${t.flag} ${t.code}`, muted: false, win: p?.winnerTeamId === teamId };
    const slot = BRACKET_BY_NUMBER[matchNumber];
    return { label: which === "team1" ? slot.home : slot.away, muted: true, win: false };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <a href={adminAuthed ? "/admin" : "/leaderboard"} className="text-xs text-slate-400 hover:text-slate-200">
            ← {adminAuthed ? "Admin" : "Topplista"}
          </a>
          <h1 className="mt-1 text-2xl font-extrabold">{target.displayName}</h1>
          <p className="text-sm text-slate-400">
            {target.submitted ? "Lag inlämnat" : "Ej inlämnat"}
            {target.id === me.id && " · det här är du"}
            {adminAuthed && target.id !== me.id && (
              <span className="ml-1 text-flag-300">· {target.league.name} · admininsyn</span>
            )}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-slate-400">Totalpoäng</div>
          <div className="text-4xl font-extrabold">{target.score?.total ?? 0}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Gruppmatcher" value={b.groupMatches ?? 0} />
        <Stat label="Vidare ur grupp" value={b.advancement ?? 0} />
        <Stat label="Slutspel" value={b.knockout ?? 0} />
        <Stat label="Världsmästare" value={b.champion ?? 0} />
      </div>

      {!reveal ? (
        <div className="card p-6 text-center text-slate-400">
            Andra spelares tips visas först när turneringen startat.
        </div>
      ) : (
        <>
          {/* Sammanfattning slutspel */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="card p-4">
              <h2 className="mb-3 font-bold">Slutspelstips</h2>
              <p className="text-sm">🏆 Mästare: <strong>{name(champion)}</strong></p>
              <p className="mt-1 text-sm text-slate-300">
                Finalister: {finalists.length ? finalists.map((f) => name(f)).join(" · ") : "—"}
              </p>
            </div>
            <div className="card p-4">
              <h2 className="mb-3 font-bold">Gruppsegrare</h2>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {LETTERS.map((letter) => {
                  const gp = groupPredByLetter.get(letter);
                  return (
                    <div key={letter}>
                      <span className="text-slate-500">{letter}:</span> {name(gp?.rank1TeamId)}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Gruppspel: ranking + matchtips */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold">Gruppspel</h2>
              <span className="text-xs text-slate-500">{filledCount}/72 matcher tippade</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {LETTERS.map((letter) => {
                const gp = groupPredByLetter.get(letter);
                const ranks = gp
                  ? [gp.rank1TeamId, gp.rank2TeamId, gp.rank3TeamId, gp.rank4TeamId]
                  : [];
                const ms = matchesByGroup[letter] ?? [];
                return (
                  <div key={letter} className="card p-4">
                    <h3 className="mb-2 text-base font-bold">Grupp {letter}</h3>
                    {ranks.length > 0 ? (
                      <ol className="mb-3 space-y-0.5 text-sm">
                        {ranks.map((id, i) => (
                          <li key={i} className={i < 2 ? "text-pitch-100" : "text-slate-400"}>
                            <span className="mr-1 tabular-nums text-slate-500">{i + 1}.</span>
                            {name(id)}
                            {i < 2 && <span className="ml-1 text-[10px] text-pitch-400">vidare</span>}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="mb-3 text-sm text-slate-500">Ingen ranking tippad.</p>
                    )}
                    <table className="w-full text-xs">
                      <tbody>
                        {ms.map((m) => (
                          <tr key={m.matchNumber} className="border-t border-white/5">
                            <td className="py-1 pr-1 text-right text-slate-300">{name(m.homeTeamId)}</td>
                            <td className="px-2 py-1 text-center font-bold tabular-nums">{predText(m.matchNumber)}</td>
                            <td className="py-1 pl-1 text-slate-300">{name(m.awayTeamId)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Slutspelsträd */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Slutspelsträd</h2>
            {STAGE_ORDER.map(({ stage, title, cols }) => (
              <div key={stage} className="space-y-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
                <div className={`grid gap-2 ${cols}`}>
                  {BRACKET.filter((s) => s.stage === stage).map((slot) => {
                    const s1 = koSide(slot.matchNumber, "team1");
                    const s2 = koSide(slot.matchNumber, "team2");
                    return (
                      <div key={slot.matchNumber} className="card p-2 text-xs">
                        <div className="mb-1 text-[9px] font-medium text-slate-600">#{slot.matchNumber}</div>
                        <KoLine {...s1} />
                        <KoLine {...s2} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function KoLine({ label, muted, win }: { label: string; muted: boolean; win: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-1 ${
        win ? "font-bold text-pitch-200" : muted ? "text-slate-600" : "text-slate-200"
      }`}
    >
      <span className="min-w-0 truncate">{label}</span>
      {win && <span className="shrink-0 text-pitch-400">✓</span>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-3 text-center">
      <div className="text-2xl font-extrabold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
