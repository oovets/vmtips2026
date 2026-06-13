// Quiz-motor: genererar frågor ur spelad matchdata, väljer ut en rond, rättar och
// poängsätter. Rena funktioner (testbara). Determinism mellan spelare uppnås genom att
// en quiz-instans (frågesettet) sparas en gång och delas — inte genom omgenerering.

export interface Question {
  id: string;
  type: string;
  prompt: string;
  options: string[];
  correctIndex: number;
}

export interface QTeam {
  id: string;
  name: string;
  code: string;
  flag: string;
  groupId: string;
}
export interface QMatch {
  matchNumber: number;
  groupId: string | null;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}
export interface QGoal {
  matchNumber: number;
  teamId: string;
  scorer: string;
  ownGoal: boolean;
}
export interface QStanding {
  teamId: string;
  rank: number;
  gf: number;
}
export interface QuizData {
  teams: QTeam[];
  matches: QMatch[]; // färdiga gruppmatcher med båda lag + resultat
  standings: Record<string, QStanding[]>; // endast färdigspelade grupper
  goals: QGoal[];
}

export const QUIZ = {
  questionsPerRound: 8,
  perQuestionMs: 20_000,
  minPoolSize: 4,
  basePoints: 100,
  maxSpeedBonus: 100,
};

type Rng = () => number;

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function scorelineDistractors(h: number, a: number): string[] {
  const correct = `${h}–${a}`;
  const cands = new Set<string>();
  const push = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && `${x}–${y}` !== correct) cands.add(`${x}–${y}`);
  };
  push(a, h);
  push(h + 1, a);
  push(h, a + 1);
  push(h + 1, a + 1);
  push(h - 1, a);
  push(h, a - 1);
  push(2, 1);
  push(1, 0);
  push(0, 0);
  push(2, 2);
  return [...cands].slice(0, 3);
}

function numberOptions(total: number): string[] {
  const set: number[] = [total];
  for (const d of [1, -1, 2, -2, 3, 4]) {
    const v = total + d;
    if (v >= 0 && !set.includes(v)) set.push(v);
    if (set.length >= 4) break;
  }
  return set.slice(0, 4).map(String);
}

export function buildQuestionPool(data: QuizData): Question[] {
  const tById = new Map(data.teams.map((t) => [t.id, t]));
  const label = (id: string) => {
    const t = tById.get(id);
    return t ? `${t.flag} ${t.name}` : "?";
  };
  const out: Question[] = [];

  for (const m of data.matches) {
    const home = tById.get(m.homeTeamId);
    const away = tById.get(m.awayTeamId);
    if (!home || !away) continue;

    const distract = scorelineDistractors(m.homeScore, m.awayScore);
    if (distract.length >= 3) {
      out.push({
        id: `result:${m.matchNumber}`,
        type: "result",
        prompt: `Vad slutade ${label(m.homeTeamId)} – ${label(m.awayTeamId)}?`,
        options: [`${m.homeScore}–${m.awayScore}`, ...distract],
        correctIndex: 0,
      });
    }

    const w = m.homeScore > m.awayScore ? 0 : m.homeScore < m.awayScore ? 1 : 2;
    out.push({
      id: `winner:${m.matchNumber}`,
      type: "winner",
      prompt: `Vem vann ${label(m.homeTeamId)} – ${label(m.awayTeamId)}?`,
      options: [home.name, away.name, "Oavgjort"],
      correctIndex: w,
    });

    out.push({
      id: `goals:${m.matchNumber}`,
      type: "goals",
      prompt: `Hur många mål gjordes totalt i ${label(m.homeTeamId)} – ${label(m.awayTeamId)}?`,
      options: numberOptions(m.homeScore + m.awayScore),
      correctIndex: 0,
    });
  }

  for (const [g, st] of Object.entries(data.standings)) {
    if (st.length < 4) continue;
    const ids = st.map((s) => s.teamId);
    const winnerId = st.find((s) => s.rank === 1)?.teamId;
    if (winnerId) {
      out.push({
        id: `groupWinner:${g}`,
        type: "groupWinner",
        prompt: `Vilket lag vann grupp ${g}?`,
        options: ids.map(label),
        correctIndex: ids.indexOf(winnerId),
      });
    }
    const topGf = [...st].sort((a, b) => b.gf - a.gf)[0]?.teamId;
    if (topGf) {
      out.push({
        id: `mostGoals:${g}`,
        type: "mostGoals",
        prompt: `Vilket lag gjorde flest mål i grupp ${g}?`,
        options: ids.map(label),
        correctIndex: ids.indexOf(topGf),
      });
    }
  }

  // Målskyttefrågor (endast om vi har målskyttedata)
  const realGoals = data.goals.filter((g) => !g.ownGoal);
  if (realGoals.length) {
    const counts = new Map<string, number>();
    for (const g of realGoals) counts.set(g.scorer, (counts.get(g.scorer) ?? 0) + 1);
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const allScorers = ranked.map((r) => r[0]);

    if (ranked.length >= 4 && ranked[0][1] >= 2) {
      out.push({
        id: "topScorer",
        type: "topScorer",
        prompt: "Vem har gjort flest mål hittills i turneringen?",
        options: [ranked[0][0], ...allScorers.filter((s) => s !== ranked[0][0]).slice(0, 3)],
        correctIndex: 0,
      });
    }

    if (allScorers.length >= 4) {
      const seen = new Set<string>();
      for (const gl of realGoals) {
        const key = `${gl.matchNumber}:${gl.teamId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const team = tById.get(gl.teamId);
        const m = data.matches.find((mm) => mm.matchNumber === gl.matchNumber);
        if (!team || !m) continue;
        const oppId = m.homeTeamId === gl.teamId ? m.awayTeamId : m.homeTeamId;
        const distract = allScorers.filter((s) => s !== gl.scorer).slice(0, 3);
        if (distract.length < 3) continue;
        out.push({
          id: `scorer:${gl.matchNumber}:${gl.teamId}`,
          type: "scorer",
          prompt: `Vem gjorde mål för ${team.flag} ${team.name} mot ${label(oppId)}?`,
          options: [gl.scorer, ...distract],
          correctIndex: 0,
        });
      }
    }
  }

  return out;
}

// Väljer n frågor och blandar alternativen. Slumpen bakas in i det sparade settet.
export function selectQuiz(pool: Question[], n: number, rng: Rng = Math.random): Question[] {
  return shuffle(pool, rng)
    .slice(0, n)
    .map((q) => {
      const order = shuffle(
        q.options.map((_, i) => i),
        rng,
      );
      return {
        ...q,
        options: order.map((i) => q.options[i]),
        correctIndex: order.indexOf(q.correctIndex),
      };
    });
}

export function scoreAnswer(correct: boolean, msUsed: number, cfg = QUIZ): number {
  if (!correct) return 0;
  const frac = Math.max(0, Math.min(1, msUsed / cfg.perQuestionMs));
  return cfg.basePoints + Math.round(cfg.maxSpeedBonus * (1 - frac));
}

export interface Answer {
  questionId: string;
  choiceIndex: number;
  ms: number;
}

export function gradeQuiz(
  questions: Question[],
  answers: Answer[],
  cfg = QUIZ,
): { score: number; correctCount: number; totalMs: number } {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  let score = 0;
  let correctCount = 0;
  let totalMs = 0;
  for (const q of questions) {
    const a = byId.get(q.id);
    const ms = a ? Math.max(0, Math.min(cfg.perQuestionMs, a.ms)) : cfg.perQuestionMs;
    totalMs += ms;
    if (a && a.choiceIndex === q.correctIndex) {
      correctCount++;
      score += scoreAnswer(true, ms, cfg);
    }
  }
  return { score, correctCount, totalMs };
}

// Tar bort facit innan frågor skickas till klienten.
export function stripAnswers(questions: Question[]): Omit<Question, "correctIndex">[] {
  return questions.map(({ correctIndex, ...rest }) => rest);
}
