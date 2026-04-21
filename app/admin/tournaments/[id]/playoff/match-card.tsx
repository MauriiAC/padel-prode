"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  deletePlayoffMatchAction,
  updatePlayoffSlotAction,
} from "@/actions/playoff";
import {
  resolveSlot,
  type SlotResolverCtx,
  type SlotType,
} from "@/lib/slot-resolver";

type Match = {
  id: string;
  roundId: string;
  order: number;
  slotAType: SlotType;
  slotARef: string | null;
  slotBType: SlotType;
  slotBRef: string | null;
  resultWinnerTeamId: string | null;
};

export function MatchCard({
  tournamentId,
  match,
  editable,
  groupPositionOptions,
  ctx,
}: {
  tournamentId: string;
  match: Match;
  editable: boolean;
  groupPositionOptions: { value: string; label: string }[];
  ctx: SlotResolverCtx;
}) {
  const [pending, startTransition] = useTransition();

  const slotA = resolveSlot(
    { type: match.slotAType, ref: match.slotARef },
    ctx
  );
  const slotB = resolveSlot(
    { type: match.slotBType, ref: match.slotBRef },
    ctx
  );

  function onSlotChange(side: "a" | "b", value: string) {
    const slotType = value === "bye" ? "bye" : "group_position";
    const slotRef = value === "bye" ? null : value || null;
    startTransition(async () => {
      const res = await updatePlayoffSlotAction(
        match.id,
        side,
        slotType,
        slotRef,
        tournamentId
      );
      if (!res.ok) toast.error(res.error);
    });
  }

  function onDelete() {
    if (!confirm("¿Borrar partido?")) return;
    startTransition(async () => {
      const res = await deletePlayoffMatchAction(match.id, tournamentId);
      if (!res.ok) toast.error(res.error);
    });
  }

  function SlotEditor({
    side,
    type,
    refValue,
  }: {
    side: "a" | "b";
    type: SlotType;
    refValue: string | null;
  }) {
    const currentValue =
      type === "bye" ? "bye" : type === "group_position" ? refValue ?? "" : "";

    return (
      <select
        value={currentValue}
        onChange={(e) => onSlotChange(side, e.target.value)}
        disabled={pending}
        className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="">— elegir —</option>
        <option value="bye">Bye</option>
        {groupPositionOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  function SlotDisplay({
    isBye,
    team,
  }: {
    isBye: boolean;
    team: { name: string } | null;
    isPending: boolean;
  }) {
    if (isBye) return <span className="italic text-muted-foreground">bye</span>;
    if (team) return <span className="font-medium">{team.name}</span>;
    return <span className="text-muted-foreground">Pendiente</span>;
  }

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2 text-sm">
      <div className="space-y-1">
        {editable ? (
          <SlotEditor
            side="a"
            type={match.slotAType}
            refValue={match.slotARef}
          />
        ) : (
          <SlotDisplay {...slotA} />
        )}
        <span className="block text-xs text-muted-foreground text-center">
          vs
        </span>
        {editable ? (
          <SlotEditor
            side="b"
            type={match.slotBType}
            refValue={match.slotBRef}
          />
        ) : (
          <SlotDisplay {...slotB} />
        )}
      </div>

      {match.resultWinnerTeamId && (
        <div className="text-xs text-muted-foreground">
          Ganador: {ctx.teamsById.get(match.resultWinnerTeamId)?.name ?? "?"}
        </div>
      )}

      {editable && (
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-destructive hover:underline"
          disabled={pending}
        >
          Borrar
        </button>
      )}
    </div>
  );
}
