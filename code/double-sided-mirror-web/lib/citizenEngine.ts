import { ActionStep, CitizenMeta, CitizenResult, Citation } from "./types";
import { actionPlanToMermaid } from "./flowchart";
import { matchPolicyCitations } from "./policyManifest";
import { cityOfficialCitations, knownCityDomains } from "./cityDirectory";
import { sanitizeCitations } from "./paValidation";

const RISK_NOTICE =
  "AI support content may be incomplete or outdated. Confirm critical details with the responsible Pennsylvania agency. This platform does not provide legal advice.";

const DEFAULT_FOLLOWUP_QUESTIONS = [
  "Are you doing this for yourself, your household, or a business?",
  "When do you want to finish this process?",
  "Do you already have a case number, application number, or denial letter?",
  "Do you already have your key documents ready (ID, proof of address, and income/business records)?",
  "Do you plan to complete this online, in person, or by phone?"
];

function sentenceCase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "Pennsylvania service request";
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function normalizeDetailValue(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function initCitizenMeta(initialMessage: string): CitizenMeta {
  const goal = normalizeDetailValue(initialMessage);
  return {
    stage: "intake",
    intentCategory: "dynamic",
    intentTitle: goal ? sentenceCase(goal) : "Pennsylvania service request",
    details: {},
    followUpQuestions: [],
    followUpAnswers: {},
    followUpIndex: 0,
    policySummary: "",
    policyCitations: [],
    liveSearchUsed: false,
    citizenDisplayName: "",
    finalSupplement: ""
  };
}

export function upsertCitizenDetail(meta: CitizenMeta, key: string, value: string): CitizenMeta {
  const normalized = normalizeDetailValue(value);
  if (!normalized) {
    return meta;
  }
  return {
    ...meta,
    details: {
      ...meta.details,
      [key]: normalized
    }
  };
}

export function hasCoreFields(meta: CitizenMeta): boolean {
  return Boolean(meta.details.goal && meta.details.city);
}

export function nextFollowUpQuestion(meta: CitizenMeta): string | null {
  if (meta.followUpIndex >= meta.followUpQuestions.length) {
    return null;
  }
  return meta.followUpQuestions[meta.followUpIndex] ?? null;
}

export function recordFollowUpAnswer(meta: CitizenMeta, answer: string): CitizenMeta {
  const question = nextFollowUpQuestion(meta);
  if (!question) {
    return meta;
  }
  const normalizedAnswer = normalizeDetailValue(answer);
  if (!normalizedAnswer) {
    return meta;
  }
  return {
    ...meta,
    followUpAnswers: {
      ...meta.followUpAnswers,
      [question]: normalizedAnswer
    },
    followUpIndex: meta.followUpIndex + 1
  };
}

export function buildLocalResearch(meta: CitizenMeta, transcriptText: string): {
  intentTitle: string;
  policySummary: string;
  citations: Citation[];
  followUpQuestions: string[];
  liveSearchUsed: boolean;
} {
  const goal = meta.details.goal ?? "Pennsylvania service request";
  const city = meta.details.city ?? "the relevant Pennsylvania locality";
  const intentTitle = sentenceCase(goal);
  const stateCitations = matchPolicyCitations(goal, transcriptText);
  const cityCitations = cityOfficialCitations(city);
  const extraDomains = knownCityDomains(city);
  const citations = sanitizeCitations([...stateCitations, ...cityCitations], extraDomains);

  return {
    intentTitle,
    policySummary:
      `I matched official Pennsylvania and ${city} government sources for "${goal}". ` +
      "I need a few practical details from you before I can generate a complete step-by-step plan.",
    citations,
    followUpQuestions: DEFAULT_FOLLOWUP_QUESTIONS,
    liveSearchUsed: false
  };
}

export function buildFallbackActionPlan(meta: CitizenMeta): ActionStep[] {
  const goal = meta.details.goal ?? "complete your request";
  const city = meta.details.city ?? "your Pennsylvania locality";

  return [
    {
      order: 1,
      title: "Confirm responsible agencies and official intake channels",
      details: `Use Pennsylvania official portals and ${city} government pages to verify which agencies handle "${goal}".`,
      timing: "Start immediately",
      materials: ["Request description", "City/locality details", "Contact information"],
      agency: "PA.gov + City Government"
    },
    {
      order: 2,
      title: "Collect required identity and eligibility records",
      details:
        "Prepare core documentation requested by both state and local agencies before submission.",
      timing: "Day 1-3",
      materials: ["Identity records", "Proof of address", "Income or business records if applicable"],
      agency: "Responsible state/local agency"
    },
    {
      order: 3,
      title: "Submit applications in official sequence",
      details:
        "Submit through official portals first, then complete local filings, permits, or interviews in the order required.",
      timing: "Day 2-7",
      materials: ["Completed forms", "Submission receipts", "Case/application numbers"],
      agency: "Responsible state/local agency"
    },
    {
      order: 4,
      title: "Respond to follow-up notices and deadlines",
      details:
        "Monitor email/portal/mail for requests, upload additional documents quickly, and keep deadline records.",
      timing: "After submission",
      materials: ["Notice letters", "Additional supporting documents", "Status logs"],
      agency: "Responsible state/local agency"
    },
    {
      order: 5,
      title: "Track final decision and ongoing obligations",
      details:
        "Document final decisions, appeal windows, and renewal/re-certification timelines when applicable.",
      timing: "After decision",
      materials: ["Decision notice", "Renewal calendar", "Agency contact records"],
      agency: "Responsible state/local agency"
    }
  ];
}

export function buildFallbackSummary(meta: CitizenMeta): string {
  const goal = meta.details.goal ?? "your request";
  const city = meta.details.city ?? "your Pennsylvania locality";
  const followUpPairs = Object.entries(meta.followUpAnswers)
    .map(([q, a]) => `${q} ${a}`)
    .join(" ");
  const supplement = meta.finalSupplement ? ` Additional notes: ${meta.finalSupplement}.` : "";

  return (
    `You asked for help with "${goal}" in ${city}. ` +
    "The action package below combines Pennsylvania state sources and city-level official sources. " +
    (followUpPairs ? `Key intake details collected: ${followUpPairs}.` : "Key intake details were captured through chat.") +
    supplement
  );
}

export function buildCitizenResult(
  meta: CitizenMeta,
  summaryOverride?: string,
  actionPlanOverride?: ActionStep[],
  citationsOverride?: Citation[]
): CitizenResult {
  const citations = citationsOverride ?? meta.policyCitations;
  const actionPlan = actionPlanOverride && actionPlanOverride.length > 0
    ? actionPlanOverride
    : buildFallbackActionPlan(meta);
  const flowchartMermaid = actionPlanToMermaid(actionPlan);
  const summary = summaryOverride || buildFallbackSummary(meta);

  return {
    summary,
    actionPlan,
    citations,
    flowchartMermaid,
    riskNotice: RISK_NOTICE
  };
}
