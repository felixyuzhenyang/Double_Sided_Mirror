# Data Contracts

## Entities

## `ConversationSession`

- `id`: string
- `mode`: `citizen` | `staff`
- `actor_id`: string (anonymous id for citizen; name/employee id for staff)
- `created_at`: ISO timestamp
- `updated_at`: ISO timestamp
- `status`: `active` | `closed`

## `CaseRecord`

- `id`: string
- `citizen_session_id`: string
- `intent_title`: string
- `citizen_summary`: string
- `transcript`: array of message objects
- `action_plan`: array of ordered steps
- `flowchart_mermaid`: string
- `citations`: array of citation objects
- `sync_consent`: boolean
- `sync_consent_at`: ISO timestamp or null
- `status`: `new` | `in_review` | `responded`
- `created_at`: ISO timestamp
- `updated_at`: ISO timestamp

## `StaffResponse`

- `id`: string
- `case_id`: string
- `staff_actor_id`: string
- `ai_draft`: string
- `human_response`: string
- `published_at`: ISO timestamp

## Message Shape

```json
{
  "role": "user | assistant | system",
  "content": "string",
  "timestamp": "ISO-8601"
}
```

## Citation Shape

```json
{
  "title": "string",
  "url": "https://...",
  "agency": "string",
  "published_or_updated": "string",
  "snippet": "string"
}
```

## Minimal Validation Rules

- Reject any final output with empty citation list.
- Reject citations that fail Pennsylvania official-domain validation.
- Reject case sync when `sync_consent` is false.
- Reject staff publish when `human_response` is empty or below minimum quality thresholds.
