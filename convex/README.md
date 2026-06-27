# Convex backend

Run `npx convex dev` from the repo root to provision a deployment and generate
`convex/_generated/*` (imports from `./_generated/*` error until this runs).

| File | Role |
|---|---|
| `schema.ts` | `jobs` table (status, transcript, segments, summary) |
| `files.ts` | `generateUploadUrl` — direct browser upload to Convex storage |
| `jobs.ts` | `create` (mutation), `get`/`list` (reactive queries), `applyUpdate` (internal) |
| `actions.ts` | `startTranscription` (POSTs to Modal), `generateSummary` (ai-sdk) |
| `http.ts` | `/modal/transcript` httpAction — the Modal job writes results back here |

Set env vars on the deployment (`npx convex env set <NAME> <value>`):
`MODAL_TRANSCRIBE_URL`, `MODAL_AUTH_TOKEN`, `CONVEX_CALLBACK_SECRET`, and for summaries
`ANTHROPIC_API_KEY` (and/or `GROQ_API_KEY`).
