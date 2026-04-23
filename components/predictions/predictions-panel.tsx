"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  MatchPrediction,
  type PredictionValue,
} from "./match-prediction";
import { upsertPredictionsBatchAction } from "@/actions/predictions";

type Team = { id: string; name: string };

export type PanelItem =
  | {
      kind: "playable";
      matchId: string;
      teamA: Team;
      teamB: Team;
      resultWinnerId: string | null;
      resultSets: 2 | 3 | null;
      initialPrediction: PredictionValue | null;
    }
  | {
      kind: "pending";
      key: string;
      label?: string;
    };

export type PanelSection = {
  id: string;
  title: string;
  subtitle?: string;
  locked: boolean;
  items: PanelItem[];
};

function predEqual(a: PredictionValue | null, b: PredictionValue | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.winnerTeamId === b.winnerTeamId && a.sets === b.sets;
}

export function PredictionsPanel({
  tournamentId,
  sections,
}: {
  tournamentId: string;
  sections: PanelSection[];
}) {
  const initialMap = useMemo(() => {
    const m = new Map<string, PredictionValue | null>();
    for (const s of sections) {
      for (const it of s.items) {
        if (it.kind === "playable") m.set(it.matchId, it.initialPrediction);
      }
    }
    return m;
  }, [sections]);

  // Which matches are locked (in a non-abierta section). We still render them
  // but they can't be changed.
  const lockedSet = useMemo(() => {
    const s = new Set<string>();
    for (const sec of sections) {
      if (!sec.locked) continue;
      for (const it of sec.items) {
        if (it.kind === "playable") s.add(it.matchId);
      }
    }
    return s;
  }, [sections]);

  const [values, setValues] =
    useState<Map<string, PredictionValue | null>>(initialMap);

  // Re-seed local state when the server-rendered initialMap changes (e.g.
  // after a save + revalidate round-trip).
  useEffect(() => {
    setValues(new Map(initialMap));
  }, [initialMap]);

  const dirtyIds = useMemo(() => {
    const out: string[] = [];
    for (const [matchId, v] of values) {
      if (lockedSet.has(matchId)) continue;
      const initial = initialMap.get(matchId) ?? null;
      if (!predEqual(v, initial)) out.push(matchId);
    }
    return out;
  }, [values, initialMap, lockedSet]);

  const [pending, startTransition] = useTransition();

  // Warn on tab close / refresh when there are unsaved changes.
  useEffect(() => {
    if (dirtyIds.length === 0) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyIds.length]);

  function onMatchChange(matchId: string, next: PredictionValue) {
    setValues((prev) => {
      const m = new Map(prev);
      m.set(matchId, next);
      return m;
    });
  }

  function onSave() {
    if (dirtyIds.length === 0) return;
    const items = dirtyIds
      .map((matchId) => {
        const v = values.get(matchId);
        if (!v) return null;
        return { matchId, winnerTeamId: v.winnerTeamId, sets: v.sets };
      })
      .filter(
        (x): x is { matchId: string; winnerTeamId: string; sets: 2 | 3 } =>
          x !== null
      );

    if (items.length === 0) return;

    startTransition(async () => {
      const res = await upsertPredictionsBatchAction(tournamentId, items);
      if (res.ok) {
        toast.success(
          res.saved === 1
            ? "Pronóstico guardado"
            : `${res.saved} pronósticos guardados`
        );
      } else {
        toast.error(res.error);
      }
    });
  }

  function onDiscard() {
    setValues(new Map(initialMap));
  }

  return (
    <div className="space-y-6">
      {dirtyIds.length > 0 && (
        <div className="sticky top-14 z-[5] -mx-4 px-4 py-2 border-b bg-accent/10 backdrop-blur flex items-center justify-between gap-2">
          <span className="text-sm">
            <strong>{dirtyIds.length}</strong>{" "}
            {dirtyIds.length === 1
              ? "cambio sin guardar"
              : "cambios sin guardar"}
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onDiscard}
              disabled={pending}
            >
              Descartar
            </Button>
            <Button size="sm" onClick={onSave} disabled={pending}>
              {pending ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      )}

      {sections.map((section) => (
        <section key={section.id} className="space-y-2">
          <div>
            <h2 className="text-base font-semibold">{section.title}</h2>
            {section.subtitle && (
              <p className="text-xs text-muted-foreground">{section.subtitle}</p>
            )}
          </div>
          {section.items.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin partidos.</p>
          )}
          <div className="space-y-2">
            {section.items.map((it) => {
              if (it.kind === "pending") {
                return (
                  <div
                    key={it.key}
                    className="rounded-lg border p-3 text-xs text-muted-foreground"
                  >
                    {it.label ?? "Partido pendiente"}
                  </div>
                );
              }
              const initial = initialMap.get(it.matchId) ?? null;
              const current = values.get(it.matchId) ?? null;
              return (
                <MatchPrediction
                  key={it.matchId}
                  matchId={it.matchId}
                  teamA={it.teamA}
                  teamB={it.teamB}
                  resultWinnerId={it.resultWinnerId}
                  resultSets={it.resultSets}
                  value={current}
                  onChange={(next) => onMatchChange(it.matchId, next)}
                  locked={section.locked}
                  dirty={!section.locked && !predEqual(current, initial)}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
