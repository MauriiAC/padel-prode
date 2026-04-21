"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  createTournamentAction,
  type CreateTournamentState,
} from "@/actions/tournaments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewTournamentPage() {
  const [state, formAction, pending] = useActionState<
    CreateTournamentState,
    FormData
  >(createTournamentAction, undefined);

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Nuevo torneo</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                name="name"
                required
                maxLength={120}
                placeholder="Ej: Premier Padel 2026"
                autoFocus
              />
            </div>
            {state?.error && (
              <p className="text-sm text-destructive" role="alert">
                {state.error}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" asChild>
                <Link href="/admin/tournaments">Cancelar</Link>
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Creando..." : "Crear"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
