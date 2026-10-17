import { classify } from "../intents.js";
import { SEVERITIES } from "../state.js";
import { BaseAgent } from "./base-agent.js";

/**
 * Incident Commander (skills/index.js → ic). Acknowledges every responder message in its thread
 * with one meaningful question, drives ownership and time boxes, runs go/no-go decisions, moves
 * the phase, and posts the 5-minute status update.
 */
export class IC extends BaseAgent {
  constructor() {
    super("ic");
  }

  decide(event, state) {
    if (state.closed) return null;
    switch (event.type) {
      case "declare":
        return this._declare(state);
      case "user":
        return this._onHuman(event, state);
      case "status_update":
        return this._statusUpdate(state);
      case "sitrep":
        return { text: this._sitrep(state), job: "Post a crisp situation report." };
      case "inject":
        return this._onSignal(event, state);
      case "agent":
        return this._onAgent(event, state);
      default:
        return null;
    }
  }

  _declare(state) {
    const sev = SEVERITIES[state.severity];
    state.setPhase("investigating");
    state.milestone(`Incident declared (${sev.label}); IC on point`);
    return {
      job: "Declare the incident, state that you are IC, and ask for owners for investigation and comms with a first report time.",
      text:
        `I'm the *Incident Commander* for this ${sev.label} drill — ${state.scenario.summary} We're *investigating*. ` +
        `First asks: *who's taking investigation/ops?* and *who owns comms?* Claim it here and tell me when you'll report back (aim for ${state.t(state.inMinutes(5)).slice(0, 7)}).`,
    };
  }

  /** Every human message gets an in-thread acknowledgement + one question that moves things forward. */
  _onHuman(event, state) {
    const { intent, function: fn, question } = classify(event.text);
    const who = state.mention(event.name);
    const due = state.t(state.inMinutes(5)).slice(0, 7);
    const reply = (text, job) => ({ text, job, thread: true });

    switch (intent) {
      case "who_is_ic":
        return reply(
          `${who} I'm the *Incident Commander* — I coordinate and make the calls. ${this._ownershipAsk(state, event.name)}`,
          "Confirm you're the IC, then ask this person what role they're taking right now.",
        );
      case "who_owns":
        return reply(
          `${who} Current owners: ${this._owners(state)}. ${this._ownershipAsk(state, event.name)}`,
          "Say who owns what right now, then ask this person to take an unowned function.",
        );
      case "sitrep":
        return { text: this._sitrep(state), job: "Answer with a crisp sitrep.", thread: true };
      case "claim": {
        const role = fn ?? "ops";
        state.roles[role] = event.name;
        state.person(event.name).function = role;
        if (role === "comms") state.commsOwner = event.name;
        state.milestone(`${event.name} owns *${role}*`);
        state.addTask(event.name, `${role}: first report`, 5);
        return reply(
          `Thanks ${who} — you own *${role}*. What's your first step, and can you report back by *${due}*?`,
          "Confirm the role assignment by name, ask for their first step, and set a report-back time.",
        );
      }
      case "investigating": {
        if (!Object.values(state.roles).includes(event.name)) {
          state.roles[fn && fn !== "comms" ? fn : "ops"] = event.name;
          state.milestone(`${event.name} investigating`);
        }
        state.addTask(event.name, this._taskText(event.text, fn ?? "investigation"), 5);
        return reply(
          `Good, ${who}. What are you seeing so far — which service, error rate, since when? Report back by *${due}* even if it's "nothing yet".`,
          "Acknowledge they are investigating, ask what they see so far (service, error rate, start time), and set a report-back time.",
        );
      }
      case "observation":
        return reply(
          `Noted, ${who}. What's the customer impact — are checkouts/writes failing or just slow? And does it line up with the alert start time?`,
          "Acknowledge the observation and ask one question that turns it into impact or correlation.",
        );
      case "root_cause":
        if (state.phase === "investigating") state.setPhase("mitigating");
        state.milestone(`Root cause called by ${event.name}`);
        return reply(
          `Root cause called by ${who} — moving to *mitigating*. How confident are you, and what's the evidence? What's the fix and its risk? Deputy, stand by for a risk check.`,
          "Move to mitigating and ask for confidence, evidence, the proposed fix and its risk.",
        );
      case "proposal":
        state.proposals.push({ by: event.name, text: event.text });
        return reply(
          `Proposal from ${who}: “${event.text}”. *Are there any strong objections?* Deputy — risk check (data loss, blast radius, rollback). I'll call go/no-go after that.`,
          "Restate the proposal, ask for strong objections, and request the Deputy's risk check before deciding.",
        );
      case "fixed":
        state.setPhase("monitoring");
        state.milestone(`Mitigation applied by ${event.name}`);
        return reply(
          `Thanks ${who}. Moving to *monitoring*. What metric are we watching to confirm recovery, and for how long before we call it?`,
          "Move to monitoring and ask which metric proves recovery and the watch window.",
        );
      case "resolved":
        state.setPhase("resolved");
        state.milestone(`Resolved (called by ${event.name})`);
        return reply(
          `Confirmed — calling it *resolved*. Thank you ${who} and team. Scribe, please close out with the after-action.`,
          "Call the incident resolved and hand to the Scribe.",
        );
      case "blocked":
        return reply(
          `${who} what exactly do you need — access, a person, or a decision? Liaison, can you help unblock?`,
          "Ask precisely what they need to get unblocked and pull in the Liaison.",
        );
      case "done": {
        const open = state.openTasks(event.name);
        const task = open.at(-1);
        if (task) task.status = "done";
        state.milestone(`${event.name} completed: ${task?.text ?? "task"}`);
        return reply(
          `Thanks ${who} — marked done. What did it show, and what's your next step?`,
          "Acknowledge completion and ask for the result and the next step.",
        );
      }
      case "greeting":
        return reply(
          `Welcome ${who} — I'm the IC. ${this._ownershipAsk(state, event.name)}`,
          "Welcome them and ask them to take an unowned role.",
        );
      default:
        return reply(
          `Ack ${who}. ${question ? "Good question — " : ""}${this._nextQuestion(state, event.name)}`,
          "Acknowledge the message and ask the single most useful next question for the incident.",
        );
    }
  }

  _onSignal(event, state) {
    // Stakeholder/customer pressure is for Comms and the Liaison; the IC follows telemetry.
    if (event.meta?.type === "comms") return null;
    const owner = state.roles.ops ?? state.roles.database ?? state.roles.infra;
    if (owner) {
      return {
        text: `${state.mention(owner)} — new signal: “${event.text}”. Does that match what you're seeing? Anything to change in your plan?`,
        job: "Point the investigation owner at the new signal and ask if it changes their plan.",
      };
    }
    return {
      text: `New signal and *nobody owns investigation yet*. Who can pick this up right now?`,
      job: "Ask for an owner for the investigation now.",
    };
  }

  _onAgent(event, state) {
    if (event.role !== "deputy" || !state.proposals.length) return null;
    const t = event.text.toLowerCase();
    const cleared = /no objection|safe to proceed/.test(t);
    if (!cleared && /\bhold\b|danger|data loss|objection/.test(t)) {
      state.decisions.push({ at: state.drillMs(), text: "Hold on proposal pending risk mitigation" });
      return { text: "*No-go for now* — let's close that risk first, then I'll re-call it.", job: "Call a no-go pending the risk." };
    }
    if (cleared) {
      const p = state.proposals.shift();
      state.decisions.push({ at: state.drillMs(), text: `GO: ${p.text} (${p.by})` });
      state.milestone(`Decision: GO on “${p.text}”`);
      state.addTask(p.by, p.text, 5);
      return {
        text: `:white_check_mark: *GO* — ${state.mention(p.by)}, you're cleared: “${p.text}”. Tell us when it's done; report back by *${state.t(state.inMinutes(5)).slice(0, 7)}*.`,
        job: "Give an explicit GO to the proposer with a report-back time.",
      };
    }
    return null;
  }

  _statusUpdate(state) {
    const done = state.tasks.filter((t) => t.status === "done").map((t) => `${t.text} (${t.owner})`);
    const doing = state.openTasks().map((t) => `${t.text} — ${t.owner}, due ${state.t(t.dueAt).slice(0, 7)}`);
    const unowned = state.unownedFunctions();
    return {
      job: "Post the regular status update: state, done, in progress with owners/dues, pending/unowned, next update time.",
      text: [
        `:clipboard: *Status update ${state.t().slice(0, 7)}* — ${state.severity}, phase *${state.phase}*. ${this._impact(state)}`,
        `*Done:* ${done.join("; ") || "nothing confirmed yet"}`,
        `*In progress:* ${doing.join("; ") || "nothing owned yet"}`,
        `*Pending / unowned:* ${unowned.length ? unowned.join(", ") + " — need an owner" : "all functions owned"}${state.proposals.length ? `; ${state.proposals.length} proposal(s) awaiting go/no-go` : ""}`,
        `*Next update:* ${state.t(state.inMinutes(5)).slice(0, 7)}`,
      ].join("\n"),
    };
  }

  _impact(state) {
    const down = state.services.filter((s) => s.status === "down").map((s) => s.name);
    const degraded = state.services.filter((s) => s.status === "degraded").map((s) => s.name);
    return `Down: ${down.join(", ") || "none"}. Degraded: ${degraded.join(", ") || "none"}.`;
  }

  _owners(state) {
    const list = Object.entries(state.roles).map(([fn, name]) => `${fn} → ${state.mention(name)}`);
    return list.join(", ") || "*nobody has claimed a role yet*";
  }

  /** Ask the person to take the most important unowned function. */
  _ownershipAsk(state, name) {
    if (Object.values(state.roles).includes(name)) {
      const task = state.openTasks(name).at(-1);
      return task ? `How's “${task.text}” going?` : "What are you working on right now?";
    }
    const unowned = state.unownedFunctions();
    if (unowned.includes("ops")) return "*Can you take investigation?* Tell me what you'll check first.";
    if (unowned.includes("comms")) return "*Can you own comms?* I need someone on internal/external updates.";
    return "What would you like to pick up — or should I pair you with the investigation owner?";
  }

  _nextQuestion(state, name) {
    const unowned = state.unownedFunctions();
    if (unowned.includes("ops")) return "*Who's investigating?* Can you take it, and what will you check first?";
    if (!state.openTasks().length) return "What's the next concrete step, and who's doing it?";
    if (state.phase === "investigating") return "What's the customer impact you're seeing right now?";
    if (state.phase === "mitigating") return "What's the status of the mitigation, and any blockers?";
    if (state.phase === "monitoring") return "Are the recovery metrics holding?";
    return this._ownershipAsk(state, name);
  }

  _taskText(text, fallback) {
    const t = text.replace(/<[^>]+>/g, "").trim();
    return t.length > 70 ? `${fallback}: ${t.slice(0, 67)}…` : t || fallback;
  }

  _sitrep(state) {
    const roles = Object.entries(state.roles).map(([k, v]) => `${k}=${v}`).join(", ") || "none assigned";
    return [
      `:rotating_light: *SITREP* — ${state.scenario.title}`,
      `Severity *${state.severity}* · phase *${state.phase}* · ${state.t().slice(0, 7)}`,
      this._impact(state),
      `Roles: ${roles} · open tasks: ${state.openTasks().length} · comms: ${state.commsOwner ?? "Comms agent"}`,
    ].join("\n");
  }
}
