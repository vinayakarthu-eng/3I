import { classify, DRILL_EVIDENCE, findingIn } from "../intents.js";
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
      case "checkin":
        return this._checkIn(state);
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
    const { intent, function: fn } = classify(event.text);
    const who = state.mention(event.name);
    const due = state.t(state.inMinutes(5)).slice(0, 7);
    // Never send the same reply twice in a row — if it would repeat, move the conversation on instead.
    const reply = (text, job) => {
      if (text === state.lastIcReply) text = `Noted, ${who}. ${this._next(state, event.name)}`;
      state.lastIcReply = text;
      return { text, job, thread: true };
    };

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
        else state.facts.investigator ??= event.name;
        state.milestone(`${event.name} owns *${role}*`);
        state.addTask(event.name, `${role}: first report`, 5);
        return reply(
          `Thanks ${who} — you own *${role}*. What's your first step, and can you report back by *${due}*?`,
          "Confirm the role assignment by name, ask for their first step, and set a report-back time.",
        );
      }
      case "investigating": {
        state.facts.investigator ??= event.name;
        if (!Object.values(state.roles).includes(event.name)) {
          state.roles[fn && fn !== "comms" ? fn : "ops"] = event.name;
          state.milestone(`${event.name} investigating`);
        }
        const finding = findingIn(event.text);
        if (finding) return this._finding(state, event, who, finding);
        state.addTask(event.name, "investigation update", 5);
        return reply(
          `Thank you, ${who} — I'll come back to you. You have an ETA of *5 minutes*; we'll touch base at *${due}*.`,
          "Thank them, give a 5-minute ETA and say exactly when you'll touch base. Don't ask more questions now.",
        );
      }
      case "dismiss":
        return reply(
          `No, ${who} — this is relevant. ${this._evidence(state)} Until we prove otherwise we treat it as real. What would show it's noise?`,
          "Push back firmly but politely: it's relevant, cite the concrete evidence, and ask what would prove it's noise.",
        );
      case "observation":
        // A question ("anyone seeing errors?") gets an answer from what we know, not a "noted".
        if (/\?\s*$/.test(event.text)) {
          return reply(`${who} yes — ${this._evidence(state)} ${this._next(state, event.name)}`, "Answer the question from the incident state, then ask the next useful question.");
        }
        return this._finding(state, event, who, findingIn(event.text) ?? event.text);
      case "impact": {
        const first = !state.facts.impact;
        state.facts.impact ??= event.text;
        if (first) state.milestone(`Impact: ${event.text}`);
        return reply(
          first
            ? `Understood, ${who} — impact: *${event.text}*. That's customer-facing: we hold *${state.severity}* and Comms goes external. ${this._next(state, event.name, ["impact"])}`
            : `Got it, ${who} — impact confirmed. ${this._next(state, event.name, ["impact"])}`,
          "Record the customer impact (don't ask about impact again) and move to the next step.",
        );
      }
      case "move_on":
        return this._moveToMitigation(state, event, who);
      case "drill_note":
        if (DRILL_EVIDENCE.test(event.text)) {
          state.milestone(`${event.name} confirmed it's a drill (with evidence) — IC concluding`);
          return {
            ...reply(
              `Yes — confirmed, this is a drill (${event.name} has the evidence). Well spotted. *Concluding the drill now.*`,
              "Confirm it's a drill because they provided evidence, thank them, and say you're concluding the drill.",
            ),
            conclude: `Confirmed as a drill by ${event.name}`,
          };
        }
        return reply(
          `It may be, ${who} — but until we can prove it, we run it as real. What evidence shows it's a drill?`,
          "Push back: without evidence we treat it as real; ask what shows it's a drill.",
        );
      case "affirm":
        return reply(`Thanks ${who}. ${this._next(state, event.name)}`, "Acknowledge and ask the next unanswered question.");
      case "root_cause":
        state.facts.theory = event.text;
        if (state.phase === "investigating") state.setPhase("mitigating");
        state.milestone(`Root cause called by ${event.name}`);
        return reply(
          `Root cause called by ${who} — moving to *mitigating*. How confident are you, and what's the evidence? What's the fix and its risk? Deputy, stand by for a risk check.`,
          "Move to mitigating and ask for confidence, evidence, the proposed fix and its risk.",
        );
      case "proposal":
        state.facts.mitigation = event.text;
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
        state.facts.blockers.push(event.text);
        if (state.facts.blockers.length > 1) {
          return reply(
            `${who} still blocked — Liaison is chasing your access. Meanwhile: what does the APM page for ${this._primaryService(state)} show (error rate, failing endpoint)? If you can't see anything at all, tell me and I'll pair you with someone who can.`,
            "Acknowledge the repeated blocker, confirm the Liaison is on it, and redirect to what they can check now.",
          );
        }
        state.milestone(`Blocker: ${event.name} — ${event.text.slice(0, 60)}`);
        return reply(
          `${who} understood — you're blocked. Don't wait on host access: work from Datadog (APM service page for ${this._primaryService(state)}, error logs, the database dashboard). Liaison — get ${who} access now. ${this._next(state, event.name, ["impact", "who_investigating"])}`,
          "Acknowledge the blocker, give a practical workaround (observability instead of host access), task the Liaison with access, then ask the next useful question.",
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
          `Ack ${who}. ${this._next(state, event.name)}`,
          "Acknowledge the message and ask the single most useful next question for the incident.",
        );
    }
  }

  /**
   * AI mode: apply the actions Claude decided on to the shared incident state (the same state the
   * playbook uses, so status updates, digests, check-ins and go/no-go keep working).
   */
  applyAiDecision(state, event, decision) {
    let conclude = null;
    let riskCheck = false;
    for (const a of decision.actions) {
      const person = a.person && state.people.has(a.person) ? a.person : event.name;
      switch (a.type) {
        case "assign_role": {
          const role = a.role || "ops";
          state.roles[role] = person;
          if (role === "comms") state.commsOwner = person;
          else state.facts.investigator ??= person;
          state.milestone(`${person} owns *${role}*`);
          break;
        }
        case "set_eta":
          state.facts.investigator ??= person;
          state.addTask(person, a.text || "investigation update", Math.max(1, Math.min(60, a.minutes || 5)));
          break;
        case "record_finding":
          (state.facts.findings ??= []).push({ by: person, text: a.text || event.text });
          for (const t of state.openTasks(person)) if (t.text === "investigation update") t.status = "done";
          state.milestone(`Finding (${person}): ${(a.text || event.text).slice(0, 80)}`);
          break;
        case "record_impact":
          if (!state.facts.impact) state.milestone(`Impact: ${a.text || event.text}`);
          state.facts.impact ??= a.text || event.text;
          break;
        case "record_theory":
          state.facts.theory = a.text || event.text;
          state.milestone(`Theory (${person}): ${(a.text || event.text).slice(0, 80)}`);
          break;
        case "set_phase":
          if (a.phase) state.setPhase(a.phase);
          break;
        case "propose_mitigation":
          state.facts.mitigation = a.text || this._fixFor(state);
          if (!state.proposals.length) state.proposals.push({ by: person, text: state.facts.mitigation });
          break;
        case "request_risk_check":
          riskCheck = true;
          break;
        case "conclude_drill":
          conclude = a.text || `Concluded by the IC`;
          state.milestone(`IC concluding the drill: ${conclude}`);
          break;
      }
    }
    state.lastIcReply = decision.reply;
    return { text: decision.reply, thread: true, job: null, conclude, riskCheck, ai: true };
  }

  /** "I see X": capture the finding and ask for next steps. */
  _finding(state, event, who, finding) {
    state.facts.findings ??= [];
    state.facts.findings.push({ by: event.name, text: finding });
    state.milestone(`Finding (${event.name}): ${finding.slice(0, 80)}`);
    for (const t of state.openTasks(event.name)) if (t.text === "investigation update") t.status = "done";
    return {
      thread: true,
      job: "Capture the finding back to them in a few words, then ask what their next steps are.",
      text: `OK — noted, ${who}: *${finding}*. Let me know the next steps — what will you do next?`,
    };
  }

  /** Concrete evidence the incident is real, from the status board and recent signals. */
  _evidence(state) {
    const down = state.services.filter((s) => s.status === "down").map((s) => s.name);
    const lastSignal = [...state.events].reverse().find((e) => e.kind === "inject");
    return [
      down.length ? `${down.join(", ")} ${down.length > 1 ? "are" : "is"} down.` : "",
      lastSignal ? `Latest signal: “${lastSignal.text}”.` : "",
      state.facts.impact ? `Impact reported: “${state.facts.impact}”.` : "",
    ]
      .filter(Boolean)
      .join(" ") || "We have active alerts on this service.";
  }

  /** At an ETA, the IC touches base with the owner. */
  _checkIn(state) {
    const now = state.drillMs();
    const due = state.openTasks().filter((t) => t.dueAt <= now && !t.checkedIn);
    if (!due.length) return null;
    for (const t of due) t.checkedIn = true;
    return {
      job: "Touch base with each owner whose ETA is up: by name, ask what they found and what's next.",
      text: due
        .map((t) => `${state.mention(t.owner)} — it's ${state.t().slice(0, 7)}, touching base as promised: what have you found, and what's next?`)
        .join("\n"),
    };
  }

  /** The responder told the IC to stop gathering and act: switch to mitigation with a concrete proposal. */
  _moveToMitigation(state, event, who) {
    const decided = state.decisions.find((d) => d.text.startsWith("GO:"));
    if (decided) {
      return {
        thread: true,
        job: "Confirm mitigation is already underway and ask for its ETA and rollback.",
        text: `We're already mitigating, ${who} — ${decided.text.replace(/^GO: /, "GO given: ")}. What's the ETA, and what's the rollback if it doesn't help?`,
      };
    }
    if (state.phase === "investigating") state.setPhase("mitigating");
    const owner = state.facts.investigator ?? event.name;
    const fix = this._fixFor(state);
    if (!state.proposals.length) {
      state.facts.mitigation = fix;
      state.proposals.push({ by: owner, text: fix });
    }
    state.milestone(`IC moved to mitigation (requested by ${event.name})`);
    return {
      thread: true,
      job: "Agree, switch to mitigation now, state what we know, put a concrete mitigation proposal up, and call for objections + the Deputy's risk check.",
      text:
        `You're right, ${who} — we have enough. Moving to *mitigating*. ` +
        `What we know: impact ${state.facts.impact ? `“${state.facts.impact}”` : "is customer-facing"}; ${this._impactLine(state)}. ` +
        `Proposal: *${fix}* — ${state.mention(owner)} executes. *Are there any strong objections?* Deputy — risk check.`,
    };
  }

  _fixFor(state) {
    switch (state.scenario.domain) {
      case "db":
        return "fail over to the in-sync replica and repoint the application";
      case "security":
        return "block the attacking ranges at the WAF and force-reset affected sessions";
      case "k8s":
        return "roll back the canary to the last good revision";
      default:
        return "roll back to the last known-good state";
    }
  }

  _primaryService(state) {
    return state.services.find((s) => s.status === "down")?.name ?? state.services[0]?.name ?? "the failing service";
  }

  _impactLine(state) {
    const down = state.services.filter((s) => s.status === "down").map((s) => s.name);
    return down.length ? `${down.join(", ")} down` : "services degraded";
  }

  /**
   * The next most useful question, skipping anything already answered or asked in the last
   * 5 minutes (`skip` names questions to treat as answered right now).
   */
  _next(state, name, skip = []) {
    const now = state.drillMs();
    const recently = (k) => now - (state.asked.get(k) ?? -Infinity) < 5 * 60_000;
    const f = state.facts;
    const ladder = [
      ["who_investigating", !f.investigator && state.unownedFunctions().includes("ops"), "*Who's investigating?* Can you take it, and what will you check first?"],
      ["impact", !f.impact, "What's the customer impact right now — are payments/checkouts failing?"],
      ["theory", !f.theory && state.phase === "investigating", "What's the leading theory, and what evidence supports it?"],
      ["mitigation", !f.mitigation, `What's our fastest safe mitigation — e.g. *${this._fixFor(state)}*? Say the word and I'll call go/no-go.`],
      ["mitigation_eta", state.phase === "mitigating" && !!f.mitigation, "How long until the mitigation is in place, and what's the rollback if it doesn't help?"],
      ["recovery", state.phase === "monitoring", "Which metric proves recovery, and how long do we watch before calling it?"],
      ["comms_owner", state.unownedFunctions().includes("comms"), "*Who owns comms?* We need someone on customer updates."],
      ["blockers", true, "What's blocking you right now, and what do you need from me?"],
    ];
    for (const [key, applies, question] of ladder) {
      if (!applies || skip.includes(key) || recently(key)) continue;
      state.asked.set(key, now);
      return question;
    }
    return `I'll keep things moving — next status update at *${state.t(state.inMinutes(5)).slice(0, 7)}*. Shout if anything changes.`;
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
