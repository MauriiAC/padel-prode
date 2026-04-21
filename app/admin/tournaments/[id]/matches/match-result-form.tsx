"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setMatchResultAction } from "@/actions/matches";
import { Button } from "@/components/ui/button";
import { ConfirmInvalidationDialog } from "@/components/confirm-invalidation-dialog";

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
  const [pendingConfirm, setPendingConfirm] = useState<null | {
    winnerId: string | null;
    sets: 2 | 3 | null;
    affectedCount: number;
  }>(null);

  function save(winnerId: string | null, sets: 2 | 3 | null, confirm = false) {
    startTransition(async () => {
      const res = await setMatchResultAction(
        matchId,
        tournamentId,
        winnerId,
        sets,
        confirm
      );
      if (res.ok) {
        toast.success("Resultado guardado");
        setPendingConfirm(null);
        return;
      }
      if ("requiresConfirmation" in res) {
        setPendingConfirm({ winnerId, sets, affectedCount: res.affectedCount });
        return;
      }
      toast.error(res.error);
    });
  }

  function confirmInvalidation() {
    if (!pendingConfirm) return;
    save(pendingConfirm.winnerId, pendingConfirm.sets, true);
  }

  return (
    <>
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
    <ConfirmInvalidationDialog
      open={!!pendingConfirm}
      affectedCount={pendingConfirm?.affectedCount ?? 0}
      onConfirm={confirmInvalidation}
      onCancel={() => setPendingConfirm(null)}
    />
    </>
  );
}
