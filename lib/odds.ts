// Marknadsodds för en match. VM 2026 har ingen gratis officiell odds-API, så vi
// härleder modellbaserade marknadsodds ur lagens FIFA-ranking. Vill man koppla in
// en riktig oddsfeed (t.ex. The Odds API) kan man byta ut `marketOdds` mot ett
// API-anrop som returnerar samma form — resten av UI:t fungerar oförändrat.

export interface MarketOdds {
  // Avmarginaliserade sannolikheter (summerar till 1).
  pHome: number;
  pDraw: number;
  pAway: number;
  // Decimalodds inkl. ett litet spelbolagspåslag (overround).
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
}

// FIFA-ranking → ELO-liknande styrketal. Rank 1 ≈ 2000, faller linjärt.
function ratingFromRank(rank: number): number {
  const r = Number.isFinite(rank) && rank > 0 ? rank : 80;
  return Math.max(1200, 2000 - (r - 1) * 9);
}

const OVERROUND = 1.06; // typiskt spelbolagspåslag ~6 %

// Beräknar 1X2-marknadsodds ur två lags FIFA-ranking.
export function marketOdds(homeRank: number, awayRank: number): MarketOdds {
  const diff = ratingFromRank(homeRank) - ratingFromRank(awayRank);

  // Förväntat resultat enligt ELO (0..1) – sannolikheten att hemmalaget "vinner duellen".
  const expHome = 1 / (1 + Math.pow(10, -diff / 400));

  // Oavgjort är vanligast i jämna matcher och avtar med styrkeskillnaden.
  const pDraw = Math.min(0.32, Math.max(0.14, 0.3 * Math.exp(-Math.abs(diff) / 600)));

  // Fördela resterande sannolikhet mellan hemma/borta efter ELO-förväntan.
  const rest = 1 - pDraw;
  const pHome = rest * expHome;
  const pAway = rest * (1 - expHome);

  const toOdds = (p: number) => Math.max(1.01, Math.round((1 / (p * OVERROUND)) * 100) / 100);

  return {
    pHome,
    pDraw,
    pAway,
    oddsHome: toOdds(pHome),
    oddsDraw: toOdds(pDraw),
    oddsAway: toOdds(pAway),
  };
}

// Hjälpare: marknadens procent (avrundat) för en utfallstyp.
export function marketPct(odds: MarketOdds): { "1": number; X: number; "2": number } {
  return {
    "1": Math.round(odds.pHome * 100),
    X: Math.round(odds.pDraw * 100),
    "2": Math.round(odds.pAway * 100),
  };
}
