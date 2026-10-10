"use client";

import type { ActionResult } from "@/app/drills/actions";
import { useToast } from "@/hooks/use-toast";
import { useTransition } from "react";

/**
 * Runs a server action inside a transition and surfaces failures as a toast.
 * Server actions call revalidatePath, so the page data refreshes on success.
 */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function run<T>(
    action: () => Promise<ActionResult<T>>,
    opts: { success?: string; onSuccess?: (data: T) => void; onError?: (error: string) => void } = {},
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast({ variant: "destructive", title: "Something went wrong", description: result.error });
        opts.onError?.(result.error);
        return;
      }
      if (opts.success) toast({ title: opts.success });
      opts.onSuccess?.(result.data);
    });
  }

  return { pending, run };
}
