import { BaseAgent, has } from "./base-agent.js";

const THEORIES = {
  db: {
    cause: "the primary lost quorum and connections are piling up on a dead master",
    fix: "promote the replica with the lowest lag, then drain the connection pool",
  },
  security: {
    cause: "a distributed credential-stuffing run against /login from a rotating IP pool",
    fix: "enable per-account rate limits + CAPTCHA, block the ASN at the WAF, force-reset matched accounts",
  },
  k8s: {
    cause: "a memory leak in v2.14.0 — pods OOM, get rescheduled, and reinfect their nodes",
    fix: "scale the canary to zero and pin traffic to the last-good revision; raise limits only as a stopgap",
  },
  infra: { cause: "an upstream dependency degraded and we're not shedding load", fix: "shed non-critical traffic and fail over" },
};

export class SME extends BaseAgent {
  constructor() {
    super("sme");
  }

  decide(event, state) {
    if (state.closed) return null;
    const theory = THEORIES[state.scenario.domain] ?? THEORIES.infra;
    // Confidence climbs as more evidence (injects) lands.
    const confidence = Math.min(92, 45 + state.injectsFired * 9);

    if (event.type === "inject" && ["alert", "metric", "security"].includes(event.meta?.type)) {
      return this.say(
        `Theory (*${confidence}%* confidence): ${theory.cause}. Recommend: ${theory.fix}.`,
      );
    }

    if (event.type === "user" && has(event.text, "root cause", "found the cause", "it's the", "caused by")) {
      return this.say(`Confirming — consistent with ${theory.cause}. Remediation: ${theory.fix}.`);
    }

    return null;
  }
}
