# Double_Sided_Mirror
Double-Sided Mirror is a two-sided civic service platform designed for Pennsylvania residents and government staff. 
On the Citizen side, users describe what they need in plain words, answer guided follow-up questions, and receive a structured action package with official links, required materials, and process flow.
On the Staff side, government workers review citizen-consented cases, use AI-generated draft support, and publish human-authored final responses.

## Project Structure

```text
Double_Sided_Mirror/
├── README.md
├── skills/
├── logs/
├── code/
├── references/
├── docs/
├── data/
└── assets/
```

## Folder Roles

- `skills/`: Skill definitions and reusable agent workflows.
- `logs/`: Conversation and operation logs for traceability.
- `code/`: Source code, utilities, and tests.
- `references/`: Related articles, policy resources, and external materials.
- `docs/`: Specifications, architecture notes, and internal documentation.
- `data/`: Input/processed datasets and schema notes.
- `assets/`: Static files such as images, icons, and reusable media.

# About the App

## 1. Quick Start: End-to-End Platform Workflow

This section explains the full logic chain from first citizen input to final staff response.

### Step 1: Citizen enters the platform and selects role
- User opens the platform and selects **Citizen Mode**.
- User enters API setup (prototype mode) and starts a conversation in plain language (for example: "get my pension", "take driving license", "open a restaurant").

### Step 2: AI intake captures minimum required context
- The system first confirms two core fields:
  - **Goal** (what service the citizen needs)
  - **Pennsylvania locality** (city/township/borough/county)
- Without these two fields, no final action package is generated.

### Step 3: Multi-turn guided clarification (typically 4–5 turns)
- On each turn, AI reuses prior context and asks one practical question the resident can answer.
- The question is operational (timeline, applicant type, available documents, submission channel), not legal-theory or policy-interpretation trivia.
- The objective is to reduce ambiguity and collect only decision-relevant details.

### Step 4: Policy retrieval and relevance filtering
- The system retrieves policy and process sources constrained to Pennsylvania official domains.
- It combines state-level and locality-level official sources where available.
- It filters out links unrelated to the user’s specific request scope.

### Step 5: Citizen receives final action package
- After sufficient detail is collected, AI produces:
  - Ordered action steps
  - Required documents/materials
  - Timing guidance
  - Official links/forms
  - Visual flowchart
- Citizen can add final supplements and optionally provide a display name or nickname.

### Step 6: Consent-based handoff to staff
- Citizen chooses whether to sync the case to government staff.
- If consent is given, staff can view transcript, structured summary, and AI-prepared case context.

### Step 7: Government staff review and publish human-authored response
- Staff enters **Government Staff Mode**, reviews consented cases, and generates an AI-assisted draft.
- Staff must rewrite/review and publish a **human-authored final response**.
- The citizen then sees the official staff response in the same platform.
