"use client";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ConfirmInvalidationDialog({
  open,
  affectedCount,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  affectedCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar cambio</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          Este cambio afecta <strong>{affectedCount}</strong> partido(s) con
          pronósticos ya cargados. Si continuás, los pronósticos de esos
          partidos se borran.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Confirmar y borrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
