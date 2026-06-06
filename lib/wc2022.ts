// FIFA World Cup 2022 (Qatar) final placements, keyed by TLA code.
// Used to show "Föregående VM-placering" in group tables.

const placements: Record<string, { place: number; label: string }> = {
  ARG: { place: 1,  label: "1:a VM 2022" },
  FRA: { place: 2,  label: "2:a VM 2022" },
  CRO: { place: 3,  label: "3:a VM 2022" },
  MAR: { place: 4,  label: "4:a VM 2022" },
  NED: { place: 5,  label: "QF VM 2022" },
  BRA: { place: 5,  label: "QF VM 2022" },
  ENG: { place: 5,  label: "QF VM 2022" },
  POR: { place: 5,  label: "QF VM 2022" },
  USA: { place: 9,  label: "R16 VM 2022" },
  AUS: { place: 9,  label: "R16 VM 2022" },
  POL: { place: 9,  label: "R16 VM 2022" },
  SEN: { place: 9,  label: "R16 VM 2022" },
  JPN: { place: 9,  label: "R16 VM 2022" },
  ESP: { place: 9,  label: "R16 VM 2022" },
  SUI: { place: 9,  label: "R16 VM 2022" },
  KOR: { place: 9,  label: "R16 VM 2022" },
  ECU: { place: 17, label: "GS VM 2022" },
  QAT: { place: 17, label: "GS VM 2022" },
  MEX: { place: 17, label: "GS VM 2022" },
  KSA: { place: 17, label: "GS VM 2022" },
  SAU: { place: 17, label: "GS VM 2022" },
  WAL: { place: 17, label: "GS VM 2022" },
  IRN: { place: 17, label: "GS VM 2022" },
  TUN: { place: 17, label: "GS VM 2022" },
  DEN: { place: 17, label: "GS VM 2022" },
  GER: { place: 17, label: "GS VM 2022" },
  CRC: { place: 17, label: "GS VM 2022" },
  CMR: { place: 17, label: "GS VM 2022" },
  SRB: { place: 17, label: "GS VM 2022" },
  BEL: { place: 17, label: "GS VM 2022" },
  CAN: { place: 17, label: "GS VM 2022" },
  GHA: { place: 17, label: "GS VM 2022" },
  URU: { place: 17, label: "GS VM 2022" },
};

export function getWc2022(tla: string): { place: number; label: string } | null {
  return placements[tla.toUpperCase()] ?? null;
}

export function wc2022Badge(tla: string): { text: string; title: string } | null {
  const p = getWc2022(tla);
  if (!p) return null;
  if (p.place === 1) return { text: "W", title: "Winner — World Cup 2022" };
  if (p.place === 2) return { text: "RU", title: "Runner-up — World Cup 2022" };
  if (p.place === 3) return { text: "3rd", title: "Third place — World Cup 2022" };
  if (p.place === 4) return { text: "4th", title: "Fourth place — World Cup 2022" };
  if (p.place <= 8) return { text: "QF", title: "Quarter-final — World Cup 2022" };
  if (p.place <= 16) return { text: "R16", title: "Round of 16 — World Cup 2022" };
  return { text: "GS", title: "Group stage — World Cup 2022" };
}

// Förkortningar som används i "22"-kolumnen (för legend i headern).
export const WC2022_LEGEND: { code: string; label: string }[] = [
  { code: "W", label: "Vinnare" },
  { code: "RU", label: "Final" },
  { code: "3rd", label: "Trea" },
  { code: "4th", label: "Fyra" },
  { code: "QF", label: "Kvartsfinal" },
  { code: "R16", label: "Åttondel" },
  { code: "GS", label: "Gruppspel" },
];
