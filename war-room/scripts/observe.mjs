import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:3100");
const log = (m) => {
  if (m.type === "message") {
    const x = m.message;
    console.log((x.emoji || "🧑"), `${x.name}:`, x.text.replace(/\n/g, " ⏎ ").slice(0, 120));
  }
};

const human = (t, delay) =>
  setTimeout(() => {
    console.log(`\n>>> human: ${t}`);
    ws.send(JSON.stringify({ type: "chat", text: t, name: "Dana" }));
  }, delay);

ws.on("open", () => {
  console.log("--- starting database_failover @4x ---");
  ws.send(JSON.stringify({ type: "start", scenario: "database_failover", speed: 4 }));
  human("I'll take ops", 3500);
  human("root cause found: primary lost quorum", 7000);
  human("I propose we fail over to the replica", 10500);
  human("fix deployed", 14500);
  human("all clear", 18000);
});
ws.on("message", (b) => log(JSON.parse(b.toString())));
setTimeout(() => {
  console.log("\n--- done ---");
  process.exit(0);
}, 22000);
