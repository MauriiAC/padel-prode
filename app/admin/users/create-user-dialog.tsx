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
import { createUserAction } from "@/actions/users";

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createUserAction(formData);
      if (result.ok) {
        toast.success("Usuario creado. Se envió el mail con la contraseña temporal.");
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Crear usuario</Button>
      </DialogTrigger>
      <DialogContent>
        <form action={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Rol</Label>
            <select
              id="role"
              name="role"
              defaultValue="player"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="player">Player</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando..." : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
