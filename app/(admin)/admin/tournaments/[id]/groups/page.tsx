import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { groups, groupTeams, teams } from "@/db/schema";
import { GroupsEditor } from "./groups-editor";

export default async function TournamentGroupsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = await params;

  const allTeams = await db
    .select()
    .from(teams)
    .where(eq(teams.tournamentId, tournamentId))
    .orderBy(asc(teams.name));

  const allGroups = await db
    .select()
    .from(groups)
    .where(eq(groups.tournamentId, tournamentId))
    .orderBy(asc(groups.order));

  const assignments = await db
    .select({
      groupId: groupTeams.groupId,
      teamId: groupTeams.teamId,
      finalPosition: groupTeams.finalPosition,
    })
    .from(groupTeams)
    .innerJoin(groups, eq(groupTeams.groupId, groups.id))
    .where(eq(groups.tournamentId, tournamentId));

  return (
    <GroupsEditor
      tournamentId={tournamentId}
      teams={allTeams.map((t) => ({ id: t.id, name: t.name }))}
      groups={allGroups.map((g) => ({
        id: g.id,
        name: g.name,
        order: g.order,
      }))}
      assignments={assignments}
    />
  );
}
