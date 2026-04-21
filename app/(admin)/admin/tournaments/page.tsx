import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_LABEL: Record<"draft" | "active" | "finished", string> = {
  draft: "Borrador",
  active: "Activo",
  finished: "Finalizado",
};

export default async function TournamentsPage() {
  const rows = await db.select().from(tournaments).orderBy(desc(tournaments.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Torneos</h1>
        <Button asChild>
          <Link href="/admin/tournaments/new">Crear torneo</Link>
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Creado</TableHead>
            <TableHead className="w-[1%] whitespace-nowrap">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => (
            <TableRow key={t.id}>
              <TableCell>
                <Link
                  href={`/admin/tournaments/${t.id}`}
                  className="font-medium hover:underline"
                >
                  {t.name}
                </Link>
              </TableCell>
              <TableCell>{STATUS_LABEL[t.status]}</TableCell>
              <TableCell>{t.createdAt.toLocaleDateString("es-AR")}</TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/admin/tournaments/${t.id}`}>Abrir</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No hay torneos todavía.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
