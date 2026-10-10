const STOPWORDS = new Set([
  "the", "and", "for", "with", "all", "are", "was", "our", "that", "this", "from", "into", "onto",
  "has", "have", "had", "not", "but", "you", "your", "their", "them", "its", "any", "per", "via",
]);

/** Lowercase word tokens with punctuation stripped. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/<@[a-z0-9]+>/g, " ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Significant keywords of a phrase (drops stopwords and very short words). */
export function keywords(phrase: string): string[] {
  const words = tokenize(phrase).filter((w) => !STOPWORDS.has(w));
  const long = words.filter((w) => w.length >= 3);
  return long.length ? long : words;
}

/** Fuzzy word match: shared stem of up to 5 characters ("promote" ≈ "promoted" ≈ "promoting"). */
function wordMatches(keyword: string, token: string) {
  if (keyword === token) return true;
  const stem = Math.min(5, keyword.length, token.length);
  return stem >= 3 && keyword.slice(0, stem) === token.slice(0, stem);
}

/**
 * Whether `text` mentions `phrase`: at least half of the phrase's keywords (min 1)
 * appear fuzzily in the text. Returns the matched keywords for evidence.
 */
export function mentions(text: string, phrase: string, minRatio = 0.5) {
  const kws = keywords(phrase);
  if (!kws.length) return { matched: false, hits: [] as string[] };
  const tokens = tokenize(text);
  const hits = kws.filter((k) => tokens.some((t) => wordMatches(k, t)));
  const needed = Math.max(1, Math.ceil(kws.length * minRatio));
  return { matched: hits.length >= needed, hits };
}

/** Stricter match for names: the phrase's keywords must appear consecutively, in order. */
export function mentionsPhrase(text: string, phrase: string) {
  const kws = keywords(phrase);
  const tokens = tokenize(text).filter((t) => !STOPWORDS.has(t));
  if (!kws.length) return false;
  for (let i = 0; i + kws.length <= tokens.length; i++) {
    if (kws.every((k, j) => wordMatches(k, tokens[i + j]))) return true;
  }
  return false;
}
