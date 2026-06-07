/*
 * Skrapar Sveriges hela VM-kvalresa 2025-26 (UEFA grupp B + playoff) från
 * Wikipedias wikitext-API och skriver data/sweden-qualifying.json.
 *
 *   npx tsx scripts/scrape-sweden-qualifying.ts
 *   (eller: pnpm scrape:sweden)
 *
 * Ingen runtime-skrapning: Sverige-fliken läser bara den färdiga JSON-filen.
 * Källa: Wikipedia "{{Football box}}"-mallar (samma format som historik-scrapern).
 *
 * Storyn: Sverige slutade SIST i grupp B utan en enda vinst (2p), men kvalade
 * via Nations League till playoff och slog Ukraina 3-1 (Gyökeres hattrick) och
 * Polen 3-2 i finalen för att nå sitt 13:e VM.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const API = "https://en.wikipedia.org/w/api.php";
const SWEDEN = "SWE";

// Sidor att skrapa. Gruppsidan har Sveriges 6 gruppmatcher; second_round har
// playoff-matcherna (vi filtrerar ut Sveriges).
const PAGES: { title: string; stage: "group" | "playoff" }[] = [
  { title: "2026 FIFA World Cup qualification – UEFA Group B", stage: "group" },
  { title: "2026 FIFA World Cup qualification – UEFA second round", stage: "playoff" },
];

export interface SweGoal {
  side: "SWE" | "OPP"; // Sveriges mål eller motståndarens
  player: string;
  minute: number; // basminut (90+3 -> 90)
  stoppage: number; // tilläggsminuter (90+3 -> 3), annars 0
  penalty: boolean;
  ownGoal: boolean;
}

export interface SweMatch {
  stage: "group" | "playoff";
  date: string; // ISO "2025-09-05"
  swedenHome: boolean; // spelade Sverige hemma?
  opponent: string; // motståndarkod, t.ex. "SVN"
  sweScore: number | null;
  oppScore: number | null;
  result: "W" | "D" | "L" | null;
  venue: string; // "Stadion, Stad"
  attendance: number | null;
  sentOff: number; // röda kort i matchen (båda lag)
  goals: SweGoal[]; // alla mål i matchen, sida-märkta
}

export interface SwedenQualifying {
  scrapedAt: string;
  source: string;
  matches: SweMatch[];
}

async function fetchWikitext(title: string, attempt = 1): Promise<string | null> {
  const url = `${API}?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&titles=${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "vmtips2026-sweden-scraper/1.0 (contact: vmtips)" } });
    if (res.ok) {
      const data: any = await res.json();
      const page: any = Object.values(data?.query?.pages ?? {})[0];
      if (!page) throw new Error("inget page-objekt");
      if (page.missing !== undefined) return null;
      const text = page?.revisions?.[0]?.slots?.main?.["*"];
      if (typeof text === "string") return text;
      throw new Error("ingen wikitext i svaret");
    }
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
    await new Promise((r) => setTimeout(r, 1000 * attempt));
    return fetchWikitext(title, attempt + 1);
  }
}

// Delar upp ett {{Football box}}-block i toppnivåparametrar. Scannar tecken för
// tecken och räknar djup för {{ }} och [[ ]] — en "|" på djup 0 inleder en ny
// parameter (mallar/länkar innehåller egna "|").
function parseParams(block: string): Record<string, string> {
  let inner = block.replace(/^\{\{\s*Football box/i, "");
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

function teamCode(raw: string | null): string | null {
  if (!raw) return null;
  const codes = raw.match(/\b[A-Z]{3}\b/g);
  return codes ? codes[codes.length - 1] : null;
}

function parseScore(raw: string | null): [number | null, number | null] {
  if (!raw) return [null, null];
  const m = raw.match(/(\d+)\s*[–\-:]\s*(\d+)/);
  if (!m) return [null, null];
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

function parseAttendance(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, "").match(/(\d{4,6})/);
  return m ? parseInt(m[1], 10) : null;
}

// "{{Start date|2025|9|5|df=y}}" -> "2025-09-05"
function parseDate(raw: string | null): string {
  if (!raw) return "";
  const m = raw.match(/\{\{\s*Start date\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i);
  if (!m) return "";
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// "[[Stožice Stadium]], [[Ljubljana]]" -> "Stožice Stadium, Ljubljana"
function parseVenue(raw: string | null): string {
  if (!raw) return "";
  let s = raw;
  // Klipp bort allt från första ref/refn/note-mall eller <ref> — venue står före.
  const cut = s.search(/<ref|\{\{\s*refn|\{\{\s*sfn|\{\{\s*note/i);
  if (cut !== -1) s = s.slice(0, cut);
  return s
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => (b ?? a))
    .replace(/\([^)]*\)/g, "")
    .replace(/[<>{}]+/g, "")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[,\s]+$/, "");
}

// Tolkar goals1/goals2-blocket: rader som "*[[Player|Name]] {{goal|10|pen.|64|90+3}}"
function parseGoals(raw: string | null, side: "SWE" | "OPP"): SweGoal[] {
  if (!raw) return [];
  const out: SweGoal[] = [];
  for (const line of raw.split("\n")) {
    const l = line.trim();
    if (!l.startsWith("*")) continue;

    const nameMatch = l.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    const player = nameMatch ? (nameMatch[2] ?? nameMatch[1]).trim() : "?";

    const goalTemplates = l.match(/\{\{\s*goal\s*\|[^}]*\}\}/gi) ?? [];
    for (const g of goalTemplates) {
      const inner = g.replace(/\{\{\s*goal\s*\|/i, "").replace(/\}\}$/, "");
      const tokens = inner.split("|").map((t) => t.trim());
      let lastGoalIdx = -1;
      for (const tok of tokens) {
        const minMatch = tok.match(/^(\d{1,3})(?:\s*\+\s*(\d{1,2}))?$/);
        if (minMatch) {
          const minute = parseInt(minMatch[1], 10);
          if (minute < 1 || minute > 130) continue;
          const stoppage = minMatch[2] ? parseInt(minMatch[2], 10) : 0;
          out.push({ side, player, minute, stoppage, penalty: false, ownGoal: false });
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

function parseFootballBoxes(wikitext: string, stage: "group" | "playoff"): SweMatch[] {
  const matches: SweMatch[] = [];
  let idx = wikitext.indexOf("{{Football box");
  while (idx !== -1) {
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

    // Bara matcher där Sverige är inblandat.
    if ((team1 === SWEDEN || team2 === SWEDEN) && team1 && team2) {
      const swedenHome = team1 === SWEDEN;
      const opponent = swedenHome ? team2 : team1;
      const [s1, s2] = parseScore(p.score ?? null);
      const sweScore = swedenHome ? s1 : s2;
      const oppScore = swedenHome ? s2 : s1;
      const result: "W" | "D" | "L" | null =
        sweScore == null || oppScore == null
          ? null
          : sweScore > oppScore
            ? "W"
            : sweScore === oppScore
              ? "D"
              : "L";

      // Mål: goals1 hör till team1, goals2 till team2. Märk efter Sveriges sida.
      const goals = [
        ...parseGoals(p.goals1 ?? null, swedenHome ? "SWE" : "OPP"),
        ...parseGoals(p.goals2 ?? null, swedenHome ? "OPP" : "SWE"),
      ];
      const sentOff = (block.match(/\{\{\s*sent off/gi) ?? []).length;

      matches.push({
        stage,
        date: parseDate(p.date ?? null),
        swedenHome,
        opponent,
        sweScore,
        oppScore,
        result,
        venue: parseVenue(p.stadium ?? null),
        attendance: parseAttendance(p.attendance ?? null),
        sentOff,
        goals,
      });
    }

    idx = wikitext.indexOf("{{Football box", end);
  }
  return matches;
}

async function main() {
  const all: SweMatch[] = [];
  for (const page of PAGES) {
    process.stdout.write(`Skrapar ${page.title} (${page.stage})... `);
    const wt = await fetchWikitext(page.title);
    if (!wt) {
      console.log("misslyckades");
      continue;
    }
    const found = parseFootballBoxes(wt, page.stage);
    const goalCount = found.reduce((s, m) => s + m.goals.length, 0);
    console.log(`${found.length} Sverige-matcher, ${goalCount} mål`);
    all.push(...found);
    await new Promise((r) => setTimeout(r, 1200));
  }

  // Sortera kronologiskt.
  all.sort((a, b) => a.date.localeCompare(b.date));

  const outDir = join(process.cwd(), "data");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "sweden-qualifying.json");
  const payload: SwedenQualifying = {
    scrapedAt: new Date().toISOString(),
    source: "en.wikipedia.org",
    matches: all,
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`\nSkrev ${outPath} (${all.length} matcher totalt)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
