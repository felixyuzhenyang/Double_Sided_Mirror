# Audit Log Specification

## Event Types

- `staff_session_started`
- `case_opened`
- `ai_draft_generated`
- `human_response_edited`
- `staff_response_published`

## Common Fields

- `event_id`
- `event_type`
- `timestamp`
- `staff_actor_id`
- `case_id`
- `request_id` (optional tracing id)

## Event-Specific Fields

- `ai_draft_generated`
  - `model_name`
  - `input_token_count`
  - `output_token_count`
- `staff_response_published`
  - `final_response_length`
  - `policy_citation_count`
  - `citizen_visible` (boolean)

## Logging Rules

- Redact secrets and API keys.
- Avoid storing unnecessary personal data.
- Keep immutable publish event records.
