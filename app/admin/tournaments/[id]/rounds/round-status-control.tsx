"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { changeRoundStatusAction } from "@/actions/rounds";

type Status = "sin_abrir" | "abierta" | "cerrada";

export function RoundStatusControl({
  roundId,
  tournamentId,
  status,
}: {
  roundId: string;
  tournamentId: string;
  status: Status;
}) {
  const [pending, startTransition] = useTransition();

  function change(next: Status) {
    startTransition(async () => {
      const res = await changeRoundStatusAction(roundId, tournamentId, next);
      if (res.ok) toast.success("Estado actualizado");
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex gap-2">
      {status === "sin_abrir" && (
        <Button size="sm" onClick={() => change("abierta")} disabled={pending}>
          Abrir ronda
        </Button>
      )}
      {status === "abierta" && (
        <Button size="sm" onClick={() => change("cerrada")} disabled={pending}>
          Cerrar ronda
        </Button>
      )}
      {status === "cerrada" && (
        <span className="text-xs text-muted-foreground">
          Ronda cerrada (no se puede volver atrás)
        </span>
      )}
    </div>
  );
}
