import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

// Next.js caches server-side fetch() — POSTs included — on disk unless told not to. For core's
// outbound calls (OAuth token exchange, token revoke, webhook deliveries) that would persist
// secrets in plain text and replay stale responses, so every fetch must say cache: "no-store".
test('every fetch() in core opts out of caching', () => {
  const offenders: string[] = [];
  for (const name of readdirSync(here)) {
    if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
    const src = readFileSync(join(here, name), "utf8");
    for (const m of src.matchAll(/\bfetch\(/g)) {
      const call = src.slice(m.index, src.indexOf(");", m.index) + 2);
      if (!/cache:\s*"no-store"/.test(call)) offenders.push(`${name}:${src.slice(0, m.index).split("\n").length}`);
    }
  }
  assert.deepEqual(offenders, []);
});
