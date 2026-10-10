---
name: run
description: Launch and drive the DrillForce web app to see a change working — starts the Next.js dev server (apps/web) and screenshots pages with headless Google Chrome. Use when asked to run/start/demo the app, screenshot a page, or confirm a UI change renders in the real app (not just the build or tests).
---

# Running DrillForce

DrillForce is a Turborepo monorepo; the UI is the Next.js 14 app at `apps/web`,
served on **http://localhost:3000**. There's **no auth** — the first seeded admin
(Alex Rivera) is the current user, so every route renders without a login step.

Driving it in a headless environment means: ensure Postgres/Redis are up and the DB
is seeded, start the dev server, warm the route, then screenshot it with headless
Chrome and **look at the screenshot**.

## 1. Prerequisites (Docker + DB)

Postgres 16 + Redis run in Docker. `docker` may not be on PATH — it lives at
`~/.docker/bin/docker`, so prefix with it or add to PATH:

```bash
export PATH="$HOME/.docker/bin:$PATH"
docker compose up -d                    # from repo root; starts postgres + redis
docker ps --format '{{.Names}} {{.Status}}'   # expect drillforce-postgres (healthy) + drillforce-redis
```

If the DB is empty or you changed the schema, migrate + seed (from the repo root):

```bash
npm run db:migrate
npm run db:seed        # truncates and reloads demo data (Acme Corp, drills, scores, certs…)
```

## 2. Start the dev server

Run the **web app only** (faster than `npm run dev`, which also boots the whole turbo graph):

```bash
cd ~/drillforce
pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null   # avoid EADDRINUSE
rm -rf apps/web/.next                                                 # optional: clean stale build
(npm run dev -w @drillforce/web > /tmp/df-dev.log 2>&1 &)
```

**Poll the port — don't `sleep`.** macOS has no `timeout` command, so use a loop:

```bash
for i in $(seq 1 60); do curl -sf http://localhost:3000/ >/dev/null 2>&1 && { echo "UP"; break; }; sleep 1; done
```

Tail `/tmp/df-dev.log` to debug a route that 500s.

### Gotchas
- **Never run `next build` while `next dev` is running** — they share `apps/web/.next`.
  Stop dev first, or `rm -rf apps/web/.next`.
- **`UID` is read-only in zsh** — name shell vars something else (`USR`, `MID`).
- Server actions that compute from the DB (scoring, certs, compliance) run on save; a
  blank chart usually means the DB wasn't seeded.

## 3. Screenshot with headless Chrome

`chromium-cli` is **not** installed. Google Chrome is, and its new headless mode writes
PNGs directly. **Warm each route with `curl` first** so Next compiles it before the
screenshot, and keep a generous `--virtual-time-budget` so recharts/animated pages finish
rendering.

```bash
SHOT="$PWD/.scratch"; mkdir -p "$SHOT"   # or your session scratchpad
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

shoot () {   # shoot <outfile> <path> [height]
  curl -s -o /dev/null "http://localhost:3000$2"; sleep 1          # warm = compile
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size=1440,${3:-1400} \
    --virtual-time-budget=12000 --screenshot="$SHOT/$1" \
    "http://localhost:3000$2" >/dev/null 2>&1
  echo "shot $1 ($2)"
}

shoot 01-dashboard.png     /                        1300
shoot 02-scenarios.png     /scenarios               1500
shoot 03-readiness.png     /readiness               1400
shoot 04-analytics.png     /analytics               1700
shoot 05-compliance.png    /compliance              1100
shoot 06-certifications.png /certifications          1200
shoot 07-settings.png      /settings                1600
shoot 08-integrations.png  /settings/integrations   1400
```

Then **Read each PNG** — a blank or error frame means the route didn't render; check
`/tmp/df-dev.log`.

### The live "war room" (`/drills/[id]/live`)
This full-screen execution view **only renders when the drill is `active`** (otherwise it
redirects to `/briefing` or `/complete`). Flip one drill active, screenshot, then re-seed to
restore clean data:

```bash
export PATH="$HOME/.docker/bin:$PATH"
docker exec drillforce-postgres psql -U drillforce -c \
  "update drills set status='active', started_at=now() - interval '6 minutes' where name='Database Failover'"
AID=$(docker exec drillforce-postgres psql -U drillforce -t -A -c "select id from drills where status='active' limit 1")
shoot 09-live.png "/drills/$AID/live" 950
npm run db:seed >/dev/null 2>&1          # restore: revert the active-status edit
```

The war room runs a client-side simulation (recharts updating every 2s, scrolling log
stream, injects firing) — the screenshot catches a single frame mid-incident, which is
expected.

## 4. Stop

```bash
pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null
```

Leave Docker running (cheap) unless you need a clean slate: `docker compose down`.

## Route map

`/` (dashboard; `/dashboard` is an alias) · `/drills` · `/drills/new` (`?template=<slug>`
pre-fills) · `/drills/[id]` (+ `/briefing` `/live` `/simulate` `/complete` `/report` `/aar`
`/edit`) · `/scenarios` · `/readiness` (+ `/[userId]`) · `/analytics` · `/actions` ·
`/compliance` · `/certifications` (+ `/[certId]/[userId]` printable cert) · `/reports` ·
`/settings` (+ `/settings/integrations`).
