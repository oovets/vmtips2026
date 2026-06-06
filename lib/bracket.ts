// Resolverar slutspelsträdet: från gruppställningar -> R32-deltagare, och från
// vinnarval -> hela trädet upp till final. Används både för facit och för en
// spelares tippade träd.

import { BRACKET, BracketSlot } from "./bracket-template";
import type { Standing } from "./standings";

export type Participants = Record<
  number,
  { homeTeamId: string | null; awayTeamId: string | null }
>;
// matchNumber -> teamId som spelaren/facit valt som vinnare
export type Winners = Record<number, string | undefined>;

function parseGroupSlot(slot: string): { rank: number; group: string } | null {
  const m = slot.match(/^([12])([A-L])$/);
  if (!m) return null;
  return { rank: parseInt(m[1], 10), group: m[2] };
}

function isThirdSlot(slot: string): boolean {
  return slot.startsWith("3") && slot.includes("/");
}

function thirdAllowedGroups(slot: string): string[] {
  // "3A/B/C/D/F" -> ["A","B","C","D","F"]
  return slot.slice(1).split("/");
}

// Tilldela de 8 kvalificerade treornas grupper till tredjeplats-slottarna i R32
// (bipartit matchning via backtracking). Approximation av FIFA:s officiella tabell —
// exakt vem-möter-vem för facit hämtas ändå från API:t.
function assignThirds(
  thirdGroups: string[],
  slots: { matchNumber: number; allowed: string[] }[],
): Record<number, string> | null {
  const result: Record<number, string> = {};
  const used = new Set<string>();

  // Mest begränsade slot först ökar chansen att hitta en giltig matchning.
  const order = [...slots].sort((a, b) => a.allowed.length - b.allowed.length);

  function backtrack(i: number): boolean {
    if (i === order.length) return true;
    const slot = order[i];
    for (const g of slot.allowed) {
      if (thirdGroups.includes(g) && !used.has(g)) {
        used.add(g);
        result[slot.matchNumber] = g;
        if (backtrack(i + 1)) return true;
        used.delete(g);
        delete result[slot.matchNumber];
      }
    }
    return false;
  }

  return backtrack(0) ? result : null;
}

// standings: { groupId: Standing[] (sorterad rank 1..4) }, thirds: de 8 bästa treorna
export function resolveR32Participants(
  standings: Record<string, Standing[]>,
  thirds: Standing[],
): Participants {
  const participants: Participants = {};
  const r32 = BRACKET.filter((b) => b.stage === "R32");

  const thirdGroups = thirds.map((t) => t.groupId);
  const thirdSlots = r32
    .filter((b) => isThirdSlot(b.away) || isThirdSlot(b.home))
    .map((b) => ({
      matchNumber: b.matchNumber,
      allowed: thirdAllowedGroups(isThirdSlot(b.away) ? b.away : b.home),
    }));
  const assignment = assignThirds(thirdGroups, thirdSlots) ?? {};

  const sideTeam = (slot: string, matchNumber: number): string | null => {
    const gs = parseGroupSlot(slot);
    if (gs) return standings[gs.group]?.[gs.rank - 1]?.teamId ?? null;
    if (isThirdSlot(slot)) {
      const g = assignment[matchNumber];
      return g ? standings[g]?.[2]?.teamId ?? null : null;
    }
    return null;
  };

  for (const b of r32) {
    participants[b.matchNumber] = {
      homeTeamId: sideTeam(b.home, b.matchNumber),
      awayTeamId: sideTeam(b.away, b.matchNumber),
    };
  }
  return participants;
}

// Bygger hela trädet (73–104) givet R32-deltagare och vinnarval.
// Returnerar deltagare per match; saknade led blir null tills tidigare matcher avgjorts.
export function buildKnockoutTree(
  r32Participants: Participants,
  winners: Winners,
): Participants {
  const resolved: Participants = { ...r32Participants };

  const refWinner = (slot: string): string | null => {
    const ref = parseInt(slot.slice(1), 10);
    return winners[ref] ?? null;
  };
  const refLoser = (slot: string): string | null => {
    const ref = parseInt(slot.slice(1), 10);
    const w = winners[ref];
    const m = resolved[ref];
    if (!w || !m) return null;
    if (m.homeTeamId === w) return m.awayTeamId;
    if (m.awayTeamId === w) return m.homeTeamId;
    return null;
  };

  const side = (slot: string): string | null => {
    if (slot.startsWith("W")) return refWinner(slot);
    if (slot.startsWith("L")) return refLoser(slot);
    return null;
  };

  for (const b of BRACKET) {
    if (b.stage === "R32") continue; // redan satta
    resolved[b.matchNumber] = {
      homeTeamId: side(b.home),
      awayTeamId: side(b.away),
    };
  }
  return resolved;
}

// Vilka lag som nått varje runda enligt ett (tippat eller verkligt) träd.
export function teamsReachingStages(
  resolved: Participants,
  winners: Winners,
): Record<"R16" | "QF" | "SF" | "FINAL" | "CHAMPION", Set<string>> {
  const winnersOf = (nums: number[]) =>
    new Set(nums.map((n) => winners[n]).filter((x): x is string => !!x));

  const r32 = BRACKET.filter((b) => b.stage === "R32").map((b) => b.matchNumber);
  const r16 = BRACKET.filter((b) => b.stage === "R16").map((b) => b.matchNumber);
  const qf = BRACKET.filter((b) => b.stage === "QF").map((b) => b.matchNumber);
  const sf = BRACKET.filter((b) => b.stage === "SF").map((b) => b.matchNumber);

  return {
    R16: winnersOf(r32), // vinnare av R32 = nått åttondel
    QF: winnersOf(r16),
    SF: winnersOf(qf),
    FINAL: winnersOf(sf),
    CHAMPION: new Set([winners[104]].filter((x): x is string => !!x)),
  };
}

export function bracketSlots(): BracketSlot[] {
  return BRACKET;
}

// Som buildKnockoutTree men validerar vinnarval: en vinnare behålls bara om laget
// faktiskt är en av matchens två deltagare. Används av tippformuläret så att val
// som blir ogiltiga (när man ändrar tidigare resultat) automatiskt rensas och
// inte propagerar uppåt i trädet.
export function buildValidatedTree(
  r32: Participants,
  rawWinners: Winners,
): { resolved: Participants; winners: Winners } {
  const resolved: Participants = {};
  const winners: Winners = {};

  const side = (slot: string): string | null => {
    if (slot.startsWith("W")) {
      const ref = parseInt(slot.slice(1), 10);
      return winners[ref] ?? null;
    }
    if (slot.startsWith("L")) {
      const ref = parseInt(slot.slice(1), 10);
      const w = winners[ref];
      const m = resolved[ref];
      if (!w || !m) return null;
      if (m.homeTeamId === w) return m.awayTeamId;
      if (m.awayTeamId === w) return m.homeTeamId;
      return null;
    }
    return null;
  };

  for (const b of BRACKET) {
    const part =
      b.stage === "R32"
        ? r32[b.matchNumber] ?? { homeTeamId: null, awayTeamId: null }
        : { homeTeamId: side(b.home), awayTeamId: side(b.away) };
    resolved[b.matchNumber] = part;
    const w = rawWinners[b.matchNumber];
    if (w && (w === part.homeTeamId || w === part.awayTeamId)) {
      winners[b.matchNumber] = w;
    }
  }
  return { resolved, winners };
}
