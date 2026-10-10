// Role metadata shared by agents, the orchestrator (delays / min-speak), and the dashboard.
export const ROLES = {
  ic: { key: "ic", name: "Incident Commander", emoji: "🎖️", color: "#f59e0b", delay: 2000, minSpeak: 8000 },
  deputy: { key: "deputy", name: "Deputy", emoji: "🛡️", color: "#60a5fa", delay: 3000, minSpeak: 12000 },
  sme: { key: "sme", name: "SME", emoji: "🔬", color: "#a78bfa", delay: 4000, minSpeak: 11000 },
  comms: { key: "comms", name: "Comms", emoji: "📢", color: "#34d399", delay: 5000, minSpeak: 15000 },
  liaison: { key: "liaison", name: "Liaison", emoji: "🔗", color: "#fb7185", delay: 4500, minSpeak: 18000 },
  scribe: { key: "scribe", name: "Scribe", emoji: "📝", color: "#94a3b8", delay: 6000, minSpeak: 1 },
};

/** IC → Deputy → SME → Comms → Liaison → Scribe. */
export const ROLE_ORDER = ["ic", "deputy", "sme", "comms", "liaison", "scribe"];
