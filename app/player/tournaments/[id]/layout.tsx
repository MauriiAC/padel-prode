import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import { PlayerBottomNav } from "@/components/player-bottom-nav";

export default async function PlayerTournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [tournament] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, id))
    .limit(1);

  if (!tournament || tournament.status === "draft") notFound();

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex-1 space-y-4 pb-4">
        <h1 className="text-lg font-semibold">{tournament.name}</h1>
        {children}
      </div>
      <PlayerBottomNav tournamentId={tournament.id} />
    </div>
  );
}
