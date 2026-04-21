"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  changeTournamentStatusAction,
  deleteTournamentAction,
} from "@/actions/tournaments";
import { Button } from "@/components/ui/button";

const STATUS_OPTIONS: { value: "draft" | "active" | "finished"; label: string }[] = [
  { value: "draft", label: "Borrador" },
  { value: "active", label: "Activo" },
  { value: "finished", label: "Finalizado" },
];

export function StatusControl({
  tournamentId,
  status,
}: {
  tournamentId: string;
  status: "draft" | "active" | "finished";
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as "draft" | "active" | "finished";
    if (next === status) return;
    startTransition(async () => {
      const res = await changeTournamentStatusAction(tournamentId, next);
      if (res.ok) toast.success("Estado actualizado");
      else toast.error(res.error);
    });
  }

  function onDelete() {
    if (!confirm("¿Borrar este torneo? Se borran zonas, equipos y partidos."))
      return;
    startTransition(async () => {
      const res = await deleteTournamentAction(tournamentId);
      if (res.ok) {
        toast.success("Torneo borrado");
        router.push("/admin/tournaments");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={status}
        onChange={onChange}
        disabled={pending}
        className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <Button variant="ghost" size="sm" onClick={onDelete} disabled={pending}>
        Borrar
      </Button>
    </div>
  );
}
