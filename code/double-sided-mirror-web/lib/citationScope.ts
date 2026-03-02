import { Citation } from "./types";

const TOKEN_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "for",
  "of",
  "in",
  "on",
  "with",
  "by",
  "my",
  "me",
  "i",
  "need",
  "want",
  "take",
  "get",
  "apply",
  "service",
  "services",
  "help",
  "license",
  "permit",
  "official",
  "state",
  "city",
  "county",
  "pennsylvania",
  "pa"
]);

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(text: string): string[] {
  const normalized = normalize(text);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !TOKEN_STOPWORDS.has(token));
}

function expandScopeTokens(baseTokens: string[]): string[] {
  const out = new Set(baseTokens);

  if (baseTokens.some((t) => t.startsWith("driv") || t === "driver" || t === "drivers")) {
    out.add("driver");
    out.add("driving");
    out.add("penndot");
    out.add("dmv");
  }

  if (baseTokens.some((t) => t.startsWith("restaur") || t === "food" || t === "cafe" || t === "diner")) {
    out.add("restaurant");
    out.add("food");
    out.add("l&i");
  }

  if (baseTokens.some((t) => t.startsWith("pension") || t.startsWith("retire"))) {
    out.add("pension");
    out.add("retirement");
  }

  if (baseTokens.some((t) => t.startsWith("unemploy"))) {
    out.add("unemployment");
    out.add("uc");
  }

  if (baseTokens.some((t) => t.includes("benefit") || t === "snap" || t === "medicaid")) {
    out.add("benefit");
    out.add("compass");
    out.add("snap");
    out.add("medicaid");
  }

  return Array.from(out);
}

function scoreCitation(citation: Citation, scopeTokens: string[]): number {
  const text = normalize(`${citation.title} ${citation.snippet} ${citation.agency} ${citation.url}`);
  if (!text) {
    return 0;
  }

  let score = 0;
  for (const token of scopeTokens) {
    if (!token) {
      continue;
    }
    if (text.includes(token.toLowerCase())) {
      score += 1;
    }
  }

  return score;
}

export function filterCitationsByGoal(citations: Citation[], goal: string): Citation[] {
  const baseTokens = tokenize(goal);
  if (baseTokens.length === 0) {
    return citations;
  }

  const scopeTokens = expandScopeTokens(baseTokens);

  const scored = citations
    .map((citation) => ({
      citation,
      score: scoreCitation(citation, scopeTokens)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.citation);

  return scored;
}
