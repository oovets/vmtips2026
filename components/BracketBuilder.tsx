"use client";

import { useState } from "react";
import { BRACKET, type BracketSlot } from "@/lib/bracket-template";
import type { Participants, Winners } from "@/lib/bracket";
import { DiceIcon } from "./DiceIcon";
import { TeamPick, type TeamLite } from "./TeamPill";

interface Props {
  teamsById: Record<string, TeamLite>;
  resolved: Participants; // deltagare per slutspelsmatch
  winners: Winners; // validerade vinnarval
  onPick: (matchNumber: number, teamId: string) => void;
  randomWinner?: (homeTeamId: string, awayTeamId: string) => string;
  onRandomizeRest?: () => void;
  readOnly?: boolean;
}

const COLUMNS: { stage: string; title: string; short: string }[] = [
  { stage: "R32", title: "32-delsfinaler", short: "32-del" },
  { stage: "R16", title: "Åttondelar", short: "8-del" },
  { stage: "QF", title: "Kvartsfinaler", short: "Kvart" },
  { stage: "SF", title: "Semifinaler", short: "Semi" },
  { stage: "FINAL", title: "Final", short: "Final" },
];

export function BracketBuilder({
  teamsById,
  resolved,
  winners,
  onPick,
  randomWinner,
  onRandomizeRest,
  readOnly,
}: Props) {
  const [stage, setStage] = useState("R32");
  const champion = winners[104] ? teamsById[winners[104]] : null;
  const matchesOf = (s: string) => BRACKET.filter((b) => b.stage === s);

  function MatchCard({ b }: { b: BracketSlot }) {
    const part = resolved[b.matchNumber] ?? { homeTeamId: null, awayTeamId: null };
    const home = part.homeTeamId ? teamsById[part.homeTeamId] : null;
    const away = part.awayTeamId ? teamsById[part.awayTeamId] : null;
    const w = winners[b.matchNumber];
    const canRandom = !readOnly && randomWinner && part.homeTeamId && part.awayTeamId;
    return (
      <div className="card space-y-1 p-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-slate-500">Match {b.matchNumber}</span>
          {canRandom && (
            <button
              type="button"
              title="Slumpa vinnare i den här matchen"
              onClick={() => {
                const rw = randomWinner!(part.homeTeamId!, part.awayTeamId!);
                if (rw !== w) onPick(b.matchNumber, rw);
              }}
              className="text-xs opacity-60 transition hover:opacity-100"
            >
              <DiceIcon />
            </button>
          )}
        </div>
        <TeamPick
          team={home}
          placeholder={b.home}
          selected={!!w && w === part.homeTeamId}
          loser={!!w && w === part.awayTeamId}
          disabled={readOnly}
          onClick={() => part.homeTeamId && onPick(b.matchNumber, part.homeTeamId)}
        />
        <TeamPick
          team={away}
          placeholder={b.away}
          selected={!!w && w === part.awayTeamId}
          loser={!!w && w === part.homeTeamId}
          disabled={readOnly}
          onClick={() => part.awayTeamId && onPick(b.matchNumber, part.awayTeamId)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-slate-400">Din världsmästare</div>
          <div className="mt-1 text-xl font-extrabold sm:text-2xl">
            {champion ? (
              <span className="inline-flex items-center gap-2">
                <span>{champion.flag}</span> {champion.code}
              </span>
            ) : (
              <span className="text-base text-slate-500">Välj vinnare hela vägen till finalen…</span>
            )}
          </div>
        </div>
        {!readOnly && onRandomizeRest && (
          <button onClick={onRandomizeRest} className="btn-ghost btn-sm shrink-0" title="Slumpa vinnare för alla matcher du inte valt">
            Slumpa återstående
          </button>
        )}
      </div>

      {/* MOBIL: en runda i taget */}
      <div className="sm:hidden">
        <div className="grid grid-cols-5 gap-1 rounded-xl bg-night-950/60 p-1 text-xs">
          {COLUMNS.map((c) => (
            <button
              key={c.stage}
              onClick={() => setStage(c.stage)}
              className={`rounded-lg py-1.5 font-semibold transition ${
                stage === c.stage ? "bg-pitch-500 text-white" : "text-slate-300"
              }`}
            >
              {c.short}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-3">
          {matchesOf(stage).map((b) => (
            <MatchCard key={b.matchNumber} b={b} />
          ))}
        </div>
      </div>

      {/* DESKTOP: hela trädet sida vid sida */}
      <div className="hidden overflow-x-auto pb-2 sm:block">
        <div className="flex min-w-max gap-4">
          {COLUMNS.map((col) => (
            <div key={col.stage} className="w-60 shrink-0 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{col.title}</h3>
              {matchesOf(col.stage).map((b) => (
                <MatchCard key={b.matchNumber} b={b} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Klicka på laget du tror går vidare. Vinnarna förs automatiskt till nästa runda. Ändrar du ett
        tidigare resultat rensas val som inte längre stämmer.
      </p>
    </div>
  );
}
