"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  CRITERIA_TYPE_LABELS,
  DRILL_TEMPLATES,
  DRILL_TYPE_LABELS,
  SECTOR_LABELS,
  type DrillTemplate,
} from "@drillforce/shared";
import { LayoutTemplate } from "lucide-react";
import { useState } from "react";

export function TemplateDialog({ onSelect }: { onSelect: (template: DrillTemplate) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <LayoutTemplate className="h-4 w-4" />
          Use Template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start from a template</DialogTitle>
          <DialogDescription>
            Templates pre-fill the drill details and objectives. You can edit everything afterwards.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {DRILL_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onSelect(t);
                setOpen(false);
              }}
              className="rounded-lg border p-4 text-left transition-colors hover:border-foreground/30 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{t.name}</span>
                <Badge variant="outline">{DRILL_TYPE_LABELS[t.type]}</Badge>
                <Badge variant="secondary">
                  {t.sector === "general" ? "General" : SECTOR_LABELS[t.sector]}
                </Badge>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">{t.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t.objectives.length} objectives ·{" "}
                {[...new Set(t.objectives.map((o) => CRITERIA_TYPE_LABELS[o.criteriaType]))].join(", ")}
              </p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
