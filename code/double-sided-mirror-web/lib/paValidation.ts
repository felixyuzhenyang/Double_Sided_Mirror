import { Citation } from "./types";
import { knownCityDomains } from "./cityDirectory";

export const ALLOWED_PA_SUFFIXES = [
  "pa.gov",
  "pa.us",
  "state.pa.us",
  "pacodeandbulletin.gov",
  "legis.state.pa.us"
];

export function isAllowedPaUrl(url: string, extraDomains: string[] = []): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    const dynamicDomains = new Set([
      ...knownCityDomains(),
      ...extraDomains.map((item) => item.toLowerCase())
    ]);
    const isAllowedSuffix = ALLOWED_PA_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`)
    );
    if (isAllowedSuffix) {
      return true;
    }
    return Array.from(dynamicDomains).some(
      (domain) => host === domain || host.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

export function sanitizeCitations(input: Citation[], extraDomains: string[] = []): Citation[] {
  const seen = new Set<string>();
  const output: Citation[] = [];

  for (const cite of input) {
    if (!isAllowedPaUrl(cite.url, extraDomains)) {
      continue;
    }
    if (seen.has(cite.url)) {
      continue;
    }
    seen.add(cite.url);
    output.push(cite);
  }

  return output;
}
