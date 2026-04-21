"use client";

import { useActionState } from "react";
import {
  requestPasswordResetAction,
  type RequestResetState,
} from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState<RequestResetState, FormData>(
    requestPasswordResetAction,
    undefined
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Restablecer contraseña</CardTitle>
      </CardHeader>
      <CardContent>
        {state?.sent ? (
          <div className="space-y-4">
            <p>
              Le avisamos al administrador, que te va a pasar el link para
              blanquear tu contraseña en cuanto pueda.
            </p>
            <Link href="/login" className="text-primary hover:underline">
              Volver al login
            </Link>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoFocus />
            </div>
            {state?.error && (
              <p className="text-sm text-destructive" role="alert">
                {state.error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Avisando..." : "Avisar al administrador"}
            </Button>
            <p className="text-center text-sm">
              <Link href="/login" className="text-primary hover:underline">
                Volver al login
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
