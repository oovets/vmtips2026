/*
 * Skrapar Sveriges aktuella landslagstrupp (26 spelare uttagna till VM 2026) från
 * Wikipedias wikitext-API och skriver data/sweden-squad.json.
 *
 *   npx tsx scripts/scrape-sweden-squad.ts
 *   (eller: pnpm scrape:squad)
 *
 * Ingen runtime-skrapning: Sverige-fliken läser bara den färdiga JSON-filen.
 * Källa: "Sweden men's national football team" — avsnittet "Current squad" som
 * använder {{nat fs g player|...}}-mallar (no=, pos=, name=, age=, caps=, goals=,
 * club=, clubnat=). Trupp- och datumetiketten ("as of ...") parsas också.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const API = "https://en.wikipedia.org/w/api.php";

// Sidan med "Current squad"-avsnittet. {{nat fs g player}}-mallarna ligger här,
// med caps/mål korrekta per ett angivet datum (parsas till asOf nedan).
const PAGE_TITLE = "Sweden men's national football team";
const PAGE_URL = "https://en.wikipedia.org/wiki/Sweden_men%27s_national_football_team";

export interface SquadPlayer {
  number: number | null; // tröjnummer (no=)
  position: "GK" | "DF" | "MF" | "FW"; // pos=
  name: string; // rensat spelarnamn
  birthDate: string; // ISO "1998-07-11"
  caps: number;
  goals: number;
  club: string; // rensat klubbnamn
  clubNat: string; // landskod för klubben, t.ex. "ENG"
  captain: boolean; // kapten?
  viceCaptain: boolean;
}

export interface SwedenSquad {
  scrapedAt: string;
  source: string; // sidtitel + URL
  asOf: string; // trupp-/datumetikett, t.ex. "Caps and goals are correct as of 4 June 2026"
  players: SquadPlayer[];
}

async function fetchWikitext(title: string, attempt = 1): Promise<string | null> {
  const url = `${API}?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&titles=${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "vmtips2026-squad-scraper/1.0 (contact: vmtips)" } });
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

// Delar upp ett {{nat fs g player}}-block i toppnivåparametrar. Scannar tecken
// för tecken och räknar djup för {{ }} och [[ ]] — en "|" på djup 0 inleder en
// ny parameter (age={{Birth date and age|...}} innehåller egna "|").
function parseParams(inner: string): Record<string, string> {
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

// "[[Gustaf Lagerbielke (footballer)|Gustaf Lagerbielke]]" -> "Gustaf Lagerbielke"
// "[[Alexander Isak]]" -> "Alexander Isak". Tar bort kvarvarande wiki-brus.
function cleanWikiLink(raw: string | undefined): string {
  if (!raw) return "";
  let s = raw;
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => (b ?? a));
  s = s.replace(/\{\{[^{}]*\}\}/g, "");
  s = s.replace(/''+/g, "");
  s = s.replace(/<[^>]*>/g, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

// "{{Birth date and age|1998|7|11|df=y}}" -> "1998-07-11"
function parseBirthDate(raw: string | undefined): string {
  if (!raw) return "";
  const m = raw.match(/\{\{\s*Birth date(?: and age)?\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i);
  if (!m) return "";
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parsePosition(raw: string | undefined): "GK" | "DF" | "MF" | "FW" | null {
  if (!raw) return null;
  const up = raw.toUpperCase();
  if (up.includes("GK")) return "GK";
  if (up.includes("DF")) return "DF";
  if (up.includes("MF")) return "MF";
  if (up.includes("FW")) return "FW";
  return null;
}

function parseInt0(raw: string | undefined): number {
  if (!raw) return 0;
  const m = raw.replace(/,/g, "").match(/-?\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

// Plockar ut "Caps and goals are correct as of ..."-meningen som föregår truppen,
// annars en generell etikett kring "called up for the 2026 FIFA World Cup".
function parseAsOf(wikitext: string, squadStart: number): string {
  const before = wikitext.slice(Math.max(0, squadStart - 800), squadStart);
  const asOf = before.match(/Caps and goals are correct as of ([^.<\n]+)/i);
  if (asOf) {
    // Klipp vid ", after the match..." och rensa ev. wiki-länkar, så vi får ren datumtext.
    const dateOnly = cleanWikiLink(asOf[1].split(/,\s*after/i)[0].trim());
    return `Landskamper och mål korrekta per ${dateOnly}`;
  }
  const calledUp = before.match(/called up for the \[\[([^\]|]+)(?:\|[^\]]+)?\]\]/i);
  if (calledUp) return `Uttagna till ${calledUp[1].trim()}`;
  return "Aktuell landslagstrupp";
}

// Skannar wikitexten efter {{nat fs g player|...}}-block (balanserade {{ }}) och
// returnerar parametrarna för varje.
function parseSquad(wikitext: string): { players: SquadPlayer[]; asOf: string } {
  const startMarker = "{{nat fs g start}}";
  const squadStart = wikitext.indexOf(startMarker);
  if (squadStart === -1) return { players: [], asOf: "Aktuell landslagstrupp" };

  // Avgränsa till truppblocket: från start fram till {{nat fs end}} (eller +6000 tecken).
  const endMarker = wikitext.indexOf("{{nat fs end}}", squadStart);
  const region = wikitext.slice(squadStart, endMarker === -1 ? squadStart + 8000 : endMarker);

  const players: SquadPlayer[] = [];
  const TEMPLATE = "{{nat fs g player";
  let idx = region.indexOf(TEMPLATE);
  while (idx !== -1) {
    // Hitta matchande slut-}} med djupräkning.
    let depth = 0;
    let end = idx;
    for (let i = idx; i < region.length - 1; i++) {
      if (region[i] === "{" && region[i + 1] === "{") { depth++; i++; }
      else if (region[i] === "}" && region[i + 1] === "}") { depth--; i++; if (depth === 0) { end = i + 1; break; } }
    }
    let inner = region.slice(idx, end);
    inner = inner.replace(/^\{\{\s*nat fs g player\s*\|?/i, "").replace(/\}\}$/, "");
    const p = parseParams(inner);

    const position = parsePosition(p.pos);
    const name = cleanWikiLink(p.name);
    if (position && name) {
      const other = (p.other ?? "").toLowerCase();
      players.push({
        number: p.no ? parseInt0(p.no) : null,
        position,
        name,
        birthDate: parseBirthDate(p.age),
        caps: parseInt0(p.caps),
        goals: parseInt0(p.goals),
        club: cleanWikiLink(p.club),
        clubNat: (p.clubnat ?? "").trim().toUpperCase(),
        captain: /(^|[^-])captain/.test(other) && !other.includes("vice"),
        viceCaptain: other.includes("vice"),
      });
    }

    idx = region.indexOf(TEMPLATE, end);
  }

  return { players, asOf: parseAsOf(wikitext, squadStart) };
}

async function main() {
  process.stdout.write(`Skrapar ${PAGE_TITLE} (Current squad)... `);
  const wt = await fetchWikitext(PAGE_TITLE);
  if (!wt) {
    console.log("misslyckades");
    process.exit(1);
  }

  const { players, asOf } = parseSquad(wt);
  console.log(`${players.length} spelare`);

  if (players.length < 20) {
    console.error(`\n⚠ Hittade bara ${players.length} spelare — förväntade ~23-26. Avbryter utan att skriva.`);
    process.exit(1);
  }

  const outDir = join(process.cwd(), "data");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "sweden-squad.json");
  const payload: SwedenSquad = {
    scrapedAt: new Date().toISOString(),
    source: `${PAGE_TITLE} — ${PAGE_URL}`,
    asOf,
    players,
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Skrev ${outPath} (${players.length} spelare, ${asOf})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
