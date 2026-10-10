"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Click-to-edit text. Enter saves (Cmd/Ctrl+Enter for multiline), Escape cancels. */
export function InlineEdit({
  value,
  onSave,
  multiline = false,
  pending = false,
  placeholder,
  ariaLabel,
  className,
  display,
}: {
  value: string;
  onSave: (value: string) => void;
  multiline?: boolean;
  pending?: boolean;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  display?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  const save = () => {
    if (draft.trim() !== value.trim()) onSave(draft);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${ariaLabel}`}
        className={cn(
          "group -mx-2 flex w-full items-start gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <span className="min-w-0 flex-1">{display ?? (value || <span className="text-muted-foreground">{placeholder}</span>)}</span>
        {pending ? (
          <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Pencil className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </button>
    );
  }

  const Field = multiline ? Textarea : Input;
  return (
    <div className="flex items-start gap-2">
      <Field
        ref={ref}
        value={draft}
        aria-label={ariaLabel}
        placeholder={placeholder}
        rows={multiline ? 5 : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save();
          }
        }}
        className={className}
      />
      <Button type="button" size="icon" variant="ghost" onClick={save} aria-label="Save">
        <Check className="h-4 w-4" />
      </Button>
      <Button type="button" size="icon" variant="ghost" onClick={cancel} aria-label="Cancel">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
