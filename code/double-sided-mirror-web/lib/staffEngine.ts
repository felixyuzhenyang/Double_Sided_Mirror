import { CaseRecord } from "./types";

export function buildFallbackStaffDraft(caseRecord: CaseRecord): string {
  const topSteps = caseRecord.actionPlan
    .slice(0, 3)
    .map((step) => `${step.order}. ${step.title}`)
    .join("\n");

  return [
    "Hello, and thank you for submitting your request. Staff have reviewed the shared case details.",
    "",
    `Based on current information, please prioritize the following steps:\n${topSteps}`,
    "",
    "Please follow official deadlines in agency notices and keep proof of submission. If additional documents are requested, submit them before the due date.",
    "",
    "Use the official Pennsylvania links listed in your case package. If your case has exceptions, contact the responsible agency's support channel for confirmation.",
    "",
    "Note: This is an AI-assisted draft. Staff must rewrite and validate the final response before publication."
  ].join("\n");
}
