/*
 * Skrapar historisk mästerskapsdata (mål med minuter, kort, resultat) från
 * Wikipedias rena wikitext-API och skriver en aggregerad JSON till
 * data/tournament-history.json. Engångs-/on-demand-skript — körs lokalt med:
 *
 *   npx tsx scripts/scrape-history.ts
 *
 * Ingen runtime-skrapning: dashboarden läser bara den färdiga JSON-filen.
 * Källa: Wikipedia "{{Football box}}"-mallar i grupp- och slutspelssidorna.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const API = "https://en.wikipedia.org/w/api.php";
const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H"];

// Vilka mästerskap som ska skrapas. Sidtitlar följer Wikipedias mönster.
const TOURNAMENTS: { id: string; label: string; year: number; groupPages: string[]; knockoutPage: string }[] = [
  {
    id: "WC2022",
    label: "VM 2022",
    year: 2022,
    groupPages: GROUPS.map((g) => `2022_FIFA_World_Cup_Group_${g}`),
    knockoutPage: "2022_FIFA_World_Cup_knockout_stage",
  },
  {
    id: "WC2018",
    label: "VM 2018",
    year: 2018,
    groupPages: GROUPS.map((g) => `2018_FIFA_World_Cup_Group_${g}`),
    knockoutPage: "2018_FIFA_World_Cup_knockout_stage",
  },
  {
    id: "WC2014",
    label: "VM 2014",
    year: 2014,
    groupPages: GROUPS.map((g) => `2014_FIFA_World_Cup_Group_${g}`),
    knockoutPage: "2014_FIFA_World_Cup_knockout_stage",
  },
  {
    id: "WC2010",
    label: "VM 2010",
    year: 2010,
    groupPages: GROUPS.map((g) => `2010_FIFA_World_Cup_Group_${g}`),
    knockoutPage: "2010_FIFA_World_Cup_knockout_stage",
  },
  {
    id: "WC2006",
    label: "VM 2006",
    year: 2006,
    groupPages: GROUPS.map((g) => `2006_FIFA_World_Cup_Group_${g}`),
    knockoutPage: "2006_FIFA_World_Cup_knockout_stage",
  },
];

export interface HistGoal {
  team: 1 | 2; // vilket lag i matchen (team1/team2)
  player: string;
  minute: number; // basminut (45+1 -> 45)
  stoppage: number; // tilläggsminuter (45+1 -> 1), annars 0
  penalty: boolean;
  ownGoal: boolean;
}

export interface HistMatch {
  stage: "group" | "knockout";
  team1: string;
  team2: string;
  score1: number | null;
  score2: number | null;
  attendance: number | null;
  goals: HistGoal[];
  sentOff: number; // antal röda kort (sent off)
  // Straffläggning (slutspel): [team1-straffar, team2-straffar] eller null.
  shootout: [number, number] | null;
}

export interface HistTournament {
  id: string;
  label: string;
  year: number;
  matches: HistMatch[];
}

async function fetchWikitext(title: string, attempt = 1): Promise<string | null> {
  const url = `${API}?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&titles=${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "vmtips2026-history-scraper/1.0 (contact: vmtips)" } });
    if (res.ok) {
      const data: any = await res.json();
      const page: any = Object.values(data?.query?.pages ?? {})[0];
      if (!page) throw new Error("inget page-objekt");
      if (page.missing !== undefined) return null; // sidan finns inte (inte ett fel att retrya)
      const text = page?.revisions?.[0]?.slots?.main?.["*"];
      if (typeof text === "string") return text;
      throw new Error("ingen wikitext i svaret");
    }
    // 429 = rate limit: backa av rejält och respektera Retry-After om den finns.
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "", 10);
      const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 3000 * attempt;
      if (attempt < 6) {
        await new Promise((r) => setTimeout(r, waitMs));
        return fetchWikitext(title, attempt + 1);
      }
    }
    throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    if (attempt >= 6) {
      console.warn(`  ⚠ ${title}: gav upp efter ${attempt} försök (${(e as Error).message})`);
      return null;
    }
    await new Promise((r) => setTimeout(r, 1000 * attempt)); // linjär backoff
    return fetchWikitext(title, attempt + 1);
  }
}

// Delar upp ett {{Football box}}-block i toppnivåparametrar. Vi kan inte bara
// splitta på "|" eftersom mallar/länkar innehåller egna "|". Istället scannar vi
// tecken för tecken och räknar djup för {{ }} och [[ ]] — en "|" på djup 0
// inleder en ny parameter.
function parseParams(block: string): Record<string, string> {
  // Skala av yttre mall-prefix (båda varianterna) och avslutande "}}".
  // "{{#invoke:Football box|main|section=a1|date=..." -> strippa fram till första
  // riktiga parametern. "{{Football box|date=..." -> strippa prefixet.
  let inner = block.replace(/^\{\{\s*#invoke:\s*Football box\s*\|\s*main\s*(\|\s*section=[^|]*)?/i, "");
  inner = inner.replace(/^\{\{\s*Football box/i, "");
  inner = inner.replace(/\}\}\s*$/, "");

  const params: Record<string, string> = {};
  let depthCurly = 0;
  let depthSquare = 0;
  let current = "";
  const segments: string[] = [];

  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    const c2 = inner[i + 1];
    if (c === "{" && c2 === "{") { depthCurly++; current += "{{"; i++; continue; }
    if (c === "}" && c2 === "}") { depthCurly--; current += "}}"; i++; continue; }
    if (c === "[" && c2 === "[") { depthSquare++; current += "[["; i++; continue; }
    if (c === "]" && c2 === "]") { depthSquare--; current += "]]"; i++; continue; }
    if (c === "|" && depthCurly === 0 && depthSquare === 0) {
      segments.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  segments.push(current);

  for (const seg of segments) {
    const eq = seg.indexOf("=");
    if (eq === -1) continue;
    const key = seg.slice(0, eq).trim().toLowerCase();
    const val = seg.slice(eq + 1).trim();
    if (key) params[key] = val;
  }
  return params;
}

// "avar=fb|NED" / "...|NED}}" -> "NED". Plockar sista 3-bokstavskoden.
function teamCode(raw: string | null): string | null {
  if (!raw) return null;
  const codes = raw.match(/\b[A-Z]{3}\b/g);
  return codes ? codes[codes.length - 1] : null;
}

function parseScore(raw: string | null): [number | null, number | null] {
  if (!raw) return [null, null];
  // Ta bort {{score link|...|3–1}} -> "3–1", hantera en/dash-varianter.
  const m = raw.match(/(\d+)\s*[–\-:]\s*(\d+)/);
  if (!m) return [null, null];
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

function parseAttendance(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, "").match(/(\d{4,6})/);
  return m ? parseInt(m[1], 10) : null;
}

// Tolkar goals1/goals2-blocket: rader som
//   *[[Lionel Messi|Messi]] {{goal|10|pen.|64|90+3}}
//   *[[Player]] {{goal|23}} {{o.g.}}
function parseGoals(raw: string | null, team: 1 | 2): HistGoal[] {
  if (!raw) return [];
  const out: HistGoal[] = [];
  for (const line of raw.split("\n")) {
    const l = line.trim();
    if (!l.startsWith("*")) continue;

    // Spelarnamn: [[Länk|Visningsnamn]] eller [[Namn]]
    const nameMatch = l.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    const player = nameMatch ? (nameMatch[2] ?? nameMatch[1]).trim() : "?";

    // Alla {{goal|...}}-mallar på raden (kan finnas flera). Inuti varje mall
    // ligger minuter och markörer "pen." (straff) / "o.g." (självmål), t.ex.
    //   {{goal|12|o.g.}}   {{goal|43||90+1}}   {{goal|10|pen.|64}}
    const goalTemplates = l.match(/\{\{\s*goal\s*\|[^}]*\}\}/gi) ?? [];
    for (const g of goalTemplates) {
      const inner = g.replace(/\{\{\s*goal\s*\|/i, "").replace(/\}\}$/, "");
      const tokens = inner.split("|").map((t) => t.trim());
      // Markörer ("pen."/"o.g.") gäller minuten de står direkt efter. Vi går
      // igenom tokens i ordning och knyter en markör till senast sedda mål.
      let lastGoalIdx = -1;
      for (const tok of tokens) {
        const minMatch = tok.match(/^(\d{1,3})(?:\s*\+\s*(\d{1,2}))?$/);
        if (minMatch) {
          const minute = parseInt(minMatch[1], 10);
          if (minute < 1 || minute > 130) continue;
          const stoppage = minMatch[2] ? parseInt(minMatch[2], 10) : 0;
          out.push({ team, player, minute, stoppage, penalty: false, ownGoal: false });
          lastGoalIdx = out.length - 1;
        } else if (lastGoalIdx >= 0 && /\bpen\b/i.test(tok)) {
          out[lastGoalIdx].penalty = true;
        } else if (lastGoalIdx >= 0 && /\bo\.?\s*g\.?\b/i.test(tok)) {
          out[lastGoalIdx].ownGoal = true;
        }
      }
    }
  }
  return out;
}

// Hittar startindex för nästa football-box-mall från och med `from`. Stödjer
// både "{{Football box" (2022) och "{{#invoke:Football box" (2018).
function nextBoxStart(wikitext: string, from: number): number {
  const a = wikitext.indexOf("{{Football box", from);
  const b = wikitext.indexOf("{{#invoke:Football box", from);
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

function parseFootballBoxes(wikitext: string, stage: "group" | "knockout"): HistMatch[] {
  const matches: HistMatch[] = [];
  let idx = nextBoxStart(wikitext, 0);
  while (idx !== -1) {
    // Hitta matchande "}}" på blocknivå genom att räkna klammerdjup.
    let depth = 0;
    let end = idx;
    for (let i = idx; i < wikitext.length - 1; i++) {
      if (wikitext[i] === "{" && wikitext[i + 1] === "{") { depth++; i++; }
      else if (wikitext[i] === "}" && wikitext[i + 1] === "}") { depth--; i++; if (depth === 0) { end = i + 1; break; } }
    }
    const block = wikitext.slice(idx, end);
    const p = parseParams(block);

    const team1 = teamCode(p.team1 ?? null);
    const team2 = teamCode(p.team2 ?? null);
    if (team1 && team2) {
      const [score1, score2] = parseScore(p.score ?? null);
      const goals = [
        ...parseGoals(p.goals1 ?? null, 1),
        ...parseGoals(p.goals2 ?? null, 2),
      ];
      const sentOff = (block.match(/\{\{\s*sent off/gi) ?? []).length;
      // Straffläggning: "penaltyscore=3–2" -> [3, 2]. Bara i slutspel.
      const [pen1, pen2] = parseScore(p.penaltyscore ?? null);
      const shootout: [number, number] | null =
        pen1 != null && pen2 != null ? [pen1, pen2] : null;
      matches.push({
        stage,
        team1,
        team2,
        score1,
        score2,
        attendance: parseAttendance(p.attendance ?? null),
        goals,
        sentOff,
        shootout,
      });
    }

    idx = nextBoxStart(wikitext, end);
  }
  return matches;
}

async function scrapeTournament(t: (typeof TOURNAMENTS)[number]): Promise<HistTournament> {
  const matches: HistMatch[] = [];

  for (const page of t.groupPages) {
    const wt = await fetchWikitext(page);
    if (wt) matches.push(...parseFootballBoxes(wt, "group"));
    await new Promise((r) => setTimeout(r, 1200)); // snäll mot API:t (undvik 429)
  }

  const koWt = await fetchWikitext(t.knockoutPage);
  if (koWt) matches.push(...parseFootballBoxes(koWt, "knockout"));

  return { id: t.id, label: t.label, year: t.year, matches };
}

async function main() {
  const tournaments: HistTournament[] = [];
  for (const t of TOURNAMENTS) {
    process.stdout.write(`Skrapar ${t.label}... `);
    const data = await scrapeTournament(t);
    const goalCount = data.matches.reduce((s, m) => s + m.goals.length, 0);
    console.log(`${data.matches.length} matcher, ${goalCount} mål`);
    tournaments.push(data);
  }

  const outDir = join(process.cwd(), "data");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "tournament-history.json");
  writeFileSync(
    outPath,
    JSON.stringify({ scrapedAt: new Date().toISOString(), source: "en.wikipedia.org", tournaments }, null, 2),
  );
  console.log(`\nSkrev ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
