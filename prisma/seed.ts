// Seedar databasen från data/worldcup2026.json (openfootball, public domain)
// + lag-metadata i lib/teams.ts. Idempotent: kör om när som helst.

import { PrismaClient, Stage } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TEAMS } from "../lib/teams";

const prisma = new PrismaClient();

interface RawMatch {
  round: string;
  date: string;
  time: string;
  team1: string;
  team2: string;
  group?: string;
  ground: string;
}

function roundToStage(round: string): Stage {
  if (round.startsWith("Matchday")) return Stage.GROUP;
  if (round === "Round of 32") return Stage.R32;
  if (round === "Round of 16") return Stage.R16;
  if (round === "Quarter-final") return Stage.QF;
  if (round === "Semi-final") return Stage.SF;
  if (round === "Match for third place") return Stage.THIRD;
  if (round === "Final") return Stage.FINAL;
  throw new Error(`Okänd round: ${round}`);
}

// "13:00 UTC-6" + "2026-06-11" -> Date (UTC-korrekt)
function parseKickoff(date: string, time: string): Date {
  const m = time.match(/(\d{1,2}):(\d{2})\s*UTC([+-]\d+)/);
  if (!m) return new Date(`${date}T12:00:00Z`);
  const [, hh, mm, off] = m;
  const sign = off.startsWith("-") ? "-" : "+";
  const offHours = Math.abs(parseInt(off, 10)).toString().padStart(2, "0");
  return new Date(`${date}T${hh.padStart(2, "0")}:${mm}:00${sign}${offHours}:00`);
}

// Ett lag ("Mexico") eller en platshållare ("2A", "W74") -> {teamName?|slot}
function classifySide(s: string): { teamName?: string; slot?: string } {
  return s in TEAMS ? { teamName: s } : { slot: s };
}

async function main() {
  const dataPath = join(process.cwd(), "data", "worldcup2026.json");
  const raw = JSON.parse(readFileSync(dataPath, "utf-8")) as { matches: RawMatch[] };

  // 1. Grupper A–L
  const letters = "ABCDEFGHIJKL".split("");
  for (const letter of letters) {
    await prisma.group.upsert({
      where: { id: letter },
      update: { letter },
      create: { id: letter, letter },
    });
  }

  // 2. Lag
  for (const [name, meta] of Object.entries(TEAMS)) {
    await prisma.team.upsert({
      where: { name },
      update: { code: meta.code, flag: meta.flag, fifaRank: meta.fifaRank, groupId: meta.group },
      create: {
        name,
        code: meta.code,
        flag: meta.flag,
        fifaRank: meta.fifaRank,
        groupId: meta.group,
      },
    });
  }

  const teamByName = new Map(
    (await prisma.team.findMany()).map((t) => [t.name, t.id]),
  );

  // 3. Matcher (matchNumber = index + 1, i filens ordning 1..104)
  let n = 0;
  for (const rm of raw.matches) {
    n += 1;
    const stage = roundToStage(rm.round);
    const home = classifySide(rm.team1);
    const away = classifySide(rm.team2);
    const groupId = rm.group?.replace("Group ", "") ?? null;

    const data = {
      matchNumber: n,
      stage,
      round: rm.round,
      groupId,
      kickoff: parseKickoff(rm.date, rm.time),
      venue: rm.ground,
      homeTeamId: home.teamName ? teamByName.get(home.teamName)! : null,
      awayTeamId: away.teamName ? teamByName.get(away.teamName)! : null,
      homeSlot: home.slot ?? null,
      awaySlot: away.slot ?? null,
    };

    await prisma.match.upsert({
      where: { matchNumber: n },
      update: data,
      create: data,
    });
  }

  const counts = {
    groups: await prisma.group.count(),
    teams: await prisma.team.count(),
    matches: await prisma.match.count(),
  };
  console.log("✅ Seed klar:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
