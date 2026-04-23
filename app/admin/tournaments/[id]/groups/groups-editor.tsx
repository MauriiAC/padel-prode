"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  assignTeamToGroupAction,
  createGroupAction,
  deleteGroupAction,
  removeTeamFromGroupAction,
  renameGroupAction,
} from "@/actions/groups";
import { generateGroupMatchesAction } from "@/actions/matches";
import { EditPositionsDialog } from "./edit-positions-dialog";

type Team = { id: string; name: string };
type Group = { id: string; name: string; order: number };
type Assignment = {
  groupId: string;
  teamId: string;
  finalPosition: number | null;
};

export function GroupsEditor({
  tournamentId,
  teams,
  groups,
  assignments,
}: {
  tournamentId: string;
  teams: Team[];
  groups: Group[];
  assignments: Assignment[];
}) {
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const teamsByGroup = useMemo(() => {
    const map = new Map<string, Team[]>();
    for (const g of groups) map.set(g.id, []);
    for (const a of assignments) {
      const t = teams.find((x) => x.id === a.teamId);
      if (!t) continue;
      map.get(a.groupId)?.push(t);
    }
    return map;
  }, [teams, groups, assignments]);

  const positionByPair = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const a of assignments) {
      m.set(`${a.groupId}:${a.teamId}`, a.finalPosition);
    }
    return m;
  }, [assignments]);

  const unassignedTeams = useMemo(() => {
    const assignedIds = new Set(assignments.map((a) => a.teamId));
    return teams.filter((t) => !assignedIds.has(t.id));
  }, [teams, assignments]);

  const [newGroupName, setNewGroupName] = useState("");

  function onCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
    const formData = new FormData();
    formData.set("tournamentId", tournamentId);
    formData.set("name", name);
    startTransition(async () => {
      const res = await createGroupAction(formData);
      if (res.ok) {
        setNewGroupName("");
        toast.success("Zona creada");
      } else if ("error" in res) toast.error(res.error);
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const teamId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;
    if (overId === "unassigned") {
      startTransition(async () => {
        const res = await removeTeamFromGroupAction(teamId, tournamentId);
        if (!res.ok && "error" in res) toast.error(res.error);
      });
    } else {
      startTransition(async () => {
        const res = await assignTeamToGroupAction(overId, teamId, tournamentId);
        if (!res.ok && "error" in res) toast.error(res.error);
      });
    }
  }

  function onDeleteGroup(groupId: string) {
    if (!confirm("¿Borrar la zona?")) return;
    startTransition(async () => {
      const res = await deleteGroupAction(groupId, tournamentId);
      if (!res.ok && "error" in res) toast.error(res.error);
    });
  }

  function onRenameGroup(groupId: string, newName: string) {
    const formData = new FormData();
    formData.set("groupId", groupId);
    formData.set("tournamentId", tournamentId);
    formData.set("name", newName);
    startTransition(async () => {
      const res = await renameGroupAction(formData);
      if (!res.ok && "error" in res) toast.error(res.error);
    });
  }

  function onGenerate() {
    startTransition(async () => {
      const res = await generateGroupMatchesAction(tournamentId);
      if (!res.ok) {
        if ("error" in res) toast.error(res.error);
        return;
      }
      if ("regenerated" in res) {
        const msgs: string[] = [];
        if (res.regenerated.length > 0)
          msgs.push(`${res.regenerated.length} regenerada(s)`);
        if (res.skipped.length > 0)
          msgs.push(`${res.skipped.length} sin cambios`);
        if (res.invalid.length > 0)
          msgs.push(`${res.invalid.length} con cantidad inválida (saltadas)`);
        toast.success(msgs.join(", ") || "Sin zonas para procesar");
      } else {
        toast.success("Partidos generados");
      }
    });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div
        className={`space-y-4 transition-opacity ${pending ? "opacity-70 pointer-events-none" : ""}`}
      >
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <form onSubmit={onCreateGroup} className="flex gap-2 items-center">
            <Input
              placeholder="Nombre de la zona"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="w-48"
              maxLength={40}
            />
            <Button type="submit" disabled={pending || !newGroupName.trim()}>
              + Agregar zona
            </Button>
          </form>
          <div className="flex gap-2">
            <EditPositionsDialog
              tournamentId={tournamentId}
              groups={groups}
              teamsByGroup={teamsByGroup}
              assignments={assignments}
            />
            <Button onClick={onGenerate} disabled={pending}>
              Generar partidos
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {groups.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                teams={teamsByGroup.get(g.id) ?? []}
                positionByTeam={
                  new Map(
                    (teamsByGroup.get(g.id) ?? []).map((t) => [
                      t.id,
                      positionByPair.get(`${g.id}:${t.id}`) ?? null,
                    ])
                  )
                }
                onDelete={() => onDeleteGroup(g.id)}
                onRename={(n) => onRenameGroup(g.id, n)}
              />
            ))}
            {groups.length === 0 && (
              <div className="col-span-full rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Agregá una zona para empezar.
              </div>
            )}
          </div>

          <UnassignedList teams={unassignedTeams} />
        </div>
      </div>
    </DndContext>
  );
}

function GroupCard({
  group,
  teams,
  positionByTeam,
  onDelete,
  onRename,
}: {
  group: Group;
  teams: Team[];
  positionByTeam: Map<string, number | null>;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: group.id });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const count = teams.length;
  const countColor =
    count === 3 || count === 4
      ? "text-primary"
      : count === 0
      ? "text-muted-foreground"
      : "text-destructive";

  const filledPositions = teams.reduce(
    (acc, t) => (positionByTeam.get(t.id) != null ? acc + 1 : acc),
    0
  );
  const positionsComplete = count > 0 && filledPositions === count;

  const sortedTeams = [...teams].sort((a, b) => {
    const pa = positionByTeam.get(a.id);
    const pb = positionByTeam.get(b.id);
    if (pa == null && pb == null) return a.name.localeCompare(b.name);
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pa - pb;
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border p-3 space-y-2 transition ${
        isOver ? "border-primary bg-primary/5" : "bg-card"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        {editing ? (
          <form
            className="flex gap-1 flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && name.trim() !== group.name)
                onRename(name.trim());
              setEditing(false);
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="h-8"
            />
            <Button size="sm" type="submit">
              OK
            </Button>
          </form>
        ) : (
          <>
            <button
              type="button"
              className="font-medium hover:underline text-left"
              onClick={() => setEditing(true)}
            >
              {group.name}
            </button>
            <span className={`text-sm ${countColor}`}>{count}/3-4</span>
          </>
        )}
      </div>
      {count > 0 && (
        <div className="text-xs text-muted-foreground">
          Posiciones:{" "}
          <span
            className={positionsComplete ? "text-primary font-medium" : undefined}
          >
            {filledPositions}/{count}
          </span>
        </div>
      )}
      <div className="space-y-1 min-h-[60px]">
        {sortedTeams.map((t) => (
          <TeamChip
            key={t.id}
            team={t}
            position={positionByTeam.get(t.id) ?? null}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="text-xs text-destructive hover:underline"
      >
        Borrar zona
      </button>
    </div>
  );
}

function UnassignedList({ teams }: { teams: Team[] }) {
  const { isOver, setNodeRef } = useDroppable({ id: "unassigned" });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border p-3 space-y-2 transition ${
        isOver ? "border-primary bg-primary/5" : "bg-muted"
      }`}
    >
      <div className="font-medium text-sm">Sin asignar</div>
      <div className="space-y-1 min-h-[60px]">
        {teams.length === 0 ? (
          <p className="text-xs text-muted-foreground">Todos asignados.</p>
        ) : (
          teams.map((t) => <TeamChip key={t.id} team={t} />)
        )}
      </div>
    </div>
  );
}

function TeamChip({
  team,
  position,
}: {
  team: Team;
  position?: number | null;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: team.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={`px-2 py-1 rounded border bg-background text-sm cursor-grab active:cursor-grabbing flex items-center gap-2 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      {position != null && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
          {position}
        </span>
      )}
      <span>{team.name}</span>
    </div>
  );
}
