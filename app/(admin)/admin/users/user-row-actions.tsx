"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  resendTemporaryPasswordAction,
  deleteUserAction,
} from "@/actions/users";

export function UserRowActions({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const [pending, startTransition] = useTransition();

  function resend() {
    startTransition(async () => {
      const res = await resendTemporaryPasswordAction(userId);
      if (res.ok) toast.success("Mail con contraseña temporal reenviado");
      else toast.error(res.error);
    });
  }

  function remove() {
    if (!confirm(`¿Borrar usuario "${userName}"?`)) return;
    startTransition(async () => {
      const res = await deleteUserAction(userId);
      if (res.ok) toast.success("Usuario borrado");
      else toast.error(res.error);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={pending}>
          •••
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={resend}>Reenviar contraseña temporal</DropdownMenuItem>
        <DropdownMenuItem onClick={remove} className="text-destructive">
          Borrar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
