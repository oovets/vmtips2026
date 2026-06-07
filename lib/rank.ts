// Delad rankningslogik för ligaplaceringar. Samma semantik används både i
// översiktens live-uträkning och i poängomräkningen som persisterar placeringar,
// så att siffran i nav och på dashboarden alltid stämmer överens.
//
// Regler: sortera på total (fallande), bryt lika på displayName (stigande,
// lokal sv-jämförelse). Lika totalpoäng delar samma placeringsnummer (1,1,3…).

export interface Rankable {
  total: number;
  displayName: string;
}

export interface Ranked<T extends Rankable> {
  row: T;
  rank: number;
}

export function rankRows<T extends Rankable>(rows: T[]): Ranked<T>[] {
  const sorted = [...rows].sort(
    (a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName),
  );
  let rank = 0;
  let prev: number | null = null;
  return sorted.map((row, i) => {
    if (prev === null || row.total !== prev) rank = i + 1;
    prev = row.total;
    return { row, rank };
  });
}
