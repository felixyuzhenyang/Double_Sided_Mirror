import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Citation } from "./types";
import { sanitizeCitations } from "./paValidation";

interface PolicyRecord extends Citation {
  topic: string;
  intentTags: string[];
}

const WEAK_TAGS = new Set(["license", "permit", "service", "help", "local", "general"]);

const manifestPath = join(process.cwd(), "data", "policy-manifest.json");

function loadManifest(): PolicyRecord[] {
  const raw = readFileSync(manifestPath, "utf-8");
  const parsed = JSON.parse(raw) as PolicyRecord[];
  return parsed;
}

export function matchPolicyCitations(intentTitle: string, transcriptText: string): Citation[] {
  const manifest = loadManifest();
  const combined = `${intentTitle} ${transcriptText}`.toLowerCase();

  const scored = manifest
    .map((item) => {
      let score = 0;
      for (const tag of item.intentTags) {
        if (combined.includes(tag.toLowerCase())) {
          score += WEAK_TAGS.has(tag.toLowerCase()) ? 0.25 : 1;
        }
      }
      return { item, score };
    })
    .filter((entry) => entry.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((entry) => ({
      title: entry.item.title,
      url: entry.item.url,
      agency: entry.item.agency,
      publishedOrUpdated: entry.item.publishedOrUpdated,
      snippet: entry.item.snippet
    }));

  const fallback = manifest
    .filter((item) => ["general service navigator"].includes(item.topic))
    .slice(0, 1)
    .map((item) => ({
      title: item.title,
      url: item.url,
      agency: item.agency,
      publishedOrUpdated: item.publishedOrUpdated,
      snippet: item.snippet
    }));

  return sanitizeCitations(scored.length > 0 ? scored : fallback);
}
