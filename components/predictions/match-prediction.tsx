"use client";

import { computeScore } from "@/lib/scoring";
import { cn } from "@/lib/utils";

type Team = { id: string; name: string };
export type PredictionValue = { winnerTeamId: string; sets: 2 | 3 };

function ScoreBadge({ score }: { score: 0 | 1 | 2 }) {
  const label = score === 0 ? "0 pts" : score === 1 ? "+1 pt" : "+2 pts";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        score === 2 && "bg-primary text-primary-foreground",
        score === 1 && "bg-accent text-accent-foreground",
        score === 0 && "bg-muted text-muted-foreground"
      )}
    >
      {label}
    </span>
  );
}

export function MatchPrediction({
  matchId,
  teamA,
  teamB,
  resultWinnerId,
  resultSets,
  value,
  onChange,
  locked,
  dirty,
}: {
  matchId: string;
  teamA: Team;
  teamB: Team;
  resultWinnerId: string | null;
  resultSets: 2 | 3 | null;
  value: PredictionValue | null;
  onChange: (next: PredictionValue) => void;
  locked: boolean;
  dirty?: boolean;
}) {
  const resultLoaded = resultWinnerId != null && resultSets != null;
  const score = resultLoaded
    ? computeScore(
        value
          ? {
              predictedWinnerTeamId: value.winnerTeamId,
              predictedSets: value.sets,
            }
          : null,
        { resultWinnerTeamId: resultWinnerId, resultSets: resultSets }
      )
    : null;

  function onWinnerChange(winnerTeamId: string) {
    onChange({ winnerTeamId, sets: value?.sets ?? 2 });
  }

  function onSetsChange(sets: 2 | 3) {
    if (!value) return;
    onChange({ ...value, sets });
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2 transition-colors",
        dirty && !locked && "border-accent bg-accent/5"
      )}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-medium">
          {teamA.name} vs {teamB.name}
        </span>
        <div className="flex items-center gap-2">
          {resultLoaded && (
            <span className="text-xs text-muted-foreground">
              Resultado: {resultWinnerId === teamA.id ? teamA.name : teamB.name}{" "}
              en {resultSets} sets
            </span>
          )}
          {score !== null && <ScoreBadge score={score} />}
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <fieldset className="flex gap-3 items-center" disabled={locked}>
          <legend className="sr-only">Ganador</legend>
          {[teamA, teamB].map((t) => (
            <label key={t.id} className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name={`winner-${matchId}`}
                checked={value?.winnerTeamId === t.id}
                onChange={() => onWinnerChange(t.id)}
              />
              {t.name}
            </label>
          ))}
        </fieldset>
        <fieldset
          className="flex gap-3 items-center"
          disabled={locked || !value}
        >
          <legend className="sr-only">Sets</legend>
          {([2, 3] as const).map((s) => (
            <label key={s} className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name={`sets-${matchId}`}
                checked={value?.sets === s}
                onChange={() => onSetsChange(s)}
              />
              {s} sets
            </label>
          ))}
        </fieldset>
      </div>
    </div>
  );
}
