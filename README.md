# audio-unpack

Speech-to-text + conversation summaries for audio files **of any format**. Runs
**standalone** and **embedded in Wix**.

> This repo is currently **scaffolded only** — structure, configs, and stubs are in place;
> business logic is marked with `TODO(impl)`. The full design and the resume checklist live
> in **[PLAN.md](./PLAN.md)**.

## Stack (see PLAN.md for rationale)

- **Convex** — DB + file storage + functions + realtime + auth (`/convex`)
- **Modal** — transcription compute (on-demand GPU, scales to zero) (`/modal`)
- **faster-whisper** (Whisper large-v3) — the transcription engine, run on Modal
- **WhisperX / pyannote** — optional, opt-in speaker diarization mode
- **Vercel AI SDK** — summaries (`generateText` / `streamText`; Anthropic default, Groq optional)
- **Next.js** (App Router) on **Vercel** — standalone web app & iframe target (`/apps/web`)
- **Wix CLI custom-element widget** — native Wix embed (`/apps/wix-app`, generated later)
- **Convex File Storage** for audio first; **Cloudflare R2** later if files get large

## Layout

```
convex/            Convex backend (schema, queries/mutations, actions, http callback)
modal/             Modal transcription app (ffmpeg + faster-whisper + optional WhisperX/pyannote)
apps/web/          Next.js standalone app (Convex client)
apps/wix-app/      Wix CLI app placeholder
packages/core/     Shared TS types/contracts + summary helper (ai-sdk)
```

## Getting started (once implementing)

```bash
pnpm install                # install workspace deps
cp .env.example .env        # fill in keys

npx convex dev              # provisions Convex + generates convex/_generated/*
pnpm dev:modal             # Modal local dev (needs the `modal` CLI: pip install modal)
pnpm dev:web                # standalone Next.js app
```

Accounts/tiers: Convex (free), Modal (free monthly compute credits), Vercel (free), Wix
(free). For summaries: Anthropic and/or Groq. For the diarization mode: a Hugging Face
token (gated pyannote model). See **[modal/README.md](./modal/README.md)** for Modal setup.

## Note on generated code

`convex/_generated/`, `apps/web/.next/`, and the workspace `node_modules` don't exist until
you run `pnpm install`, `npx convex dev`, and `next dev`. Imports from `./_generated/*` and
`@convex/*` will show as errors until then — that's expected for a fresh scaffold.
