import { describe, it, expect } from "vitest";
import { scoreGroupMatch, computeScore, SCORING, type ScoringInput } from "../lib/scoring";
import { computeGroupStandings, bestThirds, type Standing } from "../lib/standings";
import { resolveR32Participants, buildValidatedTree, completeBracket } from "../lib/bracket";

describe("scoreGroupMatch", () => {
  it("ger full pott för exakt resultat", () => {
    expect(scoreGroupMatch({ predHome: 2, predAway: 1 }, { homeScore: 2, awayScore: 1 })).toEqual({
      points: SCORING.exactScore,
      exact: true,
      correct: true,
    });
  });
  it("ger målskillnadspoäng vid rätt utfall + rätt diff", () => {
    expect(scoreGroupMatch({ predHome: 2, predAway: 1 }, { homeScore: 3, awayScore: 2 }).points).toBe(
      SCORING.correctGoalDiff,
    );
  });
  it("ger utfallspoäng vid rätt vinnare men fel diff", () => {
    expect(scoreGroupMatch({ predHome: 2, predAway: 0 }, { homeScore: 1, awayScore: 0 }).points).toBe(
      SCORING.correctOutcome,
    );
  });
  it("ger 0 vid fel utfall", () => {
    expect(scoreGroupMatch({ predHome: 0, predAway: 1 }, { homeScore: 2, awayScore: 0 }).points).toBe(0);
  });
  it("rätt oavgjort ger målskillnadspoäng (diff 0 = 0)", () => {
    expect(scoreGroupMatch({ predHome: 1, predAway: 1 }, { homeScore: 2, awayScore: 2 }).points).toBe(
      SCORING.correctGoalDiff,
    );
  });
});

describe("computeGroupStandings", () => {
  const teams = [
    { id: "a", groupId: "A", fifaRank: 1 },
    { id: "b", groupId: "A", fifaRank: 2 },
    { id: "c", groupId: "A", fifaRank: 3 },
    { id: "d", groupId: "A", fifaRank: 4 },
  ];
  it("sorterar på poäng och målskillnad", () => {
    const st = computeGroupStandings(teams, [
      { homeTeamId: "a", awayTeamId: "d", homeScore: 3, awayScore: 0 },
      { homeTeamId: "b", awayTeamId: "c", homeScore: 1, awayScore: 0 },
      { homeTeamId: "a", awayTeamId: "c", homeScore: 1, awayScore: 0 },
      { homeTeamId: "b", awayTeamId: "d", homeScore: 1, awayScore: 0 },
    ]);
    expect(st[0].teamId).toBe("a"); // 6 p, +4
    expect(st[1].teamId).toBe("b"); // 6 p, +2
    expect(st[0].rank).toBe(1);
  });
  it("bryter lika på FIFA-ranking sist", () => {
    const st = computeGroupStandings(teams, []); // allt 0 -> ranking avgör
    expect(st.map((s) => s.teamId)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("bestThirds", () => {
  it("väljer de 8 bästa treorna", () => {
    const standings: Record<string, Standing[]> = {};
    for (let i = 0; i < 12; i++) {
      const g = String.fromCharCode(65 + i);
      standings[g] = [1, 2, 3, 4].map((rank) => ({
        teamId: `${g}${rank}`,
        groupId: g,
        played: 3,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        points: rank === 3 ? 12 - i : 0, // trean i grupp A bäst, L sämst
        fifaRank: 50,
        rank,
      }));
    }
    const thirds = bestThirds(standings);
    expect(thirds).toHaveLength(8);
    expect(thirds[0].groupId).toBe("A");
    // De två sämsta grupperna (K, L) ska inte vara med
    expect(thirds.map((t) => t.groupId)).not.toContain("L");
  });
});

describe("buildValidatedTree", () => {
  it("propagerar vinnare och rensar ogiltiga val", () => {
    const r32 = { 73: { homeTeamId: "x", awayTeamId: "y" } };
    // Försök sätta ett lag som inte är med i matchen -> ska ignoreras
    const { winners } = buildValidatedTree(r32 as any, { 73: "z" });
    expect(winners[73]).toBeUndefined();
    const ok = buildValidatedTree(r32 as any, { 73: "x" });
    expect(ok.winners[73]).toBe("x");
  });
});

describe("completeBracket", () => {
  const r32: Record<number, { homeTeamId: string; awayTeamId: string }> = {};
  for (let n = 73; n <= 88; n++) r32[n] = { homeTeamId: `h${n}`, awayTeamId: `a${n}` };

  it("fyller hela trädet till en mästare", () => {
    const winners = completeBracket(r32 as any, {}, (home) => home);
    expect(Object.keys(winners)).toHaveLength(32); // alla R32→final
    expect(winners[104]).toBeDefined(); // mästare satt
  });

  it("rör inte befintliga giltiga val när overwrite=false", () => {
    const winners = completeBracket(r32 as any, { 73: "a73" }, (home) => home, false);
    expect(winners[73]).toBe("a73"); // behålls
    expect(winners[74]).toBe("h74"); // tom fylls med pick
  });

  it("skriver över allt när overwrite=true", () => {
    const winners = completeBracket(r32 as any, { 73: "a73" }, (home) => home, true);
    expect(winners[73]).toBe("h73");
  });
});

describe("computeScore (helhet)", () => {
  it("summerar grupp-, avancemang-, slutspels- och mästarpoäng", () => {
    const input: ScoringInput = {
      groupResults: [{ matchNumber: 1, homeScore: 2, awayScore: 1 }],
      matchPreds: [{ matchNumber: 1, predHome: 2, predAway: 1 }], // exakt = 5
      actualTop2: { A: { rank1: "a", rank2: "b" } },
      groupPreds: [{ groupId: "A", rank1: "a", rank2: "b" }], // 3+3+2 bonus = 8
      actualReach: {
        R16: new Set(["a"]),
        QF: new Set(["a"]),
        SF: new Set<string>(),
        FINAL: new Set<string>(),
        CHAMPION: new Set(["a"]),
      },
      predReach: {
        R16: new Set(["a"]), // +2
        QF: new Set(["a"]), // +4
        SF: new Set<string>(),
        FINAL: new Set<string>(),
        CHAMPION: new Set(["a"]), // +15
      },
    };
    const b = computeScore(input);
    expect(b.groupMatches).toBe(5);
    expect(b.advancement).toBe(8);
    expect(b.knockout).toBe(6);
    expect(b.champion).toBe(15);
    expect(b.total).toBe(34);
  });
});

describe("resolveR32Participants", () => {
  it("tilldelar alla 8 tredjeplats-slottar utan krock", () => {
    // Minimal standings: rank 1/2/3 per grupp
    const standings: Record<string, Standing[]> = {};
    for (let i = 0; i < 12; i++) {
      const g = String.fromCharCode(65 + i);
      standings[g] = [1, 2, 3, 4].map((rank) => ({
        teamId: `${g}${rank}`,
        groupId: g,
        played: 3,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        points: rank === 3 ? 20 - i : 30 - rank,
        fifaRank: 50,
        rank,
      }));
    }
    const thirds = bestThirds(standings);
    const r32 = resolveR32Participants(standings, thirds);
    // 16 R32-matcher ska ha två lag var
    const filled = Object.values(r32).filter((p) => p.homeTeamId && p.awayTeamId);
    expect(filled).toHaveLength(16);
  });
});
