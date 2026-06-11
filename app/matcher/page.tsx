import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { scoreGroupMatch } from "@/lib/scoring";
import { PageHeading } from "@/components/PageHeading";
import { CountryGroupFilters } from "@/components/CountryGroupFilters";

export const dynamic = "force-dynamic";

const STAGE_SHORT: Record<string, string> = {
  R32: "R32", R16: "R16", QF: "QF", SF: "SF", THIRD: "3:e", FINAL: "FIN",
};

// ── Matchdetaljer (lagras i Match.details av sync-service) ────────────────────
interface MatchGoalData {
  side: "HOME" | "AWAY";
  player: string;
  minute: number | null;
  type: string | null;
  assist: string | null;
}
interface MatchCardData {
  side: "HOME" | "AWAY";
  player: string;
  minute: number | null;
  card: "YELLOW" | "RED" | "YELLOW_RED";
}
interface MatchDetailsData {
  goals: MatchGoalData[];
  cards: MatchCardData[];
  shootout: { home: number; away: number } | null;
}

type MatchEvent =
  | { kind: "goal"; minute: number | null; data: MatchGoalData }
  | { kind: "card"; minute: number | null; data: MatchCardData };

function sideEvents(det: MatchDetailsData, side: "HOME" | "AWAY"): MatchEvent[] {
  const evs: MatchEvent[] = [
    ...det.goals.filter((g) => g.side === side).map((g) => ({ kind: "goal" as const, minute: g.minute, data: g })),
    ...det.cards.filter((c) => c.side === side).map((c) => ({ kind: "card" as const, minute: c.minute, data: c })),
  ];
  return evs.sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));
}

const CARD_EMOJI: Record<string, string> = { YELLOW: "🟨", RED: "🟥", YELLOW_RED: "🟨🟥" };

function goalSuffix(type: string | null): string {
  if (type === "OWN") return " (självmål)";
  if (type === "PENALTY") return " (straff)";
  return "";
}

// Klickbar förhandsvisning under matchraden.
function MatchEventsPreview({ det }: { det: MatchDetailsData }) {
  const goals = det.goals.length;
  const yellows = det.cards.filter((c) => c.card === "YELLOW").length;
  const reds = det.cards.filter((c) => c.card === "RED" || c.card === "YELLOW_RED").length;
  const parts: string[] = [];
  if (goals) parts.push(`⚽ ${goals}`);
  if (yellows) parts.push(`🟨 ${yellows}`);
  if (reds) parts.push(`🟥 ${reds}`);
  if (det.shootout) parts.push(`straffar ${det.shootout.home}–${det.shootout.away}`);

  return (
    <div className="flex items-center gap-1.5 px-2 pb-1.5 text-[10px] text-slate-500">
      <span className="inline-block transition-transform group-open:rotate-90">▸</span>
      <span className="truncate">{parts.join(" · ")}</span>
      <span className="ml-auto shrink-0 text-slate-600 group-open:hidden">detaljer</span>
    </div>
  );
}

// Full lista: målgörare och kort i två kolumner (hemma vänster, borta höger) + straffar.
function MatchEvents({ det }: { det: MatchDetailsData }) {
  const home = sideEvents(det, "HOME");
  const away = sideEvents(det, "AWAY");

  const renderEvent = (e: MatchEvent, align: "left" | "right") => {
    const reverse = align === "right";
    const min = e.minute != null ? `${e.minute}'` : "";
    const icon = e.kind === "goal" ? "⚽" : CARD_EMOJI[e.data.card] ?? "🟨";
    const name = e.kind === "goal" ? `${e.data.player}${goalSuffix(e.data.type)}` : e.data.player;
    const assist = e.kind === "goal" && e.data.assist ? ` ↳ ${e.data.assist}` : "";
    return (
      <div className={`flex items-baseline gap-1.5 ${reverse ? "flex-row-reverse" : ""}`}>
        <span className="shrink-0 tabular-nums text-slate-500">{min}</span>
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 truncate text-slate-200">
          {name}
          {assist && <span className="text-slate-500">{assist}</span>}
        </span>
      </div>
    );
  };

  return (
    <div className="px-2 pb-2 pt-0.5 text-[11px]">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <div className="space-y-1">{home.map((e, i) => <div key={i}>{renderEvent(e, "left")}</div>)}</div>
        <div className="space-y-1">{away.map((e, i) => <div key={i}>{renderEvent(e, "right")}</div>)}</div>
      </div>
      {det.shootout && (
        <div className="mt-1.5 border-t border-white/[0.06] pt-1.5 text-center text-[10px] font-semibold text-slate-300">
          Straffläggning: {det.shootout.home}–{det.shootout.away}
        </div>
      )}
    </div>
  );
}

function paramValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

export default async function MatcherPage({
  searchParams,
}: {
  searchParams?: { q?: string | string[] };
}) {
  const user = await getCurrentUser();
  const query = paramValue(searchParams?.q);
  const q = normalized(query);

  const [matches, preds] = await Promise.all([
    prisma.match.findMany({
      include: { homeTeam: true, awayTeam: true },
      orderBy: { matchNumber: "asc" },
    }),
    // Utloggade ser matcherna publikt — bara inloggades egna tips visas i tipskolumnen.
    user
      ? prisma.matchPrediction.findMany({
          where: { userId: user.id },
          include: { match: { select: { matchNumber: true } } },
        })
      : [],
  ]);

  const predByNum = new Map(preds.map((p) => [p.match.matchNumber, p]));
  const filteredMatches = matches.filter((m) => {
    const queryMatch =
      !q ||
      [m.groupId, m.homeTeam?.groupId, m.awayTeam?.groupId, m.homeTeam?.name, m.homeTeam?.code, m.awayTeam?.name, m.awayTeam?.code, m.homeSlot, m.awaySlot]
        .filter(Boolean)
        .some((value) => normalized(String(value)).includes(q));

    return queryMatch;
  });

  // Group by date (Swedish timezone)
  const byDate = new Map<string, typeof matches>();
  for (const m of filteredMatches) {
    const key = m.kickoff.toLocaleDateString("sv-SE", {
      weekday: "short", day: "numeric", month: "short",
      timeZone: "Europe/Stockholm",
    });
    (byDate.get(key) ?? byDate.set(key, []).get(key)!).push(m);
  }

  return (
    <div>
      <PageHeading
        title="Matcher"
      >
      <div className="space-y-3">
        <CountryGroupFilters basePath="/matcher" query={query} count={filteredMatches.length} />

        {filteredMatches.length === 0 && (
          <p className="card p-4 text-sm text-slate-400">Inga matcher matchar filtret.</p>
        )}

        {[...byDate.entries()].map(([date, ms]) => (
          <section key={date}>
            {/* Sticky date header */}
            <div className="sticky top-[53px] z-10 flex items-center gap-2 py-1.5">
              <span className="text-xs font-semibold capitalize text-slate-300">{date}</span>
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-[10px] text-slate-600">{ms.length}st</span>
            </div>

            {/* Match rows – 2-column on desktop, boxat i ett kort som övriga flikar */}
            <div className="card overflow-hidden p-0 sm:grid sm:grid-cols-2">
              {ms.map((m) => {
                const pred = predByNum.get(m.matchNumber);
                const finished = m.status === "FINISHED" && m.homeScore != null && m.awayScore != null;
                const live = m.status === "LIVE";

                let pts: number | null = null;
                if (finished && pred && m.stage === "GROUP" && pred.predHome != null && pred.predAway != null) {
                  pts = scoreGroupMatch(
                    { predHome: pred.predHome as number, predAway: pred.predAway as number },
                    { homeScore: m.homeScore!, awayScore: m.awayScore! },
                  ).points;
                }

                const time = m.kickoff.toLocaleTimeString("sv-SE", {
                  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm",
                });
                const homeSide = m.homeTeam
                  ? `${m.homeTeam.flag} ${m.homeTeam.code}`
                  : (m.homeSlot ?? "?");
                const awaySide = m.awayTeam
                  ? `${m.awayTeam.flag} ${m.awayTeam.code}`
                  : (m.awaySlot ?? "?");
                const homeGroupHref = m.homeTeam?.groupId ? `/grupper#grupp-${m.homeTeam.groupId}` : null;
                const awayGroupHref = m.awayTeam?.groupId ? `/grupper#grupp-${m.awayTeam.groupId}` : null;
                const label = m.stage === "GROUP"
                  ? (m.groupId ?? "")
                  : (STAGE_SHORT[m.stage] ?? m.stage);

                const tipText = pred
                  ? pred.predOutcome
                    ? pred.predOutcome
                    : pred.predHome != null && pred.predAway != null
                      ? `${pred.predHome}–${pred.predAway}`
                      : null
                  : null;

                const det = (m.details as unknown as MatchDetailsData | null) ?? null;
                const evCount = det ? det.goals.length + det.cards.length : 0;
                const hasDetails = !!det && (evCount > 0 || det.shootout != null);

                const gridCls =
                  "grid grid-cols-[2.5rem_1fr_3rem_1fr_3.5rem] items-center gap-x-1.5 px-2 py-2 text-xs";

                const row = (
                  <>
                    {/* Time */}
                    <span className="text-right text-slate-500 tabular-nums">{time}</span>

                    {/* Home */}
                    {homeGroupHref ? (
                      <Link
                        href={homeGroupHref}
                        className="min-w-0 truncate text-right font-medium text-slate-200 transition hover:text-flag-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flag-500"
                        title={`Visa gruppen för ${homeSide}`}
                      >
                        {homeSide}
                      </Link>
                    ) : (
                      <span className="min-w-0 truncate text-right font-medium text-slate-200">{homeSide}</span>
                    )}

                    {/* Score / placeholder */}
                    <span className={`rounded py-0.5 text-center font-bold tabular-nums ${
                      finished
                        ? "bg-white/10 text-white"
                        : live
                          ? "bg-red-500/20 text-red-300"
                          : "text-slate-600"
                    }`}>
                      {finished || live
                        ? `${m.homeScore ?? 0}–${m.awayScore ?? 0}`
                        : "–"}
                    </span>

                    {/* Away */}
                    {awayGroupHref ? (
                      <Link
                        href={awayGroupHref}
                        className="min-w-0 truncate font-medium text-slate-200 transition hover:text-flag-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flag-500"
                        title={`Visa gruppen för ${awaySide}`}
                      >
                        {awaySide}
                      </Link>
                    ) : (
                      <span className="min-w-0 truncate font-medium text-slate-200">{awaySide}</span>
                    )}

                    {/* Label + tip */}
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[10px] font-bold text-slate-700">{label}</span>
                      {tipText && (
                        <span className={`text-[10px] tabular-nums ${pts != null && pts > 0 ? "text-pitch-300 font-semibold" : "text-slate-500"}`}>
                          {tipText}{pts != null ? ` +${pts}` : ""}
                        </span>
                      )}
                    </div>
                  </>
                );

                if (!hasDetails) {
                  return (
                    <div key={m.id} className={`${gridCls} border-b border-white/[0.06] last:border-0`}>
                      {row}
                    </div>
                  );
                }

                return (
                  <details key={m.id} className="group border-b border-white/[0.06] last:border-0">
                    <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                      <div className={gridCls}>{row}</div>
                      <MatchEventsPreview det={det!} />
                    </summary>
                    <MatchEvents det={det!} />
                  </details>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      </PageHeading>
    </div>
  );
}
