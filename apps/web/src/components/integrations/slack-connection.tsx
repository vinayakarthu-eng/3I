"use client";

import { disconnectSlackAction } from "@/app/settings/integrations/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { formatDate } from "@/lib/format";
import { Loader2, Unplug } from "lucide-react";

export type SlackConnectionView =
  | { connected: false; installReady: boolean; missingConfig: string[] }
  | {
      connected: true;
      teamName: string;
      installedAt: Date | string;
      installedBy: string | null;
      missingScopes: string[];
    };

/** Slack card body: "Add to Slack" for this org, or the connected workspace with Disconnect. */
export function SlackConnection({ slack }: { slack: SlackConnectionView }) {
  const disconnect = useAction();

  if (!slack.connected) {
    if (!slack.installReady) {
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Slack install isn&apos;t configured on this server. Set{" "}
            {slack.missingConfig.map((name, i) => (
              <span key={name}>
                {i > 0 && ", "}
                <code className="font-mono">{name}</code>
              </span>
            ))}{" "}
            (see the Slack bot README).
          </p>
          <Button variant="outline" size="sm" className="w-full" disabled>
            Add to Slack
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Connect your workspace to run drills with the IC bot.</p>
        <Button asChild size="sm" className="w-full">
          {/* A plain link: the route redirects to slack.com. */}
          <a href="/api/slack/install">Add to Slack</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{slack.teamName}</span> · connected {formatDate(slack.installedAt)}
        {slack.installedBy ? ` by ${slack.installedBy}` : ""}
      </p>
      {slack.missingScopes.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Missing permissions ({slack.missingScopes.join(", ")}). Reconnect to grant them.
        </p>
      )}
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" className="flex-1">
          <a href="/api/slack/install">Reconnect</a>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="flex-1 hover:text-destructive" disabled={disconnect.pending}>
              {disconnect.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
              Disconnect
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect {slack.teamName}?</AlertDialogTitle>
              <AlertDialogDescription>
                The IC bot stops responding in this workspace and its token is revoked. Drills already recorded are kept.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => disconnect.run(() => disconnectSlackAction(), { success: "Slack disconnected" })}
              >
                Disconnect
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
