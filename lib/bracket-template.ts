// Statisk mall för slutspelet (match 73–104) med slot-referenser, härledd ur
// data/worldcup2026.json. Slot-format:
//   "1A"/"2B"  = grupp A etta / grupp B tvåa
//   "3A/B/C/D/F" = bästa kvalificerade trea bland de listade grupperna
//   "W74"      = vinnaren av match 74
//   "L101"     = förloraren av match 101 (bronsmatch)

export type KnockoutStage = "R32" | "R16" | "QF" | "SF" | "THIRD" | "FINAL";

export interface BracketSlot {
  matchNumber: number;
  stage: KnockoutStage;
  round: string;
  home: string;
  away: string;
  venue: string;
}

export const BRACKET: BracketSlot[] = [
  { matchNumber: 73, stage: "R32", round: "Round of 32", home: "2A", away: "2B", venue: "Los Angeles (Inglewood)" },
  { matchNumber: 74, stage: "R32", round: "Round of 32", home: "1E", away: "3A/B/C/D/F", venue: "Boston (Foxborough)" },
  { matchNumber: 75, stage: "R32", round: "Round of 32", home: "1F", away: "2C", venue: "Monterrey (Guadalupe)" },
  { matchNumber: 76, stage: "R32", round: "Round of 32", home: "1C", away: "2F", venue: "Houston" },
  { matchNumber: 77, stage: "R32", round: "Round of 32", home: "1I", away: "3C/D/F/G/H", venue: "New York/New Jersey (East Rutherford)" },
  { matchNumber: 78, stage: "R32", round: "Round of 32", home: "2E", away: "2I", venue: "Dallas (Arlington)" },
  { matchNumber: 79, stage: "R32", round: "Round of 32", home: "1A", away: "3C/E/F/H/I", venue: "Mexico City" },
  { matchNumber: 80, stage: "R32", round: "Round of 32", home: "1L", away: "3E/H/I/J/K", venue: "Atlanta" },
  { matchNumber: 81, stage: "R32", round: "Round of 32", home: "1D", away: "3B/E/F/I/J", venue: "San Francisco Bay Area (Santa Clara)" },
  { matchNumber: 82, stage: "R32", round: "Round of 32", home: "1G", away: "3A/E/H/I/J", venue: "Seattle" },
  { matchNumber: 83, stage: "R32", round: "Round of 32", home: "2K", away: "2L", venue: "Toronto" },
  { matchNumber: 84, stage: "R32", round: "Round of 32", home: "1H", away: "2J", venue: "Los Angeles (Inglewood)" },
  { matchNumber: 85, stage: "R32", round: "Round of 32", home: "1B", away: "3E/F/G/I/J", venue: "Vancouver" },
  { matchNumber: 86, stage: "R32", round: "Round of 32", home: "1J", away: "2H", venue: "Miami (Miami Gardens)" },
  { matchNumber: 87, stage: "R32", round: "Round of 32", home: "1K", away: "3D/E/I/J/L", venue: "Kansas City" },
  { matchNumber: 88, stage: "R32", round: "Round of 32", home: "2D", away: "2G", venue: "Dallas (Arlington)" },
  { matchNumber: 89, stage: "R16", round: "Round of 16", home: "W74", away: "W77", venue: "Philadelphia" },
  { matchNumber: 90, stage: "R16", round: "Round of 16", home: "W73", away: "W75", venue: "Houston" },
  { matchNumber: 91, stage: "R16", round: "Round of 16", home: "W76", away: "W78", venue: "New York/New Jersey (East Rutherford)" },
  { matchNumber: 92, stage: "R16", round: "Round of 16", home: "W79", away: "W80", venue: "Mexico City" },
  { matchNumber: 93, stage: "R16", round: "Round of 16", home: "W83", away: "W84", venue: "Dallas (Arlington)" },
  { matchNumber: 94, stage: "R16", round: "Round of 16", home: "W81", away: "W82", venue: "Seattle" },
  { matchNumber: 95, stage: "R16", round: "Round of 16", home: "W86", away: "W88", venue: "Atlanta" },
  { matchNumber: 96, stage: "R16", round: "Round of 16", home: "W85", away: "W87", venue: "Vancouver" },
  { matchNumber: 97, stage: "QF", round: "Quarter-final", home: "W89", away: "W90", venue: "Boston (Foxborough)" },
  { matchNumber: 98, stage: "QF", round: "Quarter-final", home: "W93", away: "W94", venue: "Los Angeles (Inglewood)" },
  { matchNumber: 99, stage: "QF", round: "Quarter-final", home: "W91", away: "W92", venue: "Miami (Miami Gardens)" },
  { matchNumber: 100, stage: "QF", round: "Quarter-final", home: "W95", away: "W96", venue: "Kansas City" },
  { matchNumber: 101, stage: "SF", round: "Semi-final", home: "W97", away: "W98", venue: "Dallas (Arlington)" },
  { matchNumber: 102, stage: "SF", round: "Semi-final", home: "W99", away: "W100", venue: "Atlanta" },
  { matchNumber: 103, stage: "THIRD", round: "Match for third place", home: "L101", away: "L102", venue: "Miami (Miami Gardens)" },
  { matchNumber: 104, stage: "FINAL", round: "Final", home: "W101", away: "W102", venue: "New York/New Jersey (East Rutherford)" },
];

export const BRACKET_BY_NUMBER: Record<number, BracketSlot> = Object.fromEntries(
  BRACKET.map((b) => [b.matchNumber, b]),
);

// Vilka rundor ger poäng för "lag som nått hit" (bronsmatchen exkluderas).
export const KO_ROUNDS: { stage: KnockoutStage; reachLabel: string }[] = [
  { stage: "R16", reachLabel: "Åttondel" },
  { stage: "QF", reachLabel: "Kvartsfinal" },
  { stage: "SF", reachLabel: "Semifinal" },
  { stage: "FINAL", reachLabel: "Final" },
];
