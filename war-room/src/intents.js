// Lightweight intent detection for responder messages. Order matters: the first match wins.

const FUNCTIONS = [
  ["comms", /\b(comms|communications?|status ?page|customer updates?)\b/],
  ["liaison", /\b(liaison|stakeholders?|vendor)\b/],
  ["scribe", /\b(scribe|notes|timeline)\b/],
  ["database", /\b(db|database|postgres|replica|primary)\b/],
  ["security", /\b(security|waf|auth)\b/],
  ["infra", /\b(infra|network|k8s|kubernetes|nodes?)\b/],
  ["ops", /\b(ops|operations|investigat\w*|mitigation|on ?call)\b/],
];

/** Slack markup → plain text: <@U123>, <!channel>, <url|label>. */
export function plain(text = "") {
  return text
    .replace(/<!(channel|here|everyone)>/g, "@$1")
    .replace(/<@([A-Z0-9]+)>/g, "@someone")
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<([^>]+)>/g, "$1")
    .trim();
}

const rx = (s) => new RegExp(s, "i");
const RULES = [
  // Direction to the IC wins over everything else.
  ["move_on", rx(String.raw`\b(move (?:past|on|forward)|focus(?:ing)? on (?:the )?(?:mitigat|fix)|start (?:the )?mitigat|let'?s (?:mitigate|fix it)|skip (?:this|that|it)|stop asking|hung (?:up )?on|stuck on|enough (?:on|about))`)],
  ["drill_note", rx(String.raw`\b(it'?s a ?drill|this is a ?drill|just a drill|is (?:this|it) a drill)\b`)],
  ["dismiss", rx(String.raw`\b(false (?:alarm|positive)|not (?:relevant|real|an issue|a (?:real )?problem|our (?:problem|service))|irrelevant|ignore (?:it|this|the alert)|just noise|flaky (?:alert|monitor)|nothing to worry)`)],
  ["who_is_ic", rx(String.raw`\bwho(?:'s| is)?\s+(?:the\s+)?(?:ic|incident commander|in charge|running this|leading)\b`)],
  ["who_owns", rx(String.raw`\bwho(?:'s| is)?\s+(?:on|owning|handling|taking|looking at|investigating|doing)\b`)],
  ["sitrep", rx(String.raw`\b(sitrep|status\??$|where are we|where do we stand|what'?s (?:the )?status|catch me up|update\?)`)],
  ["resolved", rx(String.raw`\b(all clear|resolved|back to normal|fully recovered|we'?re green|incident over)\b`)],
  ["fixed", rx(String.raw`\b(fix (?:is )?(?:deployed|live|out)|deployed the fix|mitigation (?:applied|in place)|failed over|rolled back|promoted the replica|patch is live)\b`)],
  ["root_cause", rx(String.raw`\b(root cause|found the (?:cause|issue|problem)|caused by|the culprit|it'?s the)\b`)],
  ["proposal", rx(String.raw`\b(i propose|i recommend|i suggest|proposal:|should we|we should|can we|let'?s)\b`)],
  ["blocked", rx(String.raw`\b(blocked|need help|need access|no access|locked out|escalate|can'?t (?:log ?in|access|get in|see|connect|ssh)|cannot (?:log ?in|access|connect)|(?:no|don'?t see any|not seeing any) (?:data|metrics|logs|traces))`)],
  ["claim", rx(String.raw`\b(i'?ll take|i will take|i can take|i'?ve got|i got|assign me|i'?ll (?:run|own|handle|look|check|investigate)|i'?m on|i'?m (?:taking|handling|owning))\b`)],
  ["investigating", rx(String.raw`\b(i'?m (?:looking|checking|investigating|digging)|looking (?:at|into)|checking|investigating|digging into)\b`)],
  ["impact", rx(String.raw`\b(hard down|outage|(?:all|no) (?:pay\w*|checkout\w*|order\w*|traffic|transactions?)|not (?:proces\w*|work\w*|load\w*)|(?:is|are|went|gone) down|\bdown\b|unavailable|customers? (?:can'?t|cannot|are failing)|failing for)`)],
  ["affirm", rx(String.raw`^(yes|yep|yeah|yup|correct|confirmed|affirmative|ok|okay|ack|roger)\b[.! ]*$`)],
  ["observation", rx(String.raw`\b(seeing|i see|looks like|noticed|error rate|latency|spike|dashboard shows|graph|logs show|cpu|memory)\b`)],
  ["done", rx(String.raw`\b(done|finished|completed|confirmed|verified)\b`)],
  ["comms", rx(String.raw`\b(status ?page|customers?|external comms?|internal comms?|announce|notify)\b`)],
  ["stakeholder", rx(String.raw`\b(support|ceo|exec|leadership|vendor|finance|legal|sales)\b`)],
  ["greeting", rx(String.raw`^(hi|hey|hello|joining|here|i'?m here|on the call)\b`)],
];

/** Evidence that the incident is a drill (tags, synthetic traffic, the DrillForce briefing). */
export const DRILL_EVIDENCE = rx(String.raw`\b(env:drill|drill_id|tagged|tags? (?:say|show)|synthetic|injected|drillforce|briefing (?:says|said)|the briefing|channel (?:says|topic)|confirmed (?:with|by)|evidence|proof|dashboard shows drill)`);

/** A finding inside an "I'm investigating" message: "…, I see X", "found X", "looks like X". */
export function findingIn(text) {
  const m = /\b(?:i see|i'?m seeing|seeing|found|noticed|looks like|it'?s showing|shows)\b[:,]?\s*(.+)/i.exec(text);
  return m ? m[1].replace(/[.!]+$/, "").trim() : null;
}

/** { intent, function?, question } for a responder message. */
export function classify(raw) {
  const text = plain(raw);
  const lower = text.toLowerCase();
  const hit = RULES.find(([, re]) => re.test(lower));
  const fn = FUNCTIONS.find(([, re]) => re.test(lower))?.[0];
  return { intent: hit ? hit[0] : lower.includes("?") ? "question" : "statement", function: fn, text, question: lower.includes("?") };
}
