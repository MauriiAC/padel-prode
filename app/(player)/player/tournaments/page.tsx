import Link from "next/link";
import { desc, ne } from "drizzle-orm";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_LABEL: Record<"draft" | "active" | "finished", string> = {
  draft: "Borrador",
  active: "Activo",
  finished: "Finalizado",
};

export default async function PlayerTournamentsPage() {
  const rows = await db
    .select()
    .from(tournaments)
    .where(ne(tournaments.status, "draft"))
    .orderBy(desc(tournaments.createdAt));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Torneos</h1>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No hay torneos disponibles todavía.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((t) => (
            <Link key={t.id} href={`/player/tournaments/${t.id}`}>
              <Card className="hover:border-primary/50 transition">
                <CardHeader>
                  <CardTitle className="text-base">{t.name}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Estado: {STATUS_LABEL[t.status]}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
