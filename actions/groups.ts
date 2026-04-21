"use server";

import { z } from "zod";
import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { groups, groupTeams } from "@/db/schema";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return session.user;
}

export type GroupActionResult = { ok: true } | { ok: false; error: string };

const createGroupSchema = z.object({
  tournamentId: z.string().uuid(),
  name: z.string().min(1).max(40),
});

export async function createGroupAction(
  formData: FormData
): Promise<GroupActionResult> {
  await requireAdmin();
  const parsed = createGroupSchema.safeParse({
    tournamentId: formData.get("tournamentId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Inválido" };
  }

  const [maxRow] = await db
    .select({ max: max(groups.order) })
    .from(groups)
    .where(eq(groups.tournamentId, parsed.data.tournamentId));
  const nextOrder = (maxRow?.max ?? -1) + 1;

  await db.insert(groups).values({
    tournamentId: parsed.data.tournamentId,
    name: parsed.data.name,
    order: nextOrder,
  });

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/groups`);
  return { ok: true };
}

const renameGroupSchema = z.object({
  groupId: z.string().uuid(),
  tournamentId: z.string().uuid(),
  name: z.string().min(1).max(40),
});

export async function renameGroupAction(
  formData: FormData
): Promise<GroupActionResult> {
  await requireAdmin();
  const parsed = renameGroupSchema.safeParse({
    groupId: formData.get("groupId"),
    tournamentId: formData.get("tournamentId"),
    name: formData.get("name"),
  });
  if (!parsed.success) return { ok: false, error: "Inválido" };

  await db
    .update(groups)
    .set({ name: parsed.data.name })
    .where(eq(groups.id, parsed.data.groupId));

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/groups`);
  return { ok: true };
}

export async function deleteGroupAction(
  groupId: string,
  tournamentId: string
): Promise<GroupActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(groupId).success) {
    return { ok: false, error: "ID inválido" };
  }

  await db.delete(groups).where(eq(groups.id, groupId));

  revalidatePath(`/admin/tournaments/${tournamentId}/groups`);
  return { ok: true };
}

const assignSchema = z.object({
  groupId: z.string().uuid(),
  teamId: z.string().uuid(),
  tournamentId: z.string().uuid(),
});

export async function assignTeamToGroupAction(
  groupId: string,
  teamId: string,
  tournamentId: string
): Promise<GroupActionResult> {
  await requireAdmin();
  const parsed = assignSchema.safeParse({ groupId, teamId, tournamentId });
  if (!parsed.success) return { ok: false, error: "IDs inválidos" };

  await db.delete(groupTeams).where(eq(groupTeams.teamId, parsed.data.teamId));

  await db.insert(groupTeams).values({
    groupId: parsed.data.groupId,
    teamId: parsed.data.teamId,
  });

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/groups`);
  return { ok: true };
}

export async function removeTeamFromGroupAction(
  teamId: string,
  tournamentId: string
): Promise<GroupActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(teamId).success) {
    return { ok: false, error: "ID inválido" };
  }

  await db.delete(groupTeams).where(eq(groupTeams.teamId, teamId));

  revalidatePath(`/admin/tournaments/${tournamentId}/groups`);
  return { ok: true };
}

const positionSchema = z.object({
  groupId: z.string().uuid(),
  teamId: z.string().uuid(),
  position: z.number().int().min(1).max(4).nullable(),
  tournamentId: z.string().uuid(),
});

export async function setTeamPositionAction(
  groupId: string,
  teamId: string,
  position: number | null,
  tournamentId: string
): Promise<GroupActionResult> {
  await requireAdmin();
  const parsed = positionSchema.safeParse({
    groupId,
    teamId,
    position,
    tournamentId,
  });
  if (!parsed.success) return { ok: false, error: "Inválido" };

  await db
    .update(groupTeams)
    .set({ finalPosition: parsed.data.position })
    .where(
      and(
        eq(groupTeams.groupId, parsed.data.groupId),
        eq(groupTeams.teamId, parsed.data.teamId)
      )
    );

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/groups`);
  return { ok: true };
}
