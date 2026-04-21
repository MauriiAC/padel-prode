"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { deleteTeamAction } from "@/actions/teams";
import { TeamDialog } from "./team-dialog";

type Team = {
  id: string;
  name: string;
  player1Name: string;
  player2Name: string;
};

export function TeamRowActions({
  team,
  tournamentId,
}: {
  team: Team;
  tournamentId: string;
}) {
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!confirm(`¿Borrar el equipo "${team.name}"?`)) return;
    startTransition(async () => {
      const res = await deleteTeamAction(team.id, tournamentId);
      if (res.ok) toast.success("Equipo borrado");
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex gap-1 justify-end">
      <TeamDialog
        mode="edit"
        tournamentId={tournamentId}
        team={team}
        trigger={
          <Button variant="ghost" size="sm">
            Editar
          </Button>
        }
      />
      <Button variant="ghost" size="sm" onClick={remove} disabled={pending}>
        Borrar
      </Button>
    </div>
  );
}
