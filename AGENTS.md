# AGENTS.md

Guidance for AI coding agents (Claude Code, etc.) working in this repository. This is the
canonical agent doc; `CLAUDE.md` just points here.

audio-unpack: speech-to-text + on-demand conversation summaries for audio of any format,
runnable standalone and embedded in Wix. **[PLAN.md](./PLAN.md) is the source of truth for
design decisions and the implementation checklist** — read it before non-trivial work. The
codebase is currently scaffold + early Phase 1; unfinished work is marked `TODO(impl)`.

## Commands

```bash
pnpm install                 # workspace deps (pnpm; Node >=20)

npx convex dev               # MUST be running: provisions the deployment AND generates
                             #   convex/_generated/*. Imports from ./_generated/* and the
                             #   @convex/* alias error until this has run at least once.
pnpm dev:web                 # Next.js app (apps/web) on localhost:3000
pnpm dev:modal               # `modal serve modal/transcribe.py` — needs `pip install modal`
                             #   then `modal token new`; prints the endpoint URL
pnpm deploy:modal            # deploy the Modal app; prints the stable endpoint URL

pnpm typecheck               # workspace packages (apps/*, packages/*)
npx tsc -p convex/tsconfig.json --noEmit   # convex/ is NOT a workspace package — typecheck separately
python -m py_compile modal/transcribe.py   # syntax-check the Modal app

pnpm build                   # pnpm -r build
```

No test framework is configured yet. Verification today = the two typechecks above plus the
authoritative bundle check in the running `npx convex dev` terminal. Deployment env vars live
on the Convex deployment (`npx convex env set NAME value`), not only in `.env`.

## Architecture

Four cooperating pieces, two of them across a **language boundary** (TS ⇄ Python):

- `convex/` — backend: DB, file storage, realtime queries, functions, the HTTP callback.
  Root-level Convex functions (uses the **root** `node_modules`); not a pnpm workspace.
- `modal/` — Python transcription compute on Modal (on-demand GPU, scales to zero). The
  only piece that runs ffmpeg + the model, because Convex can't.
- `apps/web/` — Next.js (App Router) standalone app + Wix iframe target.
- `packages/core/` — shared **TypeScript** types/contracts (zod) + the AI-SDK summary helper.

### The job pipeline (the core data flow)

```
upload → jobs.create (schedules startTranscription)
       → actions.startTranscription  ──POST (Bearer)──►  Modal /transcribe endpoint
                                                          └─ spawns Transcriber.run (GPU)
       Modal job ──POST (x-callback-secret)──► Convex /modal/transcript httpAction
                 → jobs.applyUpdate (patch row) → reactive jobs.get query → live UI (no polling)
```

### Conventions and invariants that aren't obvious from one file

- **The TS⇄Python contract is hand-mirrored.** `packages/core/src/types.ts` is the source of
  truth for the wire shapes: `transcribeTaskPayloadSchema` (Convex→Modal) and
  `transcriptCallbackSchema` (Modal→Convex). `modal/transcribe.py` mirrors these by hand —
  **change one side, change the other.** There is no shared transcription code; Python can't
  import the TS package.
- **`diarize` is the single switch** for speaker detection. `false` → faster-whisper only;
  `true` → faster-whisper + WhisperX/pyannote. It is selected *inside the Modal job*, not in
  TS. pyannote 3.1 is gated (needs `HF_TOKEN` + accepting its terms).
- **Validators are defined once** in `convex/schema.ts` (`jobStatusValidator`,
  `segmentValidator`) and reused by `jobs.applyUpdate`. Keep them in sync with the zod
  `jobStatusSchema` in `packages/core`.
- **`applyUpdate` patches only present fields** — it never writes `undefined`, so a
  progress-only callback won't wipe an already-stored transcript. Preserve this when editing.
- **`convex/actions.ts` is a Node action (`"use node"`)** for `fetch`/`process.env`. It must
  mark a job `failed` (with the error message) on any failure path so the UI reflects it.
- **Status lifecycle:** `uploaded → queued → normalizing → transcribing → (diarizing) → done`,
  or `failed`. Progress (0–100) rides the same callback channel as status.
- **Frontend ↔ Convex:** the browser talks to Convex directly over a websocket, so most
  components are client components. `apps/web/next.config.mjs` sets `transpilePackages` +
  `experimental.externalDir` so the app can import the root `convex/_generated` API (via the
  `@convex/*` tsconfig alias) and `@audio-unpack/core`. The client reads
  `NEXT_PUBLIC_CONVEX_URL`.
- **Storage quota:** source audio should be deleted from Convex storage after transcription
  to stay within the free tier (R2 is the later escape hatch for large files).

### Modal app shape (`modal/transcribe.py`)

Image = `apt ffmpeg` + `pip faster-whisper/whisperx`. A `Transcriber` GPU class loads the
Whisper model once in `@modal.enter()`; a `transcribe` web endpoint (bearer-authed with
`MODAL_AUTH_TOKEN`) validates and spawns the job. Runtime config comes from a Modal secret
named `audio-unpack` (`CONVEX_HTTP_URL`, `CONVEX_CALLBACK_SECRET`, `MODAL_AUTH_TOKEN`,
`HF_TOKEN`). See `modal/README.md`.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
