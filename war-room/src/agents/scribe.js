import { BaseAgent } from "./base-agent.js";

/**
 * Scribe (skills/index.js → scribe): posts the milestone digest every 10 minutes, prompts the
 * channel when it goes quiet, and writes the after-action summary.
 */
export class Scribe extends BaseAgent {
  constructor() {
    super("scribe");
  }

  decide(event, state) {
    if (event.type === "digest") return this._digest(state, event.since ?? 0);
    if (event.type === "quiet") return this._quiet(state);
    if (event.type === "afteraction") return { text: this._afterAction(state), job: "Write the after-action summary." };
    return null;
  }

  _digest(state, since) {
    const recent = state.milestones.filter((m) => m.at >= since);
    const open = state.openTasks();
    const lines = [
      `:memo: *Milestones ${state.t(since).slice(0, 7)} → ${state.t().slice(0, 7)}* (phase *${state.phase}*)`,
      ...(recent.length ? recent.map((m) => `• ${state.t(m.at).slice(0, 7)} — ${m.text}`) : ["• No new milestones — we need progress updates from owners."]),
      `*Open actions:* ${open.map((t) => `${t.text} (${t.owner}, due ${state.t(t.dueAt).slice(0, 7)})`).join("; ") || "none"}`,
      `*Pending:* ${[...state.unownedFunctions().map((f) => `${f} needs an owner`), ...state.proposals.map((p) => `go/no-go on “${p.text}”`)].join("; ") || "nothing"}`,
    ];
    return { text: lines.join("\n"), job: "Post the milestone digest: what happened, open actions with owners, what's pending." };
  }

  _quiet(state) {
    const task = state.openTasks().at(-1);
    return {
      text: task
        ? `Quiet for a few minutes — ${state.mention(task.owner)}, any update on “${task.text}”? Even “no change” helps.`
        : `Quiet for a few minutes — what's everyone working on? Please post what you're checking so I can log it.`,
      job: "Prompt the quiet channel for a progress update, by name if there's an owner.",
    };
  }

  _afterAction(state) {
    const humans = [...state.people.keys()];
    const roles = Object.entries(state.roles).map(([k, v]) => `${k}: ${v}`).join(", ") || "—";
    const decisions = state.decisions.map((d) => `${state.t(d.at).slice(0, 7)} ${d.text}`).join("; ") || "none recorded";
    return [
      `:page_facing_up: *After-Action — ${state.scenario.title}* (this was a drill)`,
      `Severity *${state.severity}* · duration *${state.t().slice(0, 7)}* · final phase *${state.phase}*`,
      `Responders: ${humans.join(", ") || "agents only"} · roles: ${roles}`,
      `Decisions: ${decisions}`,
      `Actions: ${state.tasks.filter((t) => t.status === "done").length} done, ${state.openTasks().length} still open`,
      `Key milestones: ${state.milestones.slice(0, 8).map((m) => `${state.t(m.at).slice(0, 7)} ${m.text}`).join(" · ")}`,
      `Follow-ups: 1) automate detection for this failure mode, 2) rehearse the rollback path, 3) pre-approve comms templates.`,
    ].join("\n");
  }
}
