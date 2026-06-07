// Aggregerar målminuter från sparade matchdetaljer (Match.details.goals) till
// 5-minutersintervall. Rena funktioner — matchdata hämtas av anroparen.
//
// Mål utan känd minut (minute == null) ignoreras (football-data.org gratisnivå
// saknar events; minuter finns bara när en detaljkälla är konfigurerad).
// Tilläggstid läggs i sitt halvlekssista intervall: 45+ -> hamnar i 40-45-bucketen
// är fel, så vi behandlar minut 46-90 normalt och allt >90 i en egen "90+"-bucket.

export interface GoalDatum {
  side: "HOME" | "AWAY";
  minute: number | null;
  type: string | null;
}

export interface MatchGoals {
  homeTeamId: string | null;
  awayTeamId: string | null;
  status: string;
  details: unknown;
}

interface DetailsShape {
  goals?: GoalDatum[];
}

// 5-minutersintervall 0-90 + en sista "90+"-bucket för tilläggstid/övertid.
export interface MinuteBucket {
  label: string; // "1-5", "6-10", ... "86-90", "90+"
  start: number;
  end: number; // inklusivt; Infinity för sista
  count: number;
}

export interface GoalMinuteSummary {
  buckets: MinuteBucket[];
  total: number; // antal inräknade mål (med känd minut)
  max: number; // högsta bucket-count (för normalisering av intensitet)
  peak: MinuteBucket | null; // intervallet med flest mål
  matchesWithMinuteData: number; // hur många avgjorda matcher som faktiskt bidrog med minutdata
}

function emptyBuckets(): MinuteBucket[] {
  const out: MinuteBucket[] = [];
  for (let start = 1; start <= 86; start += 5) {
    out.push({ label: `${start}-${start + 4}`, start, end: start + 4, count: 0 });
  }
  out[out.length - 1].end = 90;
  out[out.length - 1].label = "86-90";
  out.push({ label: "90+", start: 91, end: Infinity, count: 0 });
  return out;
}

function bucketIndexFor(minute: number, buckets: MinuteBucket[]): number {
  if (minute >= 91) return buckets.length - 1; // tilläggstid/övertid
  // minut 1..90 -> index 0..17 (5-minutersband). Minut 0 räknas som 1-5.
  const m = Math.max(1, minute);
  return Math.min(buckets.length - 2, Math.floor((m - 1) / 5));
}

// Aggregerar mål per intervall.
// - filterTeamId: räkna bara mål av/mot detta lag (för Sverige-fliken).
// - perspective: "scored" = lagets egna mål, "conceded" = insläppta mål.
//   Ignoreras om filterTeamId saknas (då räknas alla mål).
// - includeOwnGoals: självmål räknas normalt med i totalen för "när faller mål".
export function computeGoalMinutes(
  matches: MatchGoals[],
  opts: { filterTeamId?: string; perspective?: "scored" | "conceded" } = {},
): GoalMinuteSummary {
  const buckets = emptyBuckets();
  const { filterTeamId, perspective } = opts;

  let total = 0;
  let matchesWithMinuteData = 0;

  const finished = matches.filter((m) => m.status === "FINISHED" || m.status === "LIVE");

  for (const m of finished) {
    const d = (m.details ?? null) as DetailsShape | null;
    const goals = d?.goals;
    if (!goals || goals.length === 0) continue;

    let contributed = false;
    for (const g of goals) {
      if (g.minute == null) continue;

      if (filterTeamId) {
        // Vilket lag gjorde målet? Hänsyn till självmål: ett OWN-mål av HOME-sidan
        // gynnar AWAY-laget och vice versa.
        const scoringSide: "HOME" | "AWAY" =
          g.type === "OWN" ? (g.side === "HOME" ? "AWAY" : "HOME") : g.side;
        const scoringTeamId = scoringSide === "HOME" ? m.homeTeamId : m.awayTeamId;
        const concedingTeamId = scoringSide === "HOME" ? m.awayTeamId : m.homeTeamId;

        const relevant =
          perspective === "conceded"
            ? concedingTeamId === filterTeamId
            : scoringTeamId === filterTeamId;
        if (!relevant) continue;
      }

      const idx = bucketIndexFor(g.minute, buckets);
      buckets[idx].count++;
      total++;
      contributed = true;
    }
    if (contributed) matchesWithMinuteData++;
  }

  let max = 0;
  let peak: MinuteBucket | null = null;
  for (const b of buckets) {
    if (b.count > max) max = b.count;
    if (peak == null || b.count > peak.count) peak = b.count > 0 ? b : peak;
  }
  if (peak && peak.count === 0) peak = null;

  return { buckets, total, max, peak, matchesWithMinuteData };
}
