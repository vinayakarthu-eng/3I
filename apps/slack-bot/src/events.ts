import { system } from "@drillforce/core";

export const logEvent = system.logDrillEvent;

/** Slack message timestamps ("1712345678.123456") → Date. */
export function slackTsToDate(ts: string | undefined) {
  return ts ? new Date(Math.round(Number(ts) * 1000)) : new Date();
}
