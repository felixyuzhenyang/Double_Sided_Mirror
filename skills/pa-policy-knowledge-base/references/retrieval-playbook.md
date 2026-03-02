# Retrieval Playbook

## Objective

Return policy guidance with grounded, traceable citations from Pennsylvania official sources.

## Ingestion Pipeline

1. Collect URLs from allowlisted domains only.
2. Fetch source content and store raw snapshot.
3. Normalize text and split into chunks (target 400-900 tokens).
4. Preserve citation metadata on each chunk:
- source title
- source URL
- agency
- retrieval timestamp
5. Compute embeddings and store in vector index.

## Query-Time Retrieval

1. Detect user intent category (business, licensing, benefits, etc.).
2. Retrieve top-k chunks with metadata filters (`jurisdiction=PA`).
3. Re-rank for recency and procedural relevance.
4. Build response with explicit step list and citations per step.

## Fallback Policy

- If no high-confidence official source exists, return:
  - what is known,
  - what is uncertain,
  - which agency the user should contact next.
- Do not fabricate deadlines, forms, or agency names.

## Quality Checks

- Require at least one citation per major step.
- Reject output with broken or non-allowlisted links.
- Re-run validation after response assembly.
