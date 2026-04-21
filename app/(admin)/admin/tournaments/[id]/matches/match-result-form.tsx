"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setMatchResultAction } from "@/actions/matches";
import { Button } from "@/components/ui/button";

type Team = { id: string; name: string };

export function MatchResultForm({
  tournamentId,
  matchId,
  teamA,
  teamB,
  currentWinnerId,
  currentSets,
}: {
  tournamentId: string;
  matchId: string;
  teamA: Team;
  teamB: Team;
  currentWinnerId: string | null;
  currentSets: 2 | 3 | null;
}) {
  const [pending, startTransition] = useTransition();

  function save(winnerId: string | null, sets: 2 | 3 | null) {
    startTransition(async () => {
      const res = await setMatchResultAction(
        matchId,
        tournamentId,
        winnerId,
        sets
      );
      if (res.ok) toast.success("Resultado guardado");
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-wrap gap-2 items-center text-sm">
      <select
        value={currentWinnerId ?? ""}
        onChange={(e) => save(e.target.value || null, currentSets ?? 2)}
        disabled={pending}
        className="h-8 rounded-md border px-2"
      >
        <option value="">Ganador</option>
        <option value={teamA.id}>{teamA.name}</option>
        <option value={teamB.id}>{teamB.name}</option>
      </select>
      <select
        value={currentSets ?? ""}
        onChange={(e) =>
          save(
            currentWinnerId,
            e.target.value === "" ? null : (parseInt(e.target.value) as 2 | 3)
          )
        }
        disabled={pending || !currentWinnerId}
        className="h-8 rounded-md border px-2"
      >
        <option value="">Sets</option>
        <option value="2">2</option>
        <option value="3">3</option>
      </select>
      {(currentWinnerId || currentSets) && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => save(null, null)}
          disabled={pending}
        >
          Limpiar
        </Button>
      )}
    </div>
  );
}
