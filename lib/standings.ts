// Beräknar gruppställningar och de 8 bästa treorna. Rena funktioner som körs
// både på facit (riktiga resultat) och på en spelares tippade resultat.

export interface TeamRef {
  id: string;
  groupId: string;
  fifaRank: number;
}

export interface ResultRef {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}

export interface Standing {
  teamId: string;
  groupId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  fifaRank: number;
  rank: number; // 1..4 i gruppen
}

function blank(team: TeamRef): Standing {
  return {
    teamId: team.id,
    groupId: team.groupId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    points: 0,
    fifaRank: team.fifaRank,
    rank: 0,
  };
}

// Sorteringsordning: poäng, målskillnad, gjorda mål, (lägre) FIFA-ranking.
// Head-to-head utelämnas medvetet — sällsynt och tillför mycket komplexitet.
function compare(a: Standing, b: Standing): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.gd !== a.gd) return b.gd - a.gd;
  if (b.gf !== a.gf) return b.gf - a.gf;
  return a.fifaRank - b.fifaRank;
}

export function computeGroupStandings(
  teams: TeamRef[],
  results: ResultRef[],
): Standing[] {
  const table = new Map<string, Standing>();
  for (const t of teams) table.set(t.id, blank(t));

  for (const r of results) {
    const home = table.get(r.homeTeamId);
    const away = table.get(r.awayTeamId);
    if (!home || !away) continue;
    home.played++;
    away.played++;
    home.gf += r.homeScore;
    home.ga += r.awayScore;
    away.gf += r.awayScore;
    away.ga += r.homeScore;
    if (r.homeScore > r.awayScore) {
      home.won++;
      home.points += 3;
      away.lost++;
    } else if (r.homeScore < r.awayScore) {
      away.won++;
      away.points += 3;
      home.lost++;
    } else {
      home.drawn++;
      away.drawn++;
      home.points += 1;
      away.points += 1;
    }
  }

  for (const s of table.values()) s.gd = s.gf - s.ga;
  const sorted = [...table.values()].sort(compare);
  sorted.forEach((s, i) => (s.rank = i + 1));
  return sorted;
}

// Alla 12 grupper -> { groupId: Standing[] }
export function computeAllStandings(
  teamsByGroup: Record<string, TeamRef[]>,
  results: ResultRef[],
): Record<string, Standing[]> {
  const out: Record<string, Standing[]> = {};
  for (const [groupId, teams] of Object.entries(teamsByGroup)) {
    const groupResults = results.filter(
      (r) =>
        teams.some((t) => t.id === r.homeTeamId) &&
        teams.some((t) => t.id === r.awayTeamId),
    );
    out[groupId] = computeGroupStandings(teams, groupResults);
  }
  return out;
}

// De 8 bästa treorna (FIFA-kriterier). Returnerar Standing-rader sorterade bäst först.
export function bestThirds(standings: Record<string, Standing[]>): Standing[] {
  const thirds = Object.values(standings)
    .map((g) => g.find((s) => s.rank === 3))
    .filter((s): s is Standing => !!s);
  return thirds.sort(compare).slice(0, 8);
}
