export interface TeamLite {
  id: string;
  name: string;
  code: string;
  flag: string;
  fifaRank: number;
  groupId: string;
}

export function TeamLabel({
  team,
  align = "left",
}: {
  team?: TeamLite | null;
  align?: "left" | "right";
}) {
  if (!team) return <span className="text-slate-500">—</span>;
  return (
    <span
      className={`flex min-w-0 items-center gap-1.5 ${align === "right" ? "flex-row-reverse" : ""}`}
    >
      <span className="shrink-0 text-base leading-none">{team.flag}</span>
      <span className="font-semibold">{team.code}</span>
    </span>
  );
}

interface PickProps {
  team?: TeamLite | null;
  placeholder?: string;
  selected?: boolean;
  loser?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

// Klickbar lag-knapp i bracket-byggaren
export function TeamPick({ team, placeholder, selected, loser, disabled, onClick }: PickProps) {
  const base =
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition text-left";
  const state = selected
    ? "bg-pitch-500/25 text-pitch-50 ring-1 ring-pitch-500"
    : loser
      ? "bg-transparent text-slate-500 line-through"
      : "bg-white/5 text-slate-200 hover:bg-white/10";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !team}
      className={`${base} ${state} ${disabled ? "cursor-default" : ""}`}
    >
      {team ? (
        <>
          <span className="text-base leading-none">{team.flag}</span>
          <span className="font-semibold">{team.code}</span>
        </>
      ) : (
        <span className="text-slate-500">{placeholder ?? "—"}</span>
      )}
    </button>
  );
}
