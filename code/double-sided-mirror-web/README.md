# Double-Sided Mirror Web App (PA Prototype)

## What this build includes

- Role gateway with two paths only: `Citizen` and `Government Staff`.
- Citizen multi-turn intake workflow:
  - guided follow-up questions,
  - final `Anything else to add?` check,
  - ordered action plan + materials + PA-official citations,
  - Mermaid flowchart source + visual step map,
  - explicit sync consent toggle.
- Staff workflow:
  - identity entry (`name` or `employee_id` style string),
  - inbox with only consented cases,
  - AI draft generation,
  - required manual rewrite before publish,
  - published human response visible in citizen mode.
- API key modal (session memory only, not written to DB/logs).
- PA official-domain validation (`pa.gov`, `state.pa.us`, `pacodeandbulletin.gov`, `legis.state.pa.us`).
- Seeded local policy manifest to reduce repeated web lookup.
- Audit events for session start, citizen result, consent sync, staff draft, and publish.

## Run locally

```bash
cd code/double-sided-mirror-web
npm install
npm run dev
```

Open: [http://localhost:3000](http://localhost:3000)

## Data files

- Runtime DB: `data/runtime-db.json`
- Local policy manifest: `data/policy-manifest.json`

## Deployment options (public URL)

### Vercel

```bash
npm install -g vercel
vercel
vercel --prod
```

### Netlify

```bash
npm install -g netlify-cli
netlify deploy
netlify deploy --prod
```

After deploy, the platform returns a public URL that can be shared with any user.

## Compliance notes

- All displayed citations are filtered to Pennsylvania official domains.
- Output includes user-facing risk notice: informational support only, verify with agency staff, not legal advice.
- The final staff response is human-authored and required before publishing.
