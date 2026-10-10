import assert from "node:assert/strict";
import { test } from "node:test";
import type { DrillEvent } from "@drillforce/db";
import { scoreCompleteness, scoreCoordination, scoreQuality, scoreTimeToAction } from "./scoring";

const start = new Date("2026-01-01T10:00:00Z");
let n = 0;
const ev = (minute: number, eventType: DrillEvent["eventType"], actor: string, text: string): DrillEvent => ({
  id: `e${++n}`,
  drillId: "d",
  eventType,
  actor,
  channel: null,
  payload: { text },
  occurredAt: new Date(start.getTime() + minute * 60000),
});

const responders = new Set(["sam"]);

test("time-to-action within target scores 100", () => {
  const r = scoreTimeToAction(
    [ev(0, "inject", "bot", "DB down"), ev(3, "message", "sam", "on it")],
    { max_minutes: 5 },
    { responderIds: responders, startedAt: start },
  );
  assert.equal(r.normalizedScore, 100);
  assert.equal(r.rawValue, 3);
});

test("time-to-action between 1x and 2x target scales 99→50", () => {
  const at = (m: number) =>
    scoreTimeToAction([ev(0, "inject", "bot", "x"), ev(m, "message", "sam", "y")], { max_minutes: 5 }, {
      responderIds: responders,
      startedAt: start,
    }).normalizedScore;
  assert.equal(at(10), 50);
  assert.ok(at(7.5) > 70 && at(7.5) < 80);
});

test("time-to-action beyond 2x target scales 49→0", () => {
  const r = scoreTimeToAction([ev(0, "inject", "bot", "x"), ev(20, "message", "sam", "y")], { max_minutes: 5 }, {
    responderIds: responders,
    startedAt: start,
  });
  assert.equal(r.normalizedScore, 0);
});

test("time-to-action ignores bots and non-responders", () => {
  const r = scoreTimeToAction(
    [ev(0, "inject", "bot", "x"), ev(1, "message", "bot", "status?"), ev(2, "message", "observer", "hm"), ev(4, "action", "sam", "ack")],
    { max_minutes: 5 },
    { responderIds: responders, startedAt: start },
  );
  assert.equal(r.rawValue, 4);
});

test("completeness fuzzy-matches checklist items", () => {
  const r = scoreCompleteness(
    [
      ev(1, "message", "sam", "Confirmed the primary is down"),
      ev(2, "message", "sam", "Promoting the replica now"),
      ev(3, "message", "bot", "verify writes please"),
    ],
    { checklist: ["Confirm primary down", "Promote replica", "Verify writes"] },
    { startedAt: start },
  );
  assert.equal(r.rawValue, 2);
  assert.equal(r.normalizedScore, 66.7);
  assert.deepEqual((r.evidence.missing as string[]), ["Verify writes"]);
});

test("coordination matches stakeholder names as phrases", () => {
  const r = scoreCoordination(
    [ev(1, "message", "sam", "Pinging the support lead and <@U9>")],
    { stakeholders: ["Support Lead", "Engineering Lead", "VP Engineering"] },
    { startedAt: start, mentionNames: new Map([["U9", "VP Engineering"]]) },
  );
  assert.equal(r.rawValue, 2);
  assert.deepEqual(r.evidence.notContacted, ["Engineering Lead"]);
});

test("quality normalizes ratings by scale", () => {
  const r = scoreQuality([
    { dimension: "Clarity", rating: 4, scale: 5 },
    { dimension: "Timeliness", rating: 3, scale: 5 },
  ]);
  assert.equal(r.normalizedScore, 70);
});
