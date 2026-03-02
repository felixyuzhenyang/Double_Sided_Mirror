---
name: gov-worker-response-assistant
description: Implement and enforce the government staff response workflow for synced citizen cases in Double-Sided Mirror. Use when building or refining staff intake, transcript review, AI draft generation, mandatory human rewrite, case-status updates, and citizen-visible final responses with auditability.
---

# Gov Worker Response Assistant

## Goal

Ensure government staff can review consented citizen cases and publish reliable human-authored responses with AI assistance and audit trails.

## Mandatory Workflow

1. Capture staff identity at session start.
- Require `name` or `employee_id`.
- Attach identity to every draft and publish action.

2. Load only consented cases.
- Show synced transcript and AI-generated case summary.
- Prevent access to non-consented citizen records.

3. Generate AI draft response.
- Use transcript + summary + policy citations as draft input.
- Keep draft factual, procedural, and plain language.

4. Enforce manual rewrite.
- Require staff to submit final response in their own wording.
- Block one-click publish of raw AI draft.
- Keep AI draft and final response for internal audit.
- Add minimum quality gates (length + concrete next step + timeline/contact path).

5. Publish and notify.
- Mark case `responded`.
- Expose final staff response to the originating citizen view.

## Quality Controls

- Require citation-backed recommendations for key steps.
- Require concrete next actions and responsible agency.
- Require uncertainty note when policy source is incomplete.
- Reject hostile or ambiguous tone.

## Safety Controls

- Show internal reminder that AI text is assistive, not authoritative.
- Preserve human accountability in final reply.
- Log who approved and published the final response.
- Include a visible reminder that staff remain responsible for factual correctness.

## Read Next

- Read `references/staff-workflow.md` for process details.
- Read `references/reply-quality-rubric.md` for review criteria.
- Read `references/audit-log-spec.md` for logging events and fields.
- Use `assets/response-template.md` as the initial response structure.
