# Policy Manifest Schema

## Purpose

Define a stable metadata shape for all ingested Pennsylvania policy sources.

## JSON Schema (logical)

```json
{
  "id": "string",
  "agency": "string",
  "title": "string",
  "topic_tags": ["string"],
  "url": "https://...",
  "document_type": "webpage | pdf | form | bulletin",
  "published_date": "YYYY-MM-DD or null",
  "last_verified_at": "ISO timestamp",
  "jurisdiction": "PA",
  "language": "en",
  "notes": "string"
}
```

## Required Fields

- `id`
- `agency`
- `title`
- `url`
- `last_verified_at`
- `jurisdiction`

## Validation Rules

- `url` must pass official-domain validator.
- `jurisdiction` must be `PA`.
- `last_verified_at` must be updated on every validation run.
- Reject entries without agency attribution.
