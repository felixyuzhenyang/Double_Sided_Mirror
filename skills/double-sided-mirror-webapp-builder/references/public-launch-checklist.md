# Public Launch Checklist

## 1) Go-Live Controls

- Confirm role gateway exposes only `Citizen` and `Government Staff` options.
- Confirm citizen can complete intake, receive result package, and choose sync consent.
- Confirm staff can only read consented records and must provide manual final response.
- Confirm all visible citations pass Pennsylvania official-domain validation.
- Confirm risk notice appears in both citizen and staff views.

## 2) Data and Security

- Do not persist user-provided API keys to DB, logs, analytics, or error traces.
- Store only minimum case data needed for citizen-staff handoff.
- Timestamp audit events: session start, consent, draft generation, publish.
- Redact sensitive free-text when exporting logs outside operations environment.

## 3) AI Reliability Guards

- Use local policy corpus first when available.
- If no reliable citation is found, show uncertainty and recommend agency confirmation.
- Prevent raw AI draft from direct publication in staff mode.
- Add clear user text: informational support only, not legal advice.

## 4) Operations Readiness

- Validate mobile layouts for citizen chat and staff workbench.
- Smoke-test all API routes before release.
- Add uptime and error checks on production deployment.
- Record deployment metadata (date, commit hash, environment) in project logs.

## 5) Post-Launch Maintenance

- Re-validate policy links on a schedule.
- Refresh local policy corpus when agencies publish rule or form updates.
- Review random staff replies for quality and compliance drift.
- Track recurring user confusion points and update intake prompts accordingly.
