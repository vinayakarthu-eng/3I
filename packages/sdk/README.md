# @drillforce/sdk

Typed client for the DrillForce `/api/v1` API. Plain `fetch` at runtime; response types are
derived from the core operations behind each route, so they stay in step with the server.

```ts
import { DrillForce, DrillForceError } from "@drillforce/sdk";

const df = new DrillForce({ apiKey: process.env.DRILLFORCE_API_KEY!, baseUrl: "http://localhost:3000" });

const { id } = await df.drills.create({ name: "Q4 failover", templateId: "database-failover" });
await df.drills.changeStatus(id, "scheduled");

try {
  await df.webhooks.create({ name: "", url: "nope", events: [] });
} catch (err) {
  if (err instanceof DrillForceError) console.log(err.status, err.code, err.fieldErrors);
}
```

Namespaces: `drills`, `reports`, `scenarios`, `competencies`, `readiness`, `analytics`,
`compliance`, `certifications`, `actions`, `webhooks`, `settings`. The full contract is served at
`GET /api/v1/openapi.json`.

`npm test -w @drillforce/sdk` checks that every endpoint in core's `ENDPOINTS` table has a client
method.
