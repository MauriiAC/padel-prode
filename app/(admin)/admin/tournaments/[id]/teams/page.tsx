import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { teams } from "@/db/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TeamDialog } from "./team-dialog";
import { TeamRowActions } from "./team-row-actions";

export default async function TournamentTeamsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const rows = await db
    .select()
    .from(teams)
    .where(eq(teams.tournamentId, id))
    .orderBy(asc(teams.name));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Equipos</h2>
        <TeamDialog mode="create" tournamentId={id} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Equipo</TableHead>
            <TableHead>Jugador 1</TableHead>
            <TableHead>Jugador 2</TableHead>
            <TableHead className="w-[1%] whitespace-nowrap">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">{t.name}</TableCell>
              <TableCell>{t.player1Name}</TableCell>
              <TableCell>{t.player2Name}</TableCell>
              <TableCell>
                <TeamRowActions
                  team={{
                    id: t.id,
                    name: t.name,
                    player1Name: t.player1Name,
                    player2Name: t.player2Name,
                  }}
                  tournamentId={id}
                />
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No hay equipos todavía.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
