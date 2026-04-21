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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { createTeamAction, updateTeamAction } from "@/actions/teams";

type Team = {
  id: string;
  name: string;
  player1Name: string;
  player2Name: string;
};

type Props =
  | { mode: "create"; tournamentId: string; team?: never; trigger?: React.ReactNode }
  | { mode: "edit"; tournamentId: string; team: Team; trigger?: React.ReactNode };

export function TeamDialog(props: Props) {
  const { mode, tournamentId } = props;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createTeamAction(formData)
          : await updateTeamAction(formData);

      if (result.ok) {
        toast.success(mode === "create" ? "Equipo creado" : "Equipo actualizado");
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  const trigger = props.trigger ?? (
    <Button>{mode === "create" ? "Crear equipo" : "Editar"}</Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form action={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "Nuevo equipo" : "Editar equipo"}
            </DialogTitle>
          </DialogHeader>
          <input type="hidden" name="tournamentId" value={tournamentId} />
          {mode === "edit" && <input type="hidden" name="id" value={props.team.id} />}

          <div className="space-y-2">
            <Label htmlFor="name">Nombre del equipo</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={80}
              defaultValue={mode === "edit" ? props.team.name : ""}
              placeholder="Ej: Los Titanes"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="player1Name">Jugador 1</Label>
            <Input
              id="player1Name"
              name="player1Name"
              required
              maxLength={80}
              defaultValue={mode === "edit" ? props.team.player1Name : ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="player2Name">Jugador 2</Label>
            <Input
              id="player2Name"
              name="player2Name"
              required
              maxLength={80}
              defaultValue={mode === "edit" ? props.team.player2Name : ""}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
