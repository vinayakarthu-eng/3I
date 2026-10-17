"use client";

import { COMPETENCY_COLORS } from "@/components/readiness/skill-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DrillTemplateRow } from "@drillforce/core";
import {
  COMPETENCY_AREAS,
  CRITERIA_TYPE_LABELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  DRILL_TYPE_LABELS,
  DRILL_TYPES,
  SECTOR_LABELS,
  SECTORS,
  type CriteriaType,
  type Difficulty,
} from "@drillforce/shared";
import { Clock, Search, Zap } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const COMP_COLOR = new Map(COMPETENCY_AREAS.map((c, i) => [c.name, COMPETENCY_COLORS[i]]));

function sectorLabel(sector: string) {
  return sector === "general" ? "General" : (SECTOR_LABELS[sector as keyof typeof SECTOR_LABELS] ?? sector);
}

const DIFFICULTY_BADGE: Record<Difficulty, string> = {
  beginner: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  intermediate: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  advanced: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
};

const ALL = "all";

export function ScenarioLibrary({ templates }: { templates: DrillTemplateRow[] }) {
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState<string>(ALL);
  const [type, setType] = useState<string>(ALL);
  const [difficulty, setDifficulty] = useState<string>(ALL);
  const [competency, setCompetency] = useState<string>(ALL);
  const [duration, setDuration] = useState<string>(ALL);
  const [active, setActive] = useState<DrillTemplateRow | null>(null);

  const filterFn = (t: DrillTemplateRow) => {
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.description.toLowerCase().includes(search.toLowerCase()))
      return false;
    if (sector !== ALL && t.sector !== sector) return false;
    if (type !== ALL && t.type !== type) return false;
    if (difficulty !== ALL && t.difficulty !== difficulty) return false;
    if (competency !== ALL && !t.competencyAreasTested.includes(competency)) return false;
    if (duration !== ALL) {
      const d = t.estimatedDurationMinutes;
      if (duration === "short" && d > 20) return false;
      if (duration === "medium" && (d <= 20 || d > 45)) return false;
      if (duration === "long" && d <= 45) return false;
    }
    return true;
  };

  const scenarios = useMemo(
    () => templates.filter((t) => !t.isQuickDrill).filter(filterFn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templates, search, sector, type, difficulty, competency, duration],
  );
  const quickDrills = useMemo(
    () => templates.filter((t) => t.isQuickDrill).filter(filterFn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templates, search, sector, type, difficulty, competency, duration],
  );

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search scenarios…"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <FilterSelect value={sector} onChange={setSector} placeholder="Sector"
            options={[["general", "General"], ...SECTORS.map((s) => [s, SECTOR_LABELS[s]] as [string, string])]} />
          <FilterSelect value={type} onChange={setType} placeholder="Type"
            options={DRILL_TYPES.map((t) => [t, DRILL_TYPE_LABELS[t]] as [string, string])} />
          <FilterSelect value={difficulty} onChange={setDifficulty} placeholder="Difficulty"
            options={DIFFICULTIES.map((d) => [d, DIFFICULTY_LABELS[d]] as [string, string])} />
          <FilterSelect value={competency} onChange={setCompetency} placeholder="Competency"
            options={COMPETENCY_AREAS.map((c) => [c.name, c.name] as [string, string])} />
          <FilterSelect value={duration} onChange={setDuration} placeholder="Duration"
            options={[["short", "≤ 20 min"], ["medium", "21–45 min"], ["long", "> 45 min"]]} />
        </div>
      </div>

      <Tabs defaultValue="library">
        <TabsList>
          <TabsTrigger value="library">Scenario Library ({scenarios.length})</TabsTrigger>
          <TabsTrigger value="quick">Quick Drills ({quickDrills.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="library" className="mt-4">
          <Grid items={scenarios} onOpen={setActive} />
        </TabsContent>
        <TabsContent value="quick" className="mt-4">
          <Grid items={quickDrills} onOpen={setActive} />
        </TabsContent>
      </Tabs>

      <ScenarioDetail template={active} onClose={() => setActive(null)} />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: [string, string][];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}: All</SelectItem>
        {options.map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Grid({ items, onOpen }: { items: DrillTemplateRow[]; onOpen: (t: DrillTemplateRow) => void }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
        No scenarios match your filters.
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((t) => (
        <Card key={t.id} className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base leading-snug">{t.name}</CardTitle>
              {t.isQuickDrill && <Zap className="h-4 w-4 shrink-0 text-amber-500" />}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Badge variant="secondary">{sectorLabel(t.sector)}</Badge>
              <Badge variant="outline">{DRILL_TYPE_LABELS[t.type]}</Badge>
              <Badge className={`border-transparent ${DIFFICULTY_BADGE[t.difficulty]}`}>
                {DIFFICULTY_LABELS[t.difficulty]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            <p className="line-clamp-3 text-sm text-muted-foreground">{t.description}</p>
            <div className="mt-auto space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {t.estimatedDurationMinutes} min
                </span>
                <CompetencyDots names={t.competencyAreasTested} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => onOpen(t)}>
                  Details
                </Button>
                <Button asChild size="sm" className="flex-1">
                  <Link href={`/drills/new?template=${t.id}`}>Use Template</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CompetencyDots({ names }: { names: string[] }) {
  return (
    <span className="flex items-center gap-1" title={names.join(", ")}>
      {names.map((n) => (
        <span
          key={n}
          className="h-2 w-2 rounded-full"
          style={{ background: COMP_COLOR.get(n) ?? "hsl(var(--muted-foreground))" }}
        />
      ))}
    </span>
  );
}

function ScenarioDetail({
  template,
  onClose,
}: {
  template: DrillTemplateRow | null;
  onClose: () => void;
}) {
  if (!template) return null;
  const injects = template.scenario?.injects ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template.name}</DialogTitle>
          <DialogDescription>{template.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{sectorLabel(template.sector)}</Badge>
            <Badge variant="outline">{DRILL_TYPE_LABELS[template.type]}</Badge>
            <Badge className={`border-transparent ${DIFFICULTY_BADGE[template.difficulty]}`}>
              {DIFFICULTY_LABELS[template.difficulty]}
            </Badge>
            <Badge variant="outline">{template.estimatedDurationMinutes} min</Badge>
          </div>

          {template.scenario?.summary && (
            <section>
              <h4 className="mb-1 font-medium">Scenario</h4>
              <p className="text-muted-foreground">{template.scenario.summary}</p>
            </section>
          )}

          <section>
            <h4 className="mb-2 font-medium">Objectives ({template.objectives.length})</h4>
            <ul className="space-y-1.5">
              {template.objectives.map((o, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Badge variant="outline" className="mt-0.5 shrink-0 text-[10px]">
                    {CRITERIA_TYPE_LABELS[o.criteriaType as CriteriaType]}
                  </Badge>
                  <span>{o.description}</span>
                </li>
              ))}
            </ul>
          </section>

          {injects.length > 0 && (
            <section>
              <h4 className="mb-2 font-medium">Injects ({injects.length})</h4>
              <ul className="space-y-1">
                {injects.map((inj, i) => (
                  <li key={i} className="flex gap-2 text-muted-foreground">
                    <span className="font-mono text-xs">T+{inj.at_minute}m</span>
                    {inj.description}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h4 className="mb-2 font-medium">Competencies tested</h4>
            <div className="flex flex-wrap gap-1.5">
              {template.competencyAreasTested.map((c) => (
                <Badge key={c} variant="secondary">
                  {c}
                </Badge>
              ))}
            </div>
          </section>

          {template.basedOn && <p className="text-xs italic text-muted-foreground">{template.basedOn}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button asChild>
            <Link href={`/drills/new?template=${template.id}`}>Use Template</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
