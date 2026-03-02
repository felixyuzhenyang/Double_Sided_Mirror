# System Architecture

## Suggested Baseline Stack

- Frontend: Next.js (App Router) + TypeScript + React.
- Styling: Tailwind CSS or CSS modules with tokenized theme variables.
- Data/API: Next.js route handlers or separate API service.
- Storage:
  - Local/dev: SQLite.
  - Production: PostgreSQL.
- AI providers: OpenAI-compatible chat and embedding APIs.
- Auth pattern:
  - Citizen mode: anonymous session id.
  - Staff mode: lightweight identity entry (`name` or `employee_id`) unless enterprise SSO is requested.

## Core Components

1. Role Gateway
- Render citizen/staff choice.
- Route into isolated mode-specific layouts.

2. Citizen Conversation Engine
- Collect initial intent and structured follow-up fields.
- Evaluate completion threshold.
- Produce final action package and flowchart source data.

3. Policy Retrieval Layer
- Resolve relevant policy chunks with citations.
- Enforce Pennsylvania official-source filter.

4. Case Sync Service
- Save citizen transcript and summary only on explicit consent.
- Publish consented cases into staff inbox.

5. Staff Workbench
- List consented cases.
- Show transcript + AI summary + AI draft response.
- Require human-authored final response before publish.

6. Audit and Safety Layer
- Log consent, draft generation, and final publish events.
- Mask API keys and sensitive content in logs.

## Recommended API Surface

- `POST /api/session/start`: create anonymous or staff session.
- `POST /api/citizen/message`: append citizen message, get AI follow-up/final output.
- `POST /api/case/consent`: persist and sync case to staff inbox.
- `GET /api/staff/cases`: fetch consented cases.
- `POST /api/staff/draft`: generate staff draft response.
- `POST /api/staff/publish`: save human-authored response and mark case `responded`.

## Deployment Notes

- Keep public frontend static-friendly where possible.
- Keep AI and case endpoints server-side.
- Use production logging with redaction.
- Enable uptime checks for public URL availability.
