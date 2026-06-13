"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface PubQuestion {
  id: string;
  type: string;
  prompt: string;
  options: string[];
}
interface Answer {
  questionId: string;
  choiceIndex: number;
  ms: number;
}

type Phase = "loading" | "playing" | "submitting" | "result" | "already" | "error";

export function QuizPlayer({ quizId, onDone }: { quizId: string; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [questions, setQuestions] = useState<PubQuestion[]>([]);
  const [perQuestionMs, setPerQuestionMs] = useState(20000);
  const [qIndex, setQIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<{ score: number; correctCount: number; total: number } | null>(null);
  const [others, setOthers] = useState<
    { name: string; score: number; correctCount: number; awayCount: number }[]
  >([]);
  const [error, setError] = useState<string | null>(null);

  const answersRef = useRef<Answer[]>([]);
  const startRef = useRef(0);
  const lockedRef = useRef(false);
  const qIndexRef = useRef(0);

  // Anti-cheat: mät när spelaren lämnar rutan (tabbar bort / byter fönster).
  const awayCountRef = useRef(0);
  const awayMsRef = useRef(0);
  const awayStartRef = useRef<number | null>(null);

  // Ladda quizen
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/quiz/${quizId}`);
        const d = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setError(d.error ?? "Kunde inte ladda quizen");
          setPhase("error");
          return;
        }
        if (d.played) {
          setResult({ score: d.myResult.score, correctCount: d.myResult.correctCount, total: d.totalQuestions });
          setOthers(d.others ?? []);
          setPhase("already");
          return;
        }
        setQuestions(d.questions);
        setPerQuestionMs(d.perQuestionMs);
        startQuestion(0, d.perQuestionMs);
        setPhase("playing");
      } catch {
        if (alive) {
          setError("Nätverksfel");
          setPhase("error");
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  function startQuestion(i: number, limit: number) {
    qIndexRef.current = i;
    setQIndex(i);
    setPicked(null);
    lockedRef.current = false;
    startRef.current = Date.now();
    setRemaining(limit);
  }

  const submit = useCallback(async () => {
    // stäng ev. pågående borta-period
    if (awayStartRef.current != null) {
      awayMsRef.current += Date.now() - awayStartRef.current;
      awayStartRef.current = null;
    }
    setPhase("submitting");
    try {
      const res = await fetch(`/api/quiz/${quizId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: answersRef.current,
          activity: { awayCount: awayCountRef.current, awayMs: Math.round(awayMsRef.current) },
        }),
      });
      const d = await res.json();
      if (res.ok) {
        setResult({ score: d.score, correctCount: d.correctCount, total: d.totalQuestions });
        setPhase("result");
      } else {
        setError(d.error ?? "Kunde inte spara");
        setPhase("error");
      }
    } catch {
      setError("Nätverksfel");
      setPhase("error");
    }
  }, [quizId]);

  const answer = useCallback(
    (choiceIndex: number) => {
      if (lockedRef.current) return;
      lockedRef.current = true;
      const i = qIndexRef.current;
      const ms = Date.now() - startRef.current;
      answersRef.current.push({ questionId: questions[i].id, choiceIndex, ms });
      setPicked(choiceIndex);
      setTimeout(() => {
        if (i + 1 < questions.length) startQuestion(i + 1, perQuestionMs);
        else submit();
      }, 300);
    },
    [questions, perQuestionMs, submit],
  );

  // Anti-cheat: registrera när rutan lämnas/återfås (en borta-period räknas en gång
  // även om både blur och visibilitychange triggar).
  useEffect(() => {
    const goAway = () => {
      if (awayStartRef.current == null) {
        awayStartRef.current = Date.now();
        awayCountRef.current += 1;
      }
    };
    const comeBack = () => {
      if (awayStartRef.current != null) {
        awayMsRef.current += Date.now() - awayStartRef.current;
        awayStartRef.current = null;
      }
    };
    const onVis = () => (document.hidden ? goAway() : comeBack());
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", goAway);
    window.addEventListener("focus", comeBack);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", goAway);
      window.removeEventListener("focus", comeBack);
    };
  }, []);

  // Nedräkning
  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => {
      if (lockedRef.current) return;
      const rem = perQuestionMs - (Date.now() - startRef.current);
      if (rem <= 0) answer(-1); // timeout
      else setRemaining(rem);
    }, 100);
    return () => clearInterval(id);
  }, [phase, perQuestionMs, answer]);

  if (phase === "loading" || phase === "submitting")
    return <div className="card p-6 text-center text-slate-400">{phase === "submitting" ? "Räknar poäng…" : "Laddar…"}</div>;

  if (phase === "error")
    return (
      <div className="card space-y-3 p-6 text-center">
        <p className="text-red-300">{error}</p>
        <button onClick={onDone} className="btn-ghost">Tillbaka</button>
      </div>
    );

  if (phase === "result" || phase === "already") {
    return (
      <div className="card space-y-4 p-6 text-center">
        <div className="text-4xl">{phase === "already" ? "✓" : "🎉"}</div>
        <h2 className="text-xl font-extrabold">
          {result!.score} poäng · {result!.correctCount}/{result!.total} rätt
        </h2>
        {awayCountRef.current > 0 && (
          <p className="text-xs text-amber-300">
            ⚠️ Du lämnade rutan {awayCountRef.current} {awayCountRef.current === 1 ? "gång" : "gånger"} — det syns för ligan.
          </p>
        )}
        {others.length > 0 && (
          <div className="mx-auto max-w-xs space-y-1 text-sm">
            <div className="text-xs uppercase tracking-wide text-slate-400">Motståndare</div>
            {others.map((o) => (
              <div key={o.name} className="flex justify-between">
                <span>
                  {o.name} {o.awayCount > 0 && <span title={`Lämnade rutan ${o.awayCount} ggr`}>⚠️</span>}
                </span>
                <span className="tabular-nums">
                  {o.score} p · {o.correctCount} rätt
                </span>
              </div>
            ))}
          </div>
        )}
        {phase === "already" && others.length === 0 && (
          <p className="text-sm text-slate-400">Väntar på att motståndaren spelar…</p>
        )}
        <button onClick={onDone} className="btn-primary">Tillbaka</button>
      </div>
    );
  }

  // playing
  const q = questions[qIndex];
  const pct = Math.max(0, (remaining / perQuestionMs) * 100);
  const secs = Math.ceil(remaining / 1000);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>Fråga {qIndex + 1}/{questions.length}</span>
        <span className={`font-bold tabular-nums ${secs <= 5 ? "text-red-400" : "text-slate-300"}`}>{secs}s</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full transition-[width] duration-100 ease-linear ${pct < 30 ? "bg-red-500" : "bg-pitch-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-bold">{q.prompt}</h2>
      </div>

      <div className="grid gap-2">
        {q.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => answer(i)}
            disabled={picked !== null}
            className={`rounded-xl border px-4 py-3 text-left text-base font-medium transition ${
              picked === i
                ? "border-pitch-500 bg-pitch-500/25 text-pitch-50"
                : "border-white/10 bg-night-900/70 hover:bg-white/10 disabled:opacity-60"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
