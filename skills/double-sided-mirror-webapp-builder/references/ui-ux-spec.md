# UI and UX Specification

## Design Direction

- Aim for trustworthy civic technology, not generic startup aesthetics.
- Use high-contrast, readable typography.
- Keep language plain and procedural.
- Default user-facing copy to English for production Pennsylvania deployments unless bilingual mode is explicitly enabled.
- Include a homepage headline slogan and two short value cards (citizen value, staff value).

## Theme Starter

- Primary: deep blue
- Secondary: slate
- Accent: civic gold
- Success: green
- Warning: amber
- Error: red

Use `../assets/theme.css` token variables as baseline values.

## Screen Blueprint

1. Landing Screen
- Headline explaining dual-sided service.
- Add civic slogan line (example style: built for Pennsylvanians, built by Pennsylvanians).
- Add short value proposition statements for citizen and government staff use cases.
- Two clear cards/buttons: `Citizen` and `Government Staff`.
- Small notice about AI assistance and verification.

2. API Key Gate (Optional)
- Show only when user-key mode is enabled.
- Ask user to paste key before first AI call.
- Explain key is session-only and not persisted.

3. Citizen Workspace
- Left: progress panel (intake -> refine -> review -> result).
- Center: chat timeline with guided questions.
- Result state: action plan, materials list, official links, flowchart.
- Footer action: consent toggle to sync with government staff.

4. Staff Workspace
- Top: identity strip.
- Left: consented case inbox with status badges.
- Center: selected case transcript and AI summary.
- Right: AI draft + human response editor + publish control.

## Interaction Rules

- Preserve full keyboard navigation.
- Keep focus states visible.
- Show loading and failure states explicitly for every AI call.
- Prevent accidental publish with confirmation modal.
- Use inline validation messages near related controls.

## Mobile Behavior

- Collapse side panes into tabs or accordions.
- Keep action buttons sticky at bottom.
- Keep chat input always reachable.
