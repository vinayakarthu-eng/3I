const AGENTS = [
  { emoji: "🎖️", name: "Incident Commander" },
  { emoji: "🛡️", name: "Deputy" },
  { emoji: "🔬", name: "SME" },
  { emoji: "📢", name: "Comms" },
  { emoji: "🔗", name: "Liaison" },
  { emoji: "📝", name: "Scribe" },
];
const SEV_COLOR = { SEV1: "var(--sev1)", SEV2: "var(--sev2)", SEV3: "var(--sev3)" };

const $ = (id) => document.getElementById(id);
const feed = $("feed");
let running = false;
let injectCount = 0;

// ─── websocket ──────────────────────────────────────────────────────────────
let ws;
function connect() {
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = () => setTimeout(connect, 1500);
}
connect();

function handle(evt) {
  switch (evt.type) {
    case "hello":
      setMode(evt.mode);
      fillScenarios(evt.scenarios);
      (evt.history || []).forEach(addMessage);
      if (evt.status) applyStatus(evt.status);
      renderRoster({});
      break;
    case "drill_start":
      feed.innerHTML = "";
      injectCount = 0;
      $("timeline").innerHTML = "";
      running = true;
      $("stopBtn").disabled = false;
      applyStatus(evt.status);
      break;
    case "message":
      addMessage(evt.message);
      break;
    case "status":
      applyStatus(evt.status);
      break;
  }
}

// ─── rendering ────────────────────────────────────────────────────────────────
function addMessage(m) {
  const el = document.createElement("div");
  el.className = `msg ${m.kind}`;
  if (m.kind === "inject") {
    el.innerHTML = `<div class="body"><div class="who">⚠️ ${esc(m.name)} · ${m.severity || ""}</div><div class="text">${esc(m.text)}</div></div>`;
    addTimeline(m.text);
  } else {
    const color = m.color || "#cfd8e5";
    el.innerHTML = `<div class="av">${m.emoji || "🧑"}</div><div class="body"><div class="who" style="color:${color}">${esc(m.name)}</div><div class="text">${esc(m.text)}</div></div>`;
  }
  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;
}

function addTimeline(text) {
  injectCount++;
  const li = document.createElement("li");
  li.innerHTML = `<b>#${injectCount}</b> ${esc(text.length > 70 ? text.slice(0, 68) + "…" : text)}`;
  $("timeline").appendChild(li);
}

function applyStatus(s) {
  if (!s) return;
  $("scenarioName").textContent = s.scenario.title;
  $("timer").textContent = `T+${s.elapsed}`;
  const sev = $("sevPill");
  sev.hidden = false;
  sev.textContent = s.severityMeta.label;
  sev.style.background = "rgba(255,255,255,.06)";
  sev.style.color = SEV_COLOR[s.severity];
  const ph = $("phasePill");
  ph.hidden = false;
  ph.textContent = s.phase;
  renderServices(s.services);
  renderRoster(s.roles || {});
  if (s.closed) {
    running = false;
    $("stopBtn").disabled = true;
  }
}

function renderServices(services) {
  $("services").innerHTML = (services || [])
    .map((svc) => `<div class="svc"><span class="dot ${svc.status}"></span><span class="nm">${esc(svc.name)}</span></div>`)
    .join("");
}

function renderRoster(roles) {
  const agents = AGENTS.map(
    (a) => `<li><span class="rav">${a.emoji}</span><span class="rn">${a.name}</span><span class="rd">${running ? "active" : "idle"}</span></li>`,
  );
  const humans = Object.entries(roles).map(
    ([fn, name]) => `<li><span class="rav">🧑</span><span class="rn">${esc(name)}</span><span class="rd">${esc(fn)}</span></li>`,
  );
  $("roster").innerHTML = agents.join("") + humans.join("");
}

function setMode(mode) {
  const b = $("modeBadge");
  b.textContent = mode === "live" ? "LIVE SLACK" : "SIMULATOR";
  b.className = `badge ${mode === "live" ? "badge-live" : "badge-sim"}`;
}

function fillScenarios(scenarios) {
  $("scenarioSelect").innerHTML = scenarios
    .map((s) => `<option value="${s.slug}">${s.title} (${s.severity})</option>`)
    .join("");
}

// ─── controls ─────────────────────────────────────────────────────────────────
$("startBtn").onclick = () =>
  send({ type: "start", scenario: $("scenarioSelect").value, speed: Number($("speedSelect").value) });
$("stopBtn").onclick = () => send({ type: "stop" });
$("chatForm").onsubmit = (e) => {
  e.preventDefault();
  const text = $("chatInput").value.trim();
  if (!text) return;
  addMessage({ kind: "user", name: "You", emoji: "🧑", text });
  send({ type: "chat", text, name: "You" });
  $("chatInput").value = "";
};

function send(obj) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(obj));
}
function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
