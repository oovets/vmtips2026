import { describe, it, expect } from "vitest";
import {
  buildQuestionPool,
  selectQuiz,
  scoreAnswer,
  gradeQuiz,
  stripAnswers,
  QUIZ,
  type QuizData,
} from "../lib/quiz";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const data: QuizData = {
  teams: [
    { id: "a", name: "Sweden", code: "SWE", flag: "🇸🇪", groupId: "F" },
    { id: "b", name: "Japan", code: "JPN", flag: "🇯🇵", groupId: "F" },
    { id: "c", name: "Netherlands", code: "NED", flag: "🇳🇱", groupId: "F" },
    { id: "d", name: "Tunisia", code: "TUN", flag: "🇹🇳", groupId: "F" },
  ],
  matches: [
    { matchNumber: 1, groupId: "F", homeTeamId: "a", awayTeamId: "b", homeScore: 3, awayScore: 1 },
    { matchNumber: 2, groupId: "F", homeTeamId: "c", awayTeamId: "d", homeScore: 0, awayScore: 0 },
  ],
  standings: {
    F: [
      { teamId: "a", rank: 1, gf: 3 },
      { teamId: "c", rank: 2, gf: 0 },
      { teamId: "b", rank: 3, gf: 1 },
      { teamId: "d", rank: 4, gf: 0 },
    ],
  },
  goals: [],
};

describe("buildQuestionPool", () => {
  const pool = buildQuestionPool(data);

  it("varje fråga är giltig (correctIndex i range, ≥3 alternativ)", () => {
    expect(pool.length).toBeGreaterThan(0);
    for (const q of pool) {
      expect(q.options.length).toBeGreaterThanOrEqual(3);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThan(q.options.length);
      expect(new Set(q.options).size).toBe(q.options.length); // unika alternativ
    }
  });

  it("rätt facit för resultat/vinnare/mål", () => {
    const result = pool.find((q) => q.id === "result:1")!;
    expect(result.options[result.correctIndex]).toBe("3–1");
    const winner = pool.find((q) => q.id === "winner:1")!;
    expect(winner.options[winner.correctIndex]).toBe("Sweden");
    const goals = pool.find((q) => q.id === "goals:1")!;
    expect(goals.options[goals.correctIndex]).toBe("4");
  });

  it("gruppvinnare härleds ur tabellen", () => {
    const gw = pool.find((q) => q.id === "groupWinner:F")!;
    expect(gw.options[gw.correctIndex]).toBe("🇸🇪 Sweden");
  });
});

describe("selectQuiz", () => {
  const pool = buildQuestionPool(data);

  it("är deterministisk för samma seed", () => {
    const s1 = selectQuiz(pool, 4, mulberry32(42));
    const s2 = selectQuiz(pool, 4, mulberry32(42));
    expect(s1.map((q) => q.id)).toEqual(s2.map((q) => q.id));
    expect(s1.map((q) => q.options)).toEqual(s2.map((q) => q.options));
  });

  it("behåller rätt svar efter att alternativen blandats", () => {
    const selected = selectQuiz(pool, pool.length, mulberry32(7));
    for (const q of selected) {
      const orig = pool.find((p) => p.id === q.id)!;
      expect(q.options[q.correctIndex]).toBe(orig.options[orig.correctIndex]);
    }
  });
});

describe("scoreAnswer", () => {
  it("snabbt rätt = bas + full bonus", () => {
    expect(scoreAnswer(true, 0)).toBe(QUIZ.basePoints + QUIZ.maxSpeedBonus);
  });
  it("rätt på sista millisekunden = bara bas", () => {
    expect(scoreAnswer(true, QUIZ.perQuestionMs)).toBe(QUIZ.basePoints);
  });
  it("fel = 0", () => {
    expect(scoreAnswer(false, 10)).toBe(0);
  });
});

describe("gradeQuiz", () => {
  it("summerar rätt antal och poäng, klampar tid", () => {
    const questions = [
      { id: "q1", type: "x", prompt: "", options: ["a", "b"], correctIndex: 0 },
      { id: "q2", type: "x", prompt: "", options: ["a", "b"], correctIndex: 1 },
      { id: "q3", type: "x", prompt: "", options: ["a", "b"], correctIndex: 0 },
    ];
    const res = gradeQuiz(questions, [
      { questionId: "q1", choiceIndex: 0, ms: 0 }, // rätt, full bonus = 200
      { questionId: "q2", choiceIndex: 0, ms: 5000 }, // fel = 0
      // q3 obesvarad → 0, full tid
    ]);
    expect(res.correctCount).toBe(1);
    expect(res.score).toBe(QUIZ.basePoints + QUIZ.maxSpeedBonus);
    expect(res.totalMs).toBe(0 + 5000 + QUIZ.perQuestionMs);
  });
});

describe("stripAnswers", () => {
  it("tar bort facit", () => {
    const pub = stripAnswers(buildQuestionPool(data));
    for (const q of pub) expect("correctIndex" in q).toBe(false);
  });
});
