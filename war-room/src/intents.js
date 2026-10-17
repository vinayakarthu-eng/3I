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
  ["who_is_ic", rx(String.raw`\bwho(?:'s| is)?\s+(?:the\s+)?(?:ic|incident commander|in charge|running this|leading)\b`)],
  ["who_owns", rx(String.raw`\bwho(?:'s| is)?\s+(?:on|owning|handling|taking|looking at|investigating|doing)\b`)],
  ["sitrep", rx(String.raw`\b(sitrep|status\??$|where are we|where do we stand|what'?s (?:the )?status|catch me up|update\?)`)],
  ["resolved", rx(String.raw`\b(all clear|resolved|back to normal|fully recovered|we'?re green|incident over)\b`)],
  ["fixed", rx(String.raw`\b(fix (?:is )?(?:deployed|live|out)|deployed the fix|mitigation (?:applied|in place)|failed over|rolled back|promoted the replica|patch is live)\b`)],
  ["root_cause", rx(String.raw`\b(root cause|found the (?:cause|issue|problem)|caused by|the culprit|it'?s the)\b`)],
  ["proposal", rx(String.raw`\b(i propose|i recommend|i suggest|proposal:|should we|we should|can we|let'?s)\b`)],
  ["blocked", rx(String.raw`\b(blocked|stuck|need help|need access|can'?t (?:access|get|see)|no access|escalate)\b`)],
  ["claim", rx(String.raw`\b(i'?ll take|i will take|i can take|i'?ve got|i got|assign me|i'?ll (?:run|own|handle|look|check|investigate)|i'?m on|i'?m (?:taking|handling|owning))\b`)],
  ["investigating", rx(String.raw`\b(i'?m (?:looking|checking|investigating|digging)|looking (?:at|into)|checking|investigating|digging into)\b`)],
  ["observation", rx(String.raw`\b(seeing|i see|looks like|noticed|error rate|latency|spike|dashboard shows|graph|logs show|cpu|memory)\b`)],
  ["done", rx(String.raw`\b(done|finished|completed|confirmed|verified)\b`)],
  ["comms", rx(String.raw`\b(status ?page|customers?|external comms?|internal comms?|announce|notify)\b`)],
  ["stakeholder", rx(String.raw`\b(support|ceo|exec|leadership|vendor|finance|legal|sales)\b`)],
  ["greeting", rx(String.raw`^(hi|hey|hello|joining|here|i'?m here|on the call)\b`)],
];

/** { intent, function?, question } for a responder message. */
export function classify(raw) {
  const text = plain(raw);
  const lower = text.toLowerCase();
  const hit = RULES.find(([, re]) => re.test(lower));
  const fn = FUNCTIONS.find(([, re]) => re.test(lower))?.[0];
  return { intent: hit ? hit[0] : lower.includes("?") ? "question" : "statement", function: fn, text, question: lower.includes("?") };
}
