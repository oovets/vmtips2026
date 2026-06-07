// Live-data för VM 2026 från ESPN:s publika scoreboard-API (ingen nyckel krävs).
// Server-side, cachat kort och med tyst fallback (tom map) om API:t är nere —
// samma robusta mönster som lib/weather.ts och lib/news.ts. Inofficiellt API
// utan SLA, så det får ALDRIG blockera sidan: vid fel returneras tom data och
// UI:t faller tillbaka på den egna modellen/databasen.

export interface EspnOdds {
  // Avrundade procent för 1 / X / 2, härledda ur amerikanska moneyline-odds.
  homePct: number;
  drawPct: number;
  awayPct: number;
  // Decimalodds (för visning bredvid procenten).
  homeDec: number | null;
  drawDec: number | null;
  awayDec: number | null;
  provider: string;
}

export interface EspnMatch {
  homeCode: string;
  awayCode: string;
  state: "pre" | "in" | "post";
  homeScore: number | null;
  awayScore: number | null;
  clock: string | null; // t.ex. "63'" eller "HT" — bara under pågående match
  overUnder: number | null; // t.ex. 2.5
  odds: EspnOdds | null;
}

const REVALIDATE_SECONDS = 60;

// Amerikanska moneyline-odds -> implicit sannolikhet (0..1).
function moneylineToProb(odds: number | null | undefined): number | null {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

// Amerikanska moneyline-odds -> decimalodds.
function moneylineToDecimal(odds: number | null | undefined): number | null {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  const dec = odds > 0 ? odds / 100 + 1 : 100 / -odds + 1;
  return Math.round(dec * 100) / 100;
}

function parseNum(v: unknown): number | null {
  const n = typeof v === "string" ? parseInt(v, 10) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function buildOdds(raw: any): EspnOdds | null {
  const ml = raw?.moneyline;
  if (!ml) return null;
  const home = moneylineToProb(parseNum(ml.home?.close?.odds ?? ml.home?.open?.odds));
  const away = moneylineToProb(parseNum(ml.away?.close?.odds ?? ml.away?.open?.odds));
  const draw = moneylineToProb(parseNum(ml.draw?.close?.odds ?? ml.draw?.open?.odds));
  if (home == null || away == null || draw == null) return null;

  // Avmarginalisera (normalisera så de tre summerar till 100 %).
  const sum = home + away + draw;
  if (sum <= 0) return null;
  return {
    homePct: Math.round((home / sum) * 100),
    drawPct: Math.round((draw / sum) * 100),
    awayPct: Math.round((away / sum) * 100),
    homeDec: moneylineToDecimal(parseNum(ml.home?.close?.odds ?? ml.home?.open?.odds)),
    drawDec: moneylineToDecimal(parseNum(ml.draw?.close?.odds ?? ml.draw?.open?.odds)),
    awayDec: moneylineToDecimal(parseNum(ml.away?.close?.odds ?? ml.away?.open?.odds)),
    // Spelbolagets namn (t.ex. "DraftKings"). Tom sträng om ESPN inte uppger någon
    // källa — anroparen visar då bara en generisk etikett utan dinglande separator.
    provider: typeof raw?.provider?.displayName === "string" ? raw.provider.displayName : "",
  };
}

// YYYYMMDD i UTC — ESPN:s dates-parameter.
function espnDateParam(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

async function fetchDay(dateParam: string): Promise<EspnMatch[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dateParam}`;
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) return [];
    const data = await res.json();
    const events: any[] = Array.isArray(data?.events) ? data.events : [];
    const out: EspnMatch[] = [];

    for (const e of events) {
      const comp = e?.competitions?.[0];
      if (!comp) continue;
      const competitors: any[] = Array.isArray(comp.competitors) ? comp.competitors : [];
      const home = competitors.find((c) => c.homeAway === "home") ?? competitors[0];
      const away = competitors.find((c) => c.homeAway === "away") ?? competitors[1];
      const homeCode = home?.team?.abbreviation;
      const awayCode = away?.team?.abbreviation;
      if (!homeCode || !awayCode) continue;

      const stateRaw = e?.status?.type?.state;
      const state: EspnMatch["state"] = stateRaw === "in" ? "in" : stateRaw === "post" ? "post" : "pre";
      const oddsRaw = Array.isArray(comp.odds) ? comp.odds[0] : null;

      out.push({
        homeCode,
        awayCode,
        state,
        homeScore: state === "pre" ? null : parseNum(home?.score),
        awayScore: state === "pre" ? null : parseNum(away?.score),
        clock: state === "in" ? (e?.status?.type?.shortDetail ?? null) : null,
        overUnder: typeof oddsRaw?.overUnder === "number" ? oddsRaw.overUnder : null,
        odds: oddsRaw ? buildOdds(oddsRaw) : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

const key = (homeCode: string, awayCode: string) => `${homeCode}-${awayCode}`;

// Hämtar ESPN-matcher för givna datum och returnerar en uppslagskarta
// indexerad på "HOMECODE-AWAYCODE" (samma koder som lib/teams.ts). Tom karta
// vid fel — anroparen ska behandla det som "ingen ESPN-data".
export async function fetchEspnMatches(dates: Date[]): Promise<Map<string, EspnMatch>> {
  const params = [...new Set(dates.map(espnDateParam))];
  if (params.length === 0) return new Map();

  const results = await Promise.all(params.map(fetchDay));
  const map = new Map<string, EspnMatch>();
  for (const day of results) {
    for (const m of day) map.set(key(m.homeCode, m.awayCode), m);
  }
  return map;
}

// Slå upp en match oavsett hemma/borta-ordning (ESPN kan kasta om sidorna).
export function lookupEspn(
  map: Map<string, EspnMatch>,
  homeCode: string | null | undefined,
  awayCode: string | null | undefined,
): EspnMatch | null {
  if (!homeCode || !awayCode) return null;
  const direct = map.get(key(homeCode, awayCode));
  if (direct) return direct;
  // Omvänd ordning: spegla scoren så hemma/borta stämmer mot vår match.
  const rev = map.get(key(awayCode, homeCode));
  if (!rev) return null;
  return {
    ...rev,
    homeCode,
    awayCode,
    homeScore: rev.awayScore,
    awayScore: rev.homeScore,
    odds: rev.odds
      ? {
          ...rev.odds,
          homePct: rev.odds.awayPct,
          awayPct: rev.odds.homePct,
          homeDec: rev.odds.awayDec,
          awayDec: rev.odds.homeDec,
        }
      : null,
  };
}
