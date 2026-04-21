import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import { TabsNav } from "./tabs-nav";
import { StatusControl } from "./status-control";

export default async function TournamentLayout({
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

  if (!tournament) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{tournament.name}</h1>
        <StatusControl tournamentId={tournament.id} status={tournament.status} />
      </div>
      <TabsNav tournamentId={tournament.id} />
      <div>{children}</div>
    </div>
  );
}
