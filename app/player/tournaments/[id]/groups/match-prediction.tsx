"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { toast } from "sonner";
import { upsertPredictionAction } from "@/actions/predictions";

type Team = { id: string; name: string };
type Prediction = { winnerTeamId: string; sets: 2 | 3 };

export function MatchPrediction({
  tournamentId,
  matchId,
  teamA,
  teamB,
  resultWinnerId,
  resultSets,
  initialPrediction,
  locked,
}: {
  tournamentId: string;
  matchId: string;
  teamA: Team;
  teamB: Team;
  resultWinnerId: string | null;
  resultSets: 2 | 3 | null;
  initialPrediction: Prediction | null;
  locked: boolean;
}) {
  const [pred, setPred] = useState<Prediction | null>(initialPrediction);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function save(next: Prediction) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await upsertPredictionAction(
          matchId,
          tournamentId,
          next.winnerTeamId,
          next.sets
        );
        if (!res.ok) toast.error(res.error);
      });
    }, 300);
  }

  function onWinnerChange(winnerTeamId: string) {
    const next: Prediction = { winnerTeamId, sets: pred?.sets ?? 2 };
    setPred(next);
    if (!locked) save(next);
  }

  function onSetsChange(sets: 2 | 3) {
    if (!pred) return;
    const next: Prediction = { ...pred, sets };
    setPred(next);
    if (!locked) save(next);
  }

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {teamA.name} vs {teamB.name}
        </span>
        {resultWinnerId && resultSets && (
          <span className="text-xs text-muted-foreground">
            Resultado: {resultWinnerId === teamA.id ? teamA.name : teamB.name}{" "}
            en {resultSets} sets
          </span>
        )}
      </div>
      <div className="flex gap-4">
        <fieldset className="flex gap-3 items-center" disabled={locked}>
          <legend className="sr-only">Ganador</legend>
          {[teamA, teamB].map((t) => (
            <label key={t.id} className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name={`winner-${matchId}`}
                checked={pred?.winnerTeamId === t.id}
                onChange={() => onWinnerChange(t.id)}
              />
              {t.name}
            </label>
          ))}
        </fieldset>
        <fieldset
          className="flex gap-3 items-center"
          disabled={locked || !pred}
        >
          <legend className="sr-only">Sets</legend>
          {([2, 3] as const).map((s) => (
            <label key={s} className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name={`sets-${matchId}`}
                checked={pred?.sets === s}
                onChange={() => onSetsChange(s)}
              />
              {s} sets
            </label>
          ))}
        </fieldset>
      </div>
      {pending && <p className="text-xs text-muted-foreground">Guardando...</p>}
    </div>
  );
}
