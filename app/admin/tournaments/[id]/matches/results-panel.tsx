"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmInvalidationDialog } from "@/components/confirm-invalidation-dialog";
import { setMatchResultsBatchAction } from "@/actions/matches";
import { cn } from "@/lib/utils";

type Team = { id: string; name: string };

export type Result = {
  winnerTeamId: string | null;
  sets: 2 | 3 | null;
};

export type PanelMatchItem =
  | {
      kind: "playable";
      matchId: string;
      teamA: Team;
      teamB: Team;
      initial: Result;
    }
  | { kind: "bye"; key: string; label: string }
  | { kind: "pending"; key: string; label: string };

export type ResultsSection = {
  id: string;
  title: string;
  subtitle?: string;
  editable: boolean;
  items: PanelMatchItem[];
};

function resultEqual(a: Result, b: Result) {
  return a.winnerTeamId === b.winnerTeamId && a.sets === b.sets;
}

export function ResultsPanel({
  tournamentId,
  sections,
}: {
  tournamentId: string;
  sections: ResultsSection[];
}) {
  const initialMap = useMemo(() => {
    const m = new Map<string, Result>();
    for (const s of sections) {
      for (const it of s.items) {
        if (it.kind === "playable") m.set(it.matchId, it.initial);
      }
    }
    return m;
  }, [sections]);

  const editableSet = useMemo(() => {
    const s = new Set<string>();
    for (const sec of sections) {
      if (!sec.editable) continue;
      for (const it of sec.items) {
        if (it.kind === "playable") s.add(it.matchId);
      }
    }
    return s;
  }, [sections]);

  const [values, setValues] = useState<Map<string, Result>>(initialMap);
  const [pendingConfirm, setPendingConfirm] = useState<
    null | { affectedCount: number }
  >(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setValues(new Map(initialMap));
  }, [initialMap]);

  const dirtyIds = useMemo(() => {
    const out: string[] = [];
    for (const [matchId, v] of values) {
      if (!editableSet.has(matchId)) continue;
      const initial = initialMap.get(matchId) ?? { winnerTeamId: null, sets: null };
      if (!resultEqual(v, initial)) out.push(matchId);
    }
    return out;
  }, [values, initialMap, editableSet]);

  useEffect(() => {
    if (dirtyIds.length === 0) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyIds.length]);

  function onWinnerChange(matchId: string, winnerTeamId: string | null) {
    setValues((prev) => {
      const m = new Map(prev);
      const cur = m.get(matchId) ?? { winnerTeamId: null, sets: null };
      m.set(matchId, { ...cur, winnerTeamId });
      return m;
    });
  }

  function onSetsChange(matchId: string, sets: 2 | 3 | null) {
    setValues((prev) => {
      const m = new Map(prev);
      const cur = m.get(matchId) ?? { winnerTeamId: null, sets: null };
      m.set(matchId, { ...cur, sets });
      return m;
    });
  }

  function onClear(matchId: string) {
    setValues((prev) => {
      const m = new Map(prev);
      m.set(matchId, { winnerTeamId: null, sets: null });
      return m;
    });
  }

  function submit(confirm = false) {
    if (dirtyIds.length === 0) return;
    const entries = dirtyIds.map((matchId) => {
      const v = values.get(matchId)!;
      return {
        matchId,
        winnerTeamId: v.winnerTeamId,
        sets: v.sets,
      };
    });

    startTransition(async () => {
      const res = await setMatchResultsBatchAction(
        tournamentId,
        entries,
        confirm
      );
      if (res.ok) {
        toast.success(
          dirtyIds.length === 1
            ? "Resultado guardado"
            : `${dirtyIds.length} resultados guardados`
        );
        setPendingConfirm(null);
        return;
      }
      if ("requiresConfirmation" in res) {
        setPendingConfirm({ affectedCount: res.affectedCount });
        return;
      }
      toast.error(res.error);
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
              ? "resultado sin guardar"
              : "resultados sin guardar"}
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
            <Button size="sm" onClick={() => submit(false)} disabled={pending}>
              {pending ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      )}

      {sections.map((section) => (
        <section key={section.id} className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-medium">{section.title}</h2>
            {section.subtitle && (
              <span className="text-xs text-muted-foreground">
                {section.subtitle}
              </span>
            )}
          </div>
          {section.items.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin partidos.</p>
          )}
          <div className="space-y-2">
            {section.items.map((it) => {
              if (it.kind === "bye") {
                return (
                  <div
                    key={it.key}
                    className="rounded-lg border p-3 text-xs text-muted-foreground"
                  >
                    {it.label}
                  </div>
                );
              }
              if (it.kind === "pending") {
                return (
                  <div
                    key={it.key}
                    className="rounded-lg border p-3 text-xs text-muted-foreground"
                  >
                    {it.label}
                  </div>
                );
              }

              const value = values.get(it.matchId) ?? {
                winnerTeamId: null,
                sets: null,
              };
              const initial = initialMap.get(it.matchId) ?? {
                winnerTeamId: null,
                sets: null,
              };
              const isDirty =
                section.editable && !resultEqual(value, initial);

              return (
                <div
                  key={it.matchId}
                  className={cn(
                    "rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3 transition-colors",
                    isDirty && "border-accent bg-accent/5"
                  )}
                >
                  <div className="text-sm">
                    <span className="font-medium">{it.teamA.name}</span>
                    <span className="text-muted-foreground mx-2">vs</span>
                    <span className="font-medium">{it.teamB.name}</span>
                  </div>
                  {section.editable ? (
                    <div className="flex flex-wrap gap-2 items-center text-sm">
                      <select
                        value={value.winnerTeamId ?? ""}
                        onChange={(e) =>
                          onWinnerChange(it.matchId, e.target.value || null)
                        }
                        disabled={pending}
                        className="h-8 rounded-md border px-2"
                      >
                        <option value="">Ganador</option>
                        <option value={it.teamA.id}>{it.teamA.name}</option>
                        <option value={it.teamB.id}>{it.teamB.name}</option>
                      </select>
                      <select
                        value={value.sets ?? ""}
                        onChange={(e) =>
                          onSetsChange(
                            it.matchId,
                            e.target.value === ""
                              ? null
                              : (parseInt(e.target.value) as 2 | 3)
                          )
                        }
                        disabled={pending || !value.winnerTeamId}
                        className="h-8 rounded-md border px-2"
                      >
                        <option value="">Sets</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                      </select>
                      {(value.winnerTeamId || value.sets) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onClear(it.matchId)}
                          disabled={pending}
                        >
                          Limpiar
                        </Button>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {section.subtitle ?? "No editable"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <ConfirmInvalidationDialog
        open={!!pendingConfirm}
        affectedCount={pendingConfirm?.affectedCount ?? 0}
        onConfirm={() => submit(true)}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
}
