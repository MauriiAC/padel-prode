"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { setTeamPositionAction } from "@/actions/groups";

type Team = { id: string; name: string };
type Group = { id: string; name: string; order: number };
type Assignment = {
  groupId: string;
  teamId: string;
  finalPosition: number | null;
};

export function EditPositionsDialog({
  tournamentId,
  groups,
  teamsByGroup,
  assignments,
}: {
  tournamentId: string;
  groups: Group[];
  teamsByGroup: Map<string, Team[]>;
  assignments: Assignment[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const positionByPair = new Map<string, number | null>(
    assignments.map((a) => [`${a.groupId}:${a.teamId}`, a.finalPosition])
  );

  function onChange(groupId: string, teamId: string, value: string) {
    const parsed = value === "" ? null : parseInt(value, 10);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 1 || parsed > 4))
      return;
    startTransition(async () => {
      const res = await setTeamPositionAction(
        groupId,
        teamId,
        parsed,
        tournamentId
      );
      if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Editar posiciones</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Posiciones finales por zona</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {groups.map((g) => {
            const teams = teamsByGroup.get(g.id) ?? [];
            return (
              <div key={g.id} className="space-y-2">
                <div className="font-medium">{g.name}</div>
                <div className="space-y-1">
                  {teams.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span>{t.name}</span>
                      <input
                        type="number"
                        min={1}
                        max={4}
                        defaultValue={
                          positionByPair.get(`${g.id}:${t.id}`) ?? ""
                        }
                        onBlur={(e) => onChange(g.id, t.id, e.target.value)}
                        disabled={pending}
                        className="w-16 h-8 rounded-md border px-2 text-sm"
                        placeholder="?"
                      />
                    </div>
                  ))}
                  {teams.length === 0 && (
                    <p className="text-xs text-muted-foreground">Sin equipos</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
