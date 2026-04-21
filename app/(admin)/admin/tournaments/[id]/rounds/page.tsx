import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { rounds } from "@/db/schema";
import { RoundStatusControl } from "./round-status-control";

const STATUS_LABEL: Record<"sin_abrir" | "abierta" | "cerrada", string> = {
  sin_abrir: "Sin abrir",
  abierta: "Abierta",
  cerrada: "Cerrada",
};

export default async function TournamentRoundsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = await params;

  const rows = await db
    .select()
    .from(rounds)
    .where(eq(rounds.tournamentId, tournamentId))
    .orderBy(asc(rounds.order));

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        No hay rondas. Generá partidos desde &quot;Zonas&quot; para crear la ronda de fase de grupos.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div
          key={r.id}
          className="rounded-lg border p-4 flex flex-wrap items-center justify-between gap-3"
        >
          <div>
            <div className="font-medium">{r.name}</div>
            <div className="text-xs text-muted-foreground">
              {r.kind === "groups" ? "Fase de grupos" : "Playoff"} · Estado:{" "}
              {STATUS_LABEL[r.status]}
            </div>
          </div>
          <RoundStatusControl
            roundId={r.id}
            tournamentId={tournamentId}
            status={r.status}
          />
        </div>
      ))}
    </div>
  );
}
