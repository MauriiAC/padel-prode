"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { setGroupPositionsAction } from "@/actions/groups";
import { ConfirmInvalidationDialog } from "@/components/confirm-invalidation-dialog";

type Team = { id: string; name: string };
type Group = { id: string; name: string; order: number };
type Assignment = {
  groupId: string;
  teamId: string;
  finalPosition: number | null;
};

type PositionEntry = {
  groupId: string;
  teamId: string;
  finalPosition: number | null;
};

export function EditPositionsDialog({
  tournamentId,
  groups,
  teamsByGroup,
  assignments,
}: {
  tournamentId: string;
  groups: Group[];
  teamsByGroup: Map<string, Team[]>;
  assignments: Assignment[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [pendingConfirm, setPendingConfirm] = useState<
    null | { affectedCount: number }
  >(null);

  // Key: `${groupId}:${teamId}` → position (null or number) OR raw string if invalid.
  const initialMap = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const a of assignments) {
      m.set(`${a.groupId}:${a.teamId}`, a.finalPosition);
    }
    return m;
  }, [assignments]);

  const [values, setValues] = useState<Map<string, number | null>>(
    new Map(initialMap)
  );

  // When the dialog re-opens, re-seed local state from current assignments.
  useEffect(() => {
    if (open) setValues(new Map(initialMap));
  }, [open, initialMap]);

  function setValue(groupId: string, teamId: string, raw: string) {
    const key = `${groupId}:${teamId}`;
    if (raw === "") {
      setValues((prev) => {
        const next = new Map(prev);
        next.set(key, null);
        return next;
      });
      return;
    }
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed < 1) return;
    setValues((prev) => {
      const next = new Map(prev);
      next.set(key, parsed);
      return next;
    });
  }

  function validate(): { ok: true } | { ok: false; error: string } {
    for (const g of groups) {
      const teams = teamsByGroup.get(g.id) ?? [];
      const n = teams.length;
      const seen = new Set<number>();
      for (const t of teams) {
        const v = values.get(`${g.id}:${t.id}`) ?? null;
        if (v == null) continue;
        if (v < 1 || v > n) {
          return {
            ok: false,
            error: `${g.name}: las posiciones deben ser entre 1 y ${n}`,
          };
        }
        if (seen.has(v)) {
          return {
            ok: false,
            error: `${g.name}: la posición ${v} está repetida`,
          };
        }
        seen.add(v);
      }
    }
    return { ok: true };
  }

  function diffFromInitial(): PositionEntry[] {
    const entries: PositionEntry[] = [];
    for (const g of groups) {
      const teams = teamsByGroup.get(g.id) ?? [];
      let groupChanged = false;
      for (const t of teams) {
        const key = `${g.id}:${t.id}`;
        const current = values.get(key) ?? null;
        const initial = initialMap.get(key) ?? null;
        if (current !== initial) {
          groupChanged = true;
          break;
        }
      }
      if (!groupChanged) continue;
      // Send ALL positions for the group (the action replaces group positions
      // atomically; sending partial entries would leave stale values).
      for (const t of teams) {
        const key = `${g.id}:${t.id}`;
        entries.push({
          groupId: g.id,
          teamId: t.id,
          finalPosition: values.get(key) ?? null,
        });
      }
    }
    return entries;
  }

  function save(confirm = false) {
    const validation = validate();
    if (!validation.ok) {
      toast.error(validation.error);
      return;
    }
    const entries = diffFromInitial();
    if (entries.length === 0) {
      toast.info("Sin cambios");
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const res = await setGroupPositionsAction(tournamentId, entries, confirm);
      if (res.ok) {
        toast.success("Posiciones actualizadas");
        setPendingConfirm(null);
        setOpen(false);
        return;
      }
      if ("requiresConfirmation" in res) {
        setPendingConfirm({ affectedCount: res.affectedCount });
        return;
      }
      toast.error(res.error);
    });
  }

  function confirmInvalidation() {
    save(true);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">Editar posiciones</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Posiciones finales por zona</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {groups.map((g) => {
              const teams = teamsByGroup.get(g.id) ?? [];
              const n = teams.length;
              return (
                <div key={g.id} className="space-y-2">
                  <div className="font-medium">
                    {g.name}{" "}
                    <span className="text-xs text-muted-foreground">
                      (1–{n})
                    </span>
                  </div>
                  <div className="space-y-1">
                    {teams.map((t) => {
                      const key = `${g.id}:${t.id}`;
                      const value = values.get(key);
                      return (
                        <div
                          key={t.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <span>{t.name}</span>
                          <input
                            type="number"
                            min={1}
                            max={n}
                            value={value ?? ""}
                            onChange={(e) => setValue(g.id, t.id, e.target.value)}
                            disabled={pending}
                            className="w-16 h-8 rounded-md border px-2 text-sm"
                            placeholder="?"
                          />
                        </div>
                      );
                    })}
                    {teams.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Sin equipos
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button onClick={() => save(false)} disabled={pending}>
              {pending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmInvalidationDialog
        open={!!pendingConfirm}
        affectedCount={pendingConfirm?.affectedCount ?? 0}
        onConfirm={confirmInvalidation}
        onCancel={() => setPendingConfirm(null)}
      />
    </>
  );
}
