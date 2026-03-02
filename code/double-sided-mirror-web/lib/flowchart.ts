import { ActionStep } from "./types";

function escapeNodeLabel(text: string): string {
  return text.replace(/"/g, "'");
}

export function actionPlanToMermaid(steps: ActionStep[]): string {
  const header = "flowchart TD";
  const nodes = steps.map((step, idx) => {
    const nodeId = `S${idx + 1}`;
    return `${nodeId}[\"${escapeNodeLabel(`${step.order}. ${step.title}`)}\"]`;
  });

  const edges = steps
    .slice(0, Math.max(steps.length - 1, 0))
    .map((_, idx) => `S${idx + 1} --> S${idx + 2}`);

  return [header, ...nodes, ...edges].join("\n");
}
