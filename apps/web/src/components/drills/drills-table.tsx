"use client";

import { DrillStatusBadge, DrillTypeBadge } from "@/components/drills/drill-badges";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatScore, scoreColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  DRILL_STATUS_LABELS,
  DRILL_STATUSES,
  DRILL_TYPE_LABELS,
  DRILL_TYPES,
  type DrillStatus,
  type DrillType,
} from "@drillforce/shared";
import { Eye, MoreHorizontal, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export interface DrillRow {
  id: string;
  name: string;
  type: DrillType;
  status: DrillStatus;
  scheduledAt: Date | string | null;
  score: number | null;
}

export function DrillsTable({
  drills,
  filterable = false,
}: {
  drills: DrillRow[];
  filterable?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | DrillStatus>("all");
  const [type, setType] = useState<"all" | DrillType>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return drills.filter(
      (d) =>
        (!q || d.name.toLowerCase().includes(q)) &&
        (status === "all" || d.status === status) &&
        (type === "all" || d.type === type),
    );
  }, [drills, query, status, type]);

  return (
    <div className="space-y-4">
      {filterable && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search drills by name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="sm:w-44" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {DRILL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {DRILL_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger className="sm:w-40" aria-label="Filter by type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {DRILL_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {DRILL_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Scheduled</TableHead>
              <TableHead className="text-right">Score</TableHead>
              {filterable && <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={filterable ? 6 : 5} className="h-24 text-center text-muted-foreground">
                  {drills.length === 0 ? "No drills yet." : "No drills match your filters."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((d) => (
                <TableRow
                  key={d.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/drills/${d.id}`)}
                >
                  <TableCell className="font-medium">
                    <Link
                      href={`/drills/${d.id}`}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {d.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <DrillTypeBadge type={d.type} />
                  </TableCell>
                  <TableCell>
                    <DrillStatusBadge status={d.status} />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {formatDate(d.scheduledAt)}
                  </TableCell>
                  <TableCell className={cn("text-right font-medium tabular-nums", scoreColor(d.score))}>
                    {formatScore(d.score)}
                  </TableCell>
                  {filterable && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Drill actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/drills/${d.id}`}>
                              <Eye className="h-4 w-4" />
                              View details
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
