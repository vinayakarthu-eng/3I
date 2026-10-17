import { ENDPOINTS, openApiDocument } from "@drillforce/core";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";

// Every route handler must be described in core's ENDPOINTS table (and vice versa), so the
// OpenAPI document and discovery endpoint can't drift from what the API actually serves.
const ROOT = join(__dirname, "..");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name.startsWith("_") ? [] : routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

function served() {
  const out = new Set<string>();
  for (const file of routeFiles(ROOT)) {
    const dir = relative(ROOT, file).split(sep).slice(0, -1);
    const path = "/" + dir.map((s) => s.replace(/^\[(\w+)\]$/, "{$1}")).join("/");
    for (const m of readFileSync(file, "utf8").matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)) {
      out.add(`${m[1]} ${path}`);
    }
  }
  return out;
}

test("ENDPOINTS matches the route handlers", () => {
  const documented = new Set(ENDPOINTS.map((e) => `${e.method} ${e.path}`));
  const actual = served();
  assert.deepEqual([...actual].filter((r) => !documented.has(r)).sort(), [], "routes missing from ENDPOINTS");
  assert.deepEqual([...documented].filter((r) => !actual.has(r)).sort(), [], "ENDPOINTS with no route handler");
});

test("operationIds are unique", () => {
  const ids = ENDPOINTS.map((e) => e.operationId);
  assert.equal(new Set(ids).size, ids.length);
});

test("OpenAPI request bodies are real schemas", () => {
  const doc = openApiDocument();
  const create = doc.paths["/drills"].post as { requestBody: { content: Record<string, { schema: { properties?: object } }> } };
  const props = create.requestBody.content["application/json"].schema.properties ?? {};
  assert.ok("name" in props && "templateId" in props, "createDrill body schema missing fields");
});

test("the web app reaches data only through @drillforce/core", () => {
  const SRC = join(__dirname, "../../../..");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name) && /from ["']@drillforce\/(db|scoring-engine|report-generator)["']/.test(readFileSync(full, "utf8"))) {
        offenders.push(relative(SRC, full));
      }
    }
  };
  walk(SRC);
  assert.deepEqual(offenders, [], "import these through @drillforce/core instead");
});
