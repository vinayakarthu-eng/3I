"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";

/** Editable list of strings (checklist items, stakeholders, …). */
export function StringListInput({
  items,
  onChange,
  placeholder,
  addLabel,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  addLabel: string;
}) {
  const list = items.length ? items : [""];
  return (
    <div className="space-y-2">
      {list.map((item, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={item}
            placeholder={placeholder}
            onChange={(e) => onChange(list.map((v, j) => (j === i ? e.target.value : v)))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onChange([...list, ""]);
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove item"
            disabled={list.length === 1}
            onClick={() => onChange(list.filter((_, j) => j !== i))}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...list, ""])}>
        <Plus className="h-4 w-4" />
        {addLabel}
      </Button>
    </div>
  );
}
