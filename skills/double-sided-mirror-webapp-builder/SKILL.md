---
name: double-sided-mirror-webapp-builder
description: Build or iterate the public Double-Sided Mirror web platform for Pennsylvania citizens and government staff. Use when asked to design, implement, debug, refactor, or deploy dual-mode web UX, citizen AI intake, policy-grounded action plans with flowcharts, API-key entry UX, citizen-to-staff case sync, and end-to-end full-stack architecture for this project.
---

# Double-Sided Mirror Webapp Builder

## Goal

Deliver a publicly accessible web app where users choose `Citizen` or `Government Staff` mode and complete a full request-response loop with auditable AI assistance.

## Required Product Behaviors

- Render a landing role switch with exactly two paths: `Citizen` and `Government Staff`.
- Run citizen-side multi-turn intake that narrows scope before giving final guidance.
- Collect universal core fields at the beginning for every request type: what the user needs to do and which Pennsylvania city/locality it involves.
- Use AI-driven policy retrieval before deep follow-up questioning: retrieve official policy sources first, then generate dynamic follow-up questions based on retrieved policy gaps.
- Re-run policy retrieval on every citizen turn after each new user input; update citations and next-question logic using the latest transcript state.
- If live-search output is not machine-readable JSON on a turn, immediately run a same-key structured-repair AI call instead of dropping to local fallback, so multi-turn API continuity remains intact.
- Keep each follow-up as one plain-language question that a non-expert citizen can answer; avoid asking for policy interpretation or legal text.
- Do not include verbose per-turn policy dump text (for example “What I found so far …”) in guided turns; keep interim turns focused on one actionable question only.
- Ensure guided intake converges: target final package generation after about 4-5 follow-up turns (do not let the chat loop indefinitely).
- Never hard-stop the citizen dialog when live search fails on a turn. Attempt live retrieval first, then continue with a clearly labeled official-index fallback so multi-turn progression remains usable.
- Ask a final "Anything else to add?" question before producing final output.
- Ask at conversation end whether the citizen wants to share a name or nickname with staff; if yes, capture and sync it with the case.
- Produce a final citizen package containing:
  - Ordered action plan (where to start, sequence, timing).
  - Required forms and supporting documents.
  - Official citation links limited to Pennsylvania government sources, including city-level official links when city context is provided.
  - Mermaid flowchart generated from the ordered action plan.
- Ask explicit consent before syncing citizen dialog and summary to staff inbox.
- Run staff-side case review with identity capture (`name` or `employee_id`), synced transcript, AI summary, AI draft response, and mandatory human-authored final response.
- Make staff final response visible to the originating citizen session.
- Show risk notice in both modes: AI-generated support content may be incomplete; verify with agency staff; not legal advice.
- Support optional user-provided API key entry before starting AI chat.
- Support multi-provider AI configuration in-session: user selects provider (`OpenAI`, `Gemini`, `Anthropic`, `xAI`) and model, then provides matching API key.
- For Gemini specifically, add backend model-availability safeguards (for example probing `ListModels` and auto-fallback to a currently supported `generateContent` model) so user-selected stale model IDs do not hard-fail the workflow.
- Provide an explicit API-key verification action in UI and show clear pass/fail connection status before substantive dialog.
- Keep a local policy corpus (manifest + cached excerpts) so the app can answer without live web search when possible.
- Force citation links through Pennsylvania official-domain validation before rendering.
- Enforce goal-scope relevance for citations on every turn and in final output: do not surface links unrelated to the citizen’s stated task.
- Record consent, draft, and publish events in an audit log with timestamps.
- Use English as the default UI language for all user-facing website copy unless explicitly requested otherwise.
- Include a homepage civic-brand message and short value propositions for both citizen and staff audiences.

## Build Workflow

1. Confirm implementation scope.
- Confirm stack (`Next.js + TypeScript` preferred), deployment target, and data storage choice.
- Confirm whether API key is user-supplied per session or server-managed.

2. Implement shell and routing.
- Build landing page with clear mode split and accessibility labels.
- Keep mode state and navigation explicit; prevent cross-mode confusion.

3. Implement citizen mode first.
- Start with free-text intent capture.
- First lock in universal fields (`goal` + `PA city/locality`), then run AI policy retrieval, then ask dynamic policy-driven follow-up questions.
- After each additional citizen answer, re-run retrieval with updated context before deciding the next question or finalization readiness.
- If fallback mode is active, maintain ordered follow-up progression (do not repeat the same question indefinitely).
- Ask final supplement question and then lock intake for summary generation.
- Add optional citizen-name capture step after final supplement and before package finalization.
- Generate action checklist, required materials, and timeline.
- Generate Mermaid flowchart from the same action steps to avoid drift.

4. Implement official-source citation enforcement.
- Enforce source allowlist before rendering links.
- Reject non-Pennsylvania citations and regenerate references.
- Use companion skill `pa-policy-knowledge-base` for source curation and validation workflow.

5. Implement sync consent and case handoff.
- Ask for explicit consent (`yes/no`) before storing or exposing citizen transcript.
- Save transcript, summary, and generated action plan as a case record.
- Track case status (`new`, `in_review`, `responded`).

6. Implement government staff mode.
- Capture staff identity at session start.
- Show only consented citizen cases.
- Provide AI guidance and AI draft response.
- Enforce manual rewrite before final submission.
- Use companion skill `gov-worker-response-assistant` for reply quality and audit rules.

7. Implement API key handling.
- Render pre-chat API key modal when user-supplied key mode is enabled.
- In the same modal, require provider/model selection and pass them through citizen, staff, and verification API calls.
- Store key only in memory/session; never persist to database or logs.
- Mask key in UI and logs.
- Add a lightweight backend verification call so users can confirm whether their key can actually invoke AI.

8. Implement public deployment path.
- Deploy to a public URL (`Vercel`, `Netlify`, `Cloudflare Pages`, or equivalent).
- Configure environment variables and production data store.
- Add a lightweight readiness check page for smoke tests.
- For Vercel/serverless deployments, do not rely on writing mutable data into repo-local files. Use managed storage (preferred) or explicit runtime-writable fallback paths for prototypes.

9. Add delivery logging.
- Append one entry in `logs/conversation-log.md` for the completed request.
- Append one entry in `logs/code-change-log.md` listing changed files and verification limits.
- Never store plaintext API keys in logs.

## UI and Interaction Rules

- Keep interface bilingual-ready and plain-language first.
- Prioritize readability over dense controls.
- Preserve full mobile usability.
- Prefer structured cards, progress indicators, and pinned status banners.
- Keep hero/intro typography highly scannable: strong title hierarchy, concise copy blocks, and avoid visually dense paragraphs.
- Use the style tokens in `assets/theme.css` as the starting visual system.
- Maintain keyboard-first accessibility and visible focus states for all critical actions.
- Keep citizen/staff context visually separated to reduce role confusion.
- Avoid flat backgrounds; apply layered gradients, contrast-safe surfaces, and visual depth while preserving readability.
- Ensure mutable GET APIs are configured as dynamic (no static cache) when returning state that changes per request.

## Compliance and Safety Rules

- Treat all policy output as informational assistance.
- Attach disclaimer in final responses.
- Avoid hard legal conclusions.
- Minimize personal data retention.
- Log consent events and staff publication events for auditability.
- Always show a user-facing uncertainty notice when policy confidence is low.
- Keep staff accountability explicit: AI is assistive, final answer is human-owned.

## Public Launch Checklist

- Public URL resolves over HTTPS and works on desktop/mobile.
- Citizen can complete end-to-end flow without account creation.
- Staff can only view citizen records with explicit sync consent.
- Every visible citation URL passes Pennsylvania allowlist validation.
- Final staff publish is blocked if response is empty or copy-paste of AI draft.
- API key modal clearly states session-only handling and non-persistence.
- Footer or result pane includes risk notice: informational only, not legal advice.

## Read Next

- Read `references/system-architecture.md` for component boundaries and deployment baseline.
- Read `references/data-contracts.md` for suggested entities and payload shapes.
- Read `references/ui-ux-spec.md` for interaction and visual system details.
- Read `references/safety-and-compliance.md` for risk controls and user notices.
- Read `references/public-launch-checklist.md` for go-live and post-launch monitoring controls.

## Definition of Done

- Citizen can complete intake and receive actionable, ordered guidance with a flowchart.
- Staff can review consented case, read AI summary, and post human-authored final reply.
- All visible policy links pass Pennsylvania official-source validation.
- App is reachable by a public URL and works on desktop and mobile.
