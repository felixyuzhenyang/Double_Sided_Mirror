---
name: pa-policy-knowledge-base
description: Curate and enforce a Pennsylvania-official policy knowledge base for retrieval-augmented generation. Use when building or updating policy ingestion, citation filtering, local policy embeddings, source validation, or stale-policy monitoring for the Double-Sided Mirror web app.
---

# PA Policy Knowledge Base

## Goal

Provide a repeatable process that keeps policy retrieval restricted to Pennsylvania official sources and usable for high-quality AI guidance.

## Workflow

1. Define source boundary first.
- Allow only Pennsylvania official government domains.
- Block third-party blogs, private law firms, and social media summaries.

2. Build and maintain policy manifest.
- Store each source with agency, title, URL, topic, and update timestamp.
- Prefer stable document URLs and canonical agency pages.
- Use schema in `references/policy-manifest-schema.md`.

3. Ingest and index policy content.
- Download or snapshot source pages/documents.
- Chunk text with citation metadata preserved at chunk level.
- Build embeddings and retrieval index from local corpus when available.
- Keep a local policy manifest artifact in the app repo for offline/fallback generation.

4. Enforce citation quality at generation time.
- Run domain validation before returning links.
- Require each generated action item to map to at least one citation.
- Fall back with uncertainty notice when no official source supports a claim.

5. Monitor freshness.
- Re-check source pages periodically.
- Mark stale entries when update timestamp cannot be confirmed.
- Trigger corpus refresh when key agencies update rules or forms.
- Track `last_checked_at` and a confidence flag for each source entry.

## Script Usage

- Use `scripts/validate_pa_links.py` to validate URLs from generated responses, manifests, or citation exports.
- Example:
  - `python3 scripts/validate_pa_links.py --file citations.txt`
  - `python3 scripts/validate_pa_links.py --url https://www.pa.gov --url https://example.com`

## Output Rules

- Include only citations that pass official-domain validation.
- Include source agency and date metadata whenever available.
- Add user-facing notice when policy certainty is low.
- Prefer local corpus citations first; use live lookup only when local corpus is missing required coverage.

## Read Next

- Read `references/official-source-allowlist.md` for allowed domains and edge cases.
- Read `references/retrieval-playbook.md` for ingestion and ranking strategy.
- Read `references/policy-manifest-schema.md` for data model details.
