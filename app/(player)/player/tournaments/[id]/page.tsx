import { redirect } from "next/navigation";

export default async function PlayerTournamentIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/player/tournaments/${id}/groups`);
}
