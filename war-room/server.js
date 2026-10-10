import "dotenv/config";
import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

import { Comms } from "./src/agents/comms.js";
import { Deputy } from "./src/agents/deputy.js";
import { IC } from "./src/agents/ic.js";
import { Liaison } from "./src/agents/liaison.js";
import { Orchestrator } from "./src/agents/orchestrator.js";
import { SME } from "./src/agents/sme.js";
import { Scribe } from "./src/agents/scribe.js";
import { WsAdapter } from "./src/adapters/ws-adapter.js";
import { InjectEngine } from "./src/engine/inject-engine.js";
import { SCENARIOS, findScenario } from "./src/engine/scenarios.js";
import { DrillState } from "./src/state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DEFAULT_SPEED = Number(process.env.DRILL_SPEED) || 2;

const slackReady =
  !!process.env.SLACK_BOT_TOKEN && !!process.env.SLACK_APP_TOKEN && !!process.env.SLACK_SIGNING_SECRET;

// ─── WarRoom controller ─────────────────────────────────────────────────────
class WarRoom {
  constructor({ broadcast }) {
    this.broadcast = broadcast;
    this.adapters = [];
    this.history = [];
    this.current = null;
    this.mode = "simulator";
    this.wsAdapter = new WsAdapter({ broadcast });
    this.addAdapter(this.wsAdapter);
  }

  addAdapter(adapter) {
    adapter.onUserMessage((user, src) => this.onUserMessage(user, src));
    this.adapters.push(adapter);
  }

  async send(message, except) {
    this.history.push(message);
    if (this.history.length > 200) this.history.shift();
    for (const a of this.adapters) {
      if (a === except) continue;
      try {
        await a.send(message);
      } catch (err) {
        console.error(`[${a.name}] send failed:`, err.message);
      }
    }
  }

  makeAgents() {
    return { ic: new IC(), deputy: new Deputy(), sme: new SME(), comms: new Comms(), liaison: new Liaison(), scribe: new Scribe() };
  }

  async start(slug, speed = DEFAULT_SPEED, { invite = [] } = {}) {
    await this.stop();
    const scenario = findScenario(slug) || SCENARIOS[0];
    this.history = [];
    const state = new DrillState(scenario, speed);
    const topic = `${scenario.title} · ${state.severity} · drill ${state.id}`;

    for (const a of this.adapters) {
      try {
        await a.createChannel(state.channelName, topic, { invite });
      } catch (err) {
        console.error(`[${a.name}] createChannel failed:`, err.message);
      }
    }

    const agents = this.makeAgents();
    const orchestrator = new Orchestrator({ state, agents, send: (m, ex) => this.send(m, ex), speed });
    const injectEngine = new InjectEngine(scenario, speed, { onInject: (inj) => orchestrator.onInject(inj) });
    const timers = [
      setInterval(() => orchestrator.statusCheck(), Math.max(15000, 60000 / speed)),
      setInterval(() => this.broadcast({ type: "status", status: state.snapshot() }), 1000),
    ];
    this.current = { state, orchestrator, injectEngine, timers };

    this.broadcast({ type: "drill_start", status: state.snapshot() });
    orchestrator.declare(); // fire — has built-in delays
    injectEngine.start();
    return state.snapshot();
  }

  async onUserMessage(user, src) {
    if (this.current && !this.current.state.closed) await this.current.orchestrator.handleUser(user, src);
  }

  async sitrep() {
    if (this.current) await this.current.orchestrator.sitrep();
  }

  async stop() {
    if (!this.current) return;
    const { timers, injectEngine, orchestrator, state } = this.current;
    timers.forEach(clearInterval);
    injectEngine.stop();
    if (!state.closed) await orchestrator.afterAction();
    this.broadcast({ type: "status", status: state.snapshot() });
  }

  status() {
    return this.current ? this.current.state.snapshot() : null;
  }

  slackHooks() {
    return {
      startDrill: async ({ slug, speed, inviteUserId, respond }) => {
        const snap = await this.start(slug, speed || DEFAULT_SPEED, { invite: inviteUserId ? [inviteUserId] : [] });
        const ch = this.adapters.find((a) => a.name === "slack")?.channel;
        if (respond) await respond(ch ? `Drill *${snap.scenario.title}* is live in <#${ch.id}>.` : `Drill started.`);
      },
      sitrep: () => this.sitrep(),
      stopDrill: () => this.stop(),
    };
  }
}

// ─── HTTP + WS ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Set();
const broadcast = (obj) => {
  const data = JSON.stringify(obj);
  for (const ws of clients) if (ws.readyState === 1) ws.send(data);
};

const warRoom = new WarRoom({ broadcast });

// REST API
app.get("/api/scenarios", (_req, res) =>
  res.json(SCENARIOS.map((s) => ({ slug: s.slug, title: s.title, severity: s.severity, summary: s.summary, domain: s.domain }))),
);
app.get("/api/status", (_req, res) => res.json({ mode: warRoom.mode, status: warRoom.status() }));
app.post("/api/drill/start", async (req, res) => {
  const { scenario, speed } = req.body || {};
  const snap = await warRoom.start(scenario, Number(speed) || DEFAULT_SPEED, {});
  res.json(snap);
});
app.post("/api/drill/stop", async (_req, res) => {
  await warRoom.stop();
  res.json({ ok: true });
});

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "hello", mode: warRoom.mode, scenarios: SCENARIOS, status: warRoom.status(), history: warRoom.history }));
  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }
    if (msg.type === "chat" && msg.text) warRoom.onUserMessage({ userId: "dashboard", name: msg.name || "You", text: msg.text }, warRoom.wsAdapter);
    else if (msg.type === "start") warRoom.start(msg.scenario, Number(msg.speed) || DEFAULT_SPEED, {});
    else if (msg.type === "stop") warRoom.stop();
  });
  ws.on("close", () => clients.delete(ws));
});

// ─── boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  if (slackReady) {
    try {
      const { SlackAdapter } = await import("./src/adapters/slack-adapter.js");
      const slack = new SlackAdapter({
        botToken: process.env.SLACK_BOT_TOKEN,
        appToken: process.env.SLACK_APP_TOKEN,
        signingSecret: process.env.SLACK_SIGNING_SECRET,
        hooks: warRoom.slackHooks(),
      });
      const auth = await slack.start();
      warRoom.addAdapter(slack);
      warRoom.mode = "live";
      console.log(`\n✅ LIVE SLACK MODE — connected as @${auth.user} in ${auth.team}`);
    } catch (err) {
      console.warn(`\n⚠️  Slack auth failed (${err.data?.error ?? err.message}) — falling back to SIMULATOR MODE.`);
      warRoom.mode = "simulator";
    }
  }

  server.listen(PORT, () => banner());
}

function banner() {
  const line = "─".repeat(54);
  console.log(`\n${line}`);
  console.log(`  🎖️  DrillForce War Room — ${warRoom.mode.toUpperCase()} MODE`);
  console.log(`  ▶  Dashboard:  http://localhost:${PORT}`);
  console.log(`  ▶  Scenarios:  ${SCENARIOS.map((s) => s.slug).join(", ")}`);
  console.log(`  ▶  Agents:     IC · Deputy · SME · Comms · Liaison · Scribe`);
  if (warRoom.mode === "simulator") {
    console.log(`${line}`);
    console.log(`  Simulator mode — drive the drill from the dashboard.`);
    console.log(`  To go live in Slack, add these to .env (see SETUP.md):`);
    console.log(`    • SLACK_BOT_TOKEN     (xoxb-…, bot scopes incl. channels:manage, chat:write)`);
    console.log(`    • SLACK_APP_TOKEN     (xapp-…, connections:write — Socket Mode)`);
    console.log(`    • SLACK_SIGNING_SECRET`);
    console.log(`  Then: /drill database_failover 2  in your workspace.`);
  }
  console.log(`${line}\n`);
}

boot();
