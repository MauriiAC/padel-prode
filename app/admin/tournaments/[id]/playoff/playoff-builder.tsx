"use client";

import { useMemo, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  addPlayoffMatchAction,
  completePlayoffRoundsAction,
} from "@/actions/playoff";
import { type SlotResolverCtx, type SlotType } from "@/lib/slot-resolver";
import { MatchCard } from "./match-card";

type Team = { id: string; name: string };
type Group = { id: string; name: string };
type GroupTeam = {
  groupId: string;
  teamId: string;
  finalPosition: number | null;
};
type Round = {
  id: string;
  name: string;
  order: number;
  status: "sin_abrir" | "abierta" | "cerrada";
};
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

export function PlayoffBuilder({
  tournamentId,
  teams,
  groups,
  groupTeams,
  rounds,
  matches,
}: {
  tournamentId: string;
  teams: Team[];
  groups: Group[];
  groupTeams: GroupTeam[];
  rounds: Round[];
  matches: Match[];
}) {
  const [pending, startTransition] = useTransition();

  const ctx: SlotResolverCtx = useMemo(
    () => ({
      teamsById: new Map(teams.map((t) => [t.id, t])),
      groupTeamsByPosition: new Map(
        groupTeams
          .filter((gt) => gt.finalPosition != null)
          .map((gt) => [`${gt.groupId}:${gt.finalPosition}`, gt.teamId])
      ),
      matchesById: new Map(matches.map((m) => [m.id, m])),
    }),
    [teams, groupTeams, matches]
  );

  const groupPositionOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    for (const g of groups) {
      for (let p = 1; p <= 4; p++) {
        out.push({
          value: `${g.id}:${p}`,
          label: `${p}º de ${g.name}`,
        });
      }
    }
    return out;
  }, [groups]);

  const firstRound = rounds[0];
  const canAddMatches = firstRound?.status === "sin_abrir";
  const hasSubsequentRounds = rounds.length > 1;

  const matchesByRound = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const r of rounds) map.set(r.id, []);
    for (const m of matches) {
      const arr = map.get(m.roundId) ?? [];
      arr.push(m);
      map.set(m.roundId, arr);
    }
    return map;
  }, [rounds, matches]);

  function onAddMatch() {
    if (!firstRound) return;
    startTransition(async () => {
      const res = await addPlayoffMatchAction(firstRound.id, tournamentId);
      if (!res.ok) toast.error(res.error);
    });
  }

  function onCompleteRounds() {
    startTransition(async () => {
      const res = await completePlayoffRoundsAction(tournamentId);
      if (res.ok) toast.success("Rondas generadas");
      else toast.error(res.error);
    });
  }

  if (!firstRound) {
    return (
      <p className="text-sm text-muted-foreground">
        Cargando primera ronda...
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <h2 className="text-lg font-medium">Playoff</h2>
        <div className="flex gap-2">
          {canAddMatches && (
            <Button onClick={onAddMatch} disabled={pending}>
              + Agregar partido (primera ronda)
            </Button>
          )}
          {!hasSubsequentRounds && (
            <Button
              variant="outline"
              onClick={onCompleteRounds}
              disabled={pending}
            >
              Completar rondas
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-6 overflow-x-auto pb-2">
        {rounds.map((round) => {
          const isFirst = round.order === firstRound.order;
          const roundMatches = (matchesByRound.get(round.id) ?? []).sort(
            (a, b) => a.order - b.order
          );
          return (
            <section
              key={round.id}
              className="min-w-[240px] space-y-3 flex-shrink-0"
            >
              <div>
                <h3 className="font-medium">{round.name}</h3>
                <p className="text-xs text-muted-foreground">
                  Estado: {round.status}
                </p>
              </div>
              <div className="space-y-3">
                {roundMatches.map((m) => (
                  <MatchCard
                    key={m.id}
                    tournamentId={tournamentId}
                    match={m}
                    editable={isFirst && round.status === "sin_abrir"}
                    groupPositionOptions={groupPositionOptions}
                    ctx={ctx}
                  />
                ))}
                {roundMatches.length === 0 && (
                  <p className="text-xs text-muted-foreground">Sin partidos.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
