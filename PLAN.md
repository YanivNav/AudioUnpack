# audio-unpack — Implementation Plan

> **Status:** Scaffolded (structure + configs + stubs). No business logic implemented yet.
> Each stub file marks its work with `TODO(impl)`. Pick up at **Implementation phases** below.

A speech-to-text app that takes audio files **of any format**, transcribes them, and can
generate a conversation **summary** on demand. Runs **standalone** and **embedded in Wix**.
Speaker recognition (diarization) is an **opt-in mode** per job.

---

## Chosen stack

| Concern | Choice |
|---|---|
| Frontend | **Next.js** (App Router) |
| Backend / DB / realtime / auth | **Convex** |
| Storage | **Convex File Storage** first, **Cloudflare R2** later if files get large |
| Transcription compute | **Modal** (serverless, on-demand GPU) |
| Transcription engine | **faster-whisper** (Whisper large-v3, CTranslate2) |
| Speaker detection | **WhisperX / pyannote** — optional, opt-in mode |
| Summaries | **Vercel AI SDK** `generateText` / `streamText` |
| Hosting | **Vercel** |

---

## Key decisions that shaped this plan

- **Compute is Modal, not trigger.dev.** trigger.dev is CPU-only; Whisper on CPU runs ≈
  real-time or slower (a 1h file ≈ 1h of compute) and gives no GPU. **Modal** provides
  on-demand **GPU** that **scales to zero** between jobs and bills per-second only while a
  container runs — the right shape for spiky transcription work.
- **The engine is self-run faster-whisper, not a transcription API.** `faster-whisper`
  is a CTranslate2 reimplementation of Whisper that runs **many× real-time on GPU** (a 1h
  file in a couple of minutes on an A10G). We run the same Whisper large-v3 quality we'd
  get from an API, but on our own compute — no per-minute transcription fee, full control
  over chunking/VAD/output, and no 25MB request ceiling to design around.
- **Diarization is an opt-in mode via WhisperX + pyannote.** Whisper alone produces **no
  speaker labels**. When the user ticks "speaker recognition", the Modal job adds
  **WhisperX** (word-level alignment) + **pyannote 3.1** (speaker diarization) on top of the
  same transcript. pyannote 3.1 is a **gated** Hugging Face model: it needs an `HF_TOKEN`
  and a one-time acceptance of its terms. Kept behind the per-job `diarize` flag so the
  default path stays lean.
- **Convex is the backend** — DB + file storage + functions + realtime + auth in one. Its
  **reactive queries** stream live job status/progress to the UI (no polling). Convex
  **can't** run ffmpeg or a GPU model (no system binaries; action time/memory limits), so
  Modal owns the entire transcribe step and writes results back via an httpAction callback.
- **Storage starts on Convex, moves to R2 if needed.** Convex File Storage keeps everything
  in one platform for v1. Delete source audio after transcription to stay within the free
  storage quota; if originals must be retained or files get large, move audio to
  **Cloudflare R2** (the rest of the pipeline is unchanged — Modal just fetches a different
  signed URL).
- **One SDK for summaries.** The **Vercel AI SDK** (`generateText` / `streamText`) produces
  on-demand conversation summaries from a Convex action. Default to Anthropic for quality;
  Groq is a free alternative. This is independent of the transcription path.
- **Next.js on Vercel** for the frontend (see rationale below) — first-class Vercel hosting,
  room to SSR public/marketing pages later, while Convex stays the backend.

---

## Architecture overview

```
            ┌─────────────────────────┐        ┌──────────────────────────┐
  Standalone │ Web app (Next.js)        │   Wix  │ A) <iframe> embed (v1)    │
   frontend  │  - upload UI             │ embed  │ B) Custom-element widget  │
             │  - transcript + summary  │◄──────►│    (Wix CLI, reuses API)  │
             └────────────┬────────────┘        └──────────────────────────┘
                          │ Convex client (reactive subscriptions — live status, no polling)
                          ▼
            ┌─────────────────────────────────────────────────────────┐
            │ CONVEX  (DB + file storage + functions + realtime + auth)│
            │  - generateUploadUrl(); store file in Convex storage      │
            │  - jobs/transcripts tables; reactive queries → live UI    │
            │  - action: POST to the Modal endpoint to start a job      │
            │  - action: on-demand summary (ai-sdk generateText)        │
            │  - httpAction: /modal/transcript callback Modal writes to  │
            └───────┬──────────────────────────────────┬───────────────┘
                    │ POST (Bearer MODAL_AUTH_TOKEN)    │ ai-sdk generateText
                    ▼                                    ▼
        ┌────────────────────────────────────┐  ┌────────────────────┐
        │ MODAL (GPU, scales to zero)        │  │ Anthropic (default) │
        │  1. ffmpeg → 16k mono WAV          │  │  or Groq (free)     │
        │  2. faster-whisper (large-v3)      │  └────────────────────┘
        │  3. if diarize: WhisperX + pyannote│
        │  4. POST result/progress back to   │
        │     Convex (/modal/transcript)     │
        └────────────────────────────────────┘
   Storage/DB: Convex (delete source audio post-transcribe to stay within free storage;
               move audio to Cloudflare R2 later if files get large or must be retained)
```

---

## Tech stack decisions

| Concern | Choice | Why |
|---|---|---|
| Transcription compute | **Modal** (serverless GPU, scales to zero) | On-demand GPU billed per-second; right fit for spiky jobs; Convex can't run ffmpeg/GPU |
| Transcription engine | **faster-whisper** (Whisper large-v3, CTranslate2) | Many× real-time on GPU, Whisper-quality, self-run (no per-minute fee, no 25MB cap) |
| Speaker detection (opt-in) | **WhisperX** (alignment) + **pyannote 3.1** (diarization) | The path to real speaker labels; gated behind the per-job `diarize` flag |
| Backend: DB + storage + API + realtime + auth | **Convex** | One platform for data, file storage, functions and **reactive queries** (live status, no polling) |
| Storage | **Convex File Storage** → **Cloudflare R2** later | Single platform for v1; R2 when files get large or originals must be kept |
| Audio normalization | **ffmpeg** in the Modal image (any format → 16kHz mono WAV) | faster-whisper decodes anything ffmpeg reads; runs in the same job, no separate service |
| Summaries | **Vercel AI SDK** `generateText`/`streamText` from a Convex action | Just a fetch, well under Convex's action limit; Anthropic default, Groq free option |
| Standalone frontend | **Next.js** (App Router) on **Vercel** | First-class Vercel hosting; SSR-ready for public pages later; Convex client for live state |
| Wix integration | **Both**: (A) iframe embed first, (B) Wix CLI **custom-element site widget** | A ships fast to validate; B is the native, polished embed |

**Cost posture.** No per-minute transcription API fee — we run the model ourselves on
Modal and pay **GPU seconds only while a job runs** (scales to zero otherwise). Modal's
**free monthly compute credits** cover low volume; pick the GPU to trade speed for cost
(`t4` cheaper, `a10g` faster for large-v3). Diarization adds GPU time and needs a free
Hugging Face token. Watch Convex's free **file-storage** quota — delete source audio after
transcription (or move to R2). *(Verify current Modal/Convex free-tier numbers before
relying on them.)*

---

## Repository layout (this scaffold)

```
/convex           Convex backend: schema, queries/mutations, actions, httpAction callback
/modal            Modal app (Python): ffmpeg + faster-whisper + optional WhisperX/pyannote
/apps
  /web            Next.js standalone app (Convex client) — also the iframe target
  /wix-app        Wix CLI app placeholder (generate with the Wix CLI later)
/packages
  /core           shared TS types/contracts (job/segment/callback schemas) + summary helper (ai-sdk)
```

### The contract between Convex and Modal

Transcription runs in **Python on Modal**, so there is no shared TypeScript provider class.
Instead `packages/core` holds the **wire contract** as the TS source of truth, and the Modal
app (`modal/transcribe.py`) mirrors the same shapes:

```ts
// Convex → Modal (POST body)            ≈ transcribeTaskPayloadSchema
{ jobId, fileUrl, diarize, language }

// Modal → Convex (/modal/transcript)    ≈ transcriptCallbackSchema
{ jobId, status, progress?, result?, error? }
```

The job's `diarize` flag is the single switch: `false` → faster-whisper only; `true` →
faster-whisper + WhisperX/pyannote. It's selected inside the Modal job, not in TS.

---

## Pipeline flow (one job)

1. **Upload** — frontend calls Convex `generateUploadUrl()`, uploads the file to Convex
   storage, then a mutation creates a `job` doc (status `uploaded`, `diarize` flag,
   storage id). The UI subscribes to that job via a reactive query.
2. **Trigger** — a Convex action POSTs `{ jobId, fileUrl, diarize, language }` to the Modal
   web endpoint (`MODAL_TRANSCRIBE_URL`) with a `Bearer MODAL_AUTH_TOKEN` header. Modal
   spawns the GPU job and returns immediately; the job sets status `queued`.
3. **Modal job** (`modal/transcribe.py`):
   - download the source audio from the signed Convex URL.
   - `ffmpeg` → 16kHz mono WAV.
   - `faster-whisper` (large-v3) → text + timed segments.
   - if `diarize`: WhisperX alignment + pyannote 3.1 → assign `speaker` to each segment.
   - POST status + final transcript back to Convex via `/modal/transcript`.
   - optionally delete the source audio from Convex storage to stay within free quota.
4. **Summary (on demand)** — a Convex action runs `generateText` (ai-sdk) over the stored
   transcript with a conversation-summary prompt; caches the result on the job doc.

### Progress reporting (progress bar)

Progress rides the **same channel as status** (Modal → Convex callback → reactive query),
so it's purely additive — no new mechanism. A `progress` field (0–100) on the `jobs` row
drives a `<progress>` bar in the UI. The Modal job reports it in **throttled** updates
(~1/sec) split across stages: **download+normalize → 0–15**, **transcription → 15–85**,
**diarization → 85–100** (or transcription → 100 when `diarize` is off), **done → 100**.

Granularity notes:
- faster-whisper yields segments as it decodes, so transcription progress is fine-grained
  (use `segment.end / info.duration`); ffmpeg progress is continuous.
- A true *upload* progress bar needs `XMLHttpRequest` (`upload.onprogress`), not `fetch`.

Plumbing is already scaffolded: `progress` on `convex/schema.ts` + `jobs.applyUpdate`,
`transcriptCallbackSchema` in core, and `report()`/`scale()` helpers plus the staged
constants in `modal/transcribe.py`, and a `<progress>` element in `apps/web` `JobView`.

---

## Wix integration (both paths)

- **A) iframe (ship first):** deploy `apps/web` to Vercel, embed via Wix's HTML/iframe
  element. Handle responsive height (postMessage resize — already stubbed in
  `lib/iframe-resize.ts`) and separate-origin auth.
- **B) Custom-element site widget (native):** `npm create @wix/app` (unified Wix CLI,
  Astro-based) → `npm run generate` a **site widget** (custom element). Uses the Convex
  client directly. No iframe sandbox issues; best UX.

---

## Implementation phases (resume here)

1. **Convex + Modal pipeline (headless):** finish `convex/schema.ts`, upload-url mutation,
   the Modal-trigger action, and the `/modal/transcript` httpAction. Implement
   `modal/transcribe.py` (ffmpeg + faster-whisper). Prove end-to-end on `.m4a`/`.mp3`/`.mov`.
2. **Standalone web UI:** wire `Uploader` + `JobView` to Convex; live status via reactive
   query; "speaker recognition" toggle; "Generate summary" button.
3. **Summary:** implement the Convex `generateSummary` action (ai-sdk), cached on job.
4. **Wix A (iframe):** deploy web app to Vercel; embed; postMessage resize.
5. **Wix B (custom element):** Wix CLI app + site-widget extension using the Convex client.
6. **Diarization mode (opt-in):** add WhisperX + pyannote to the Modal job; route when the
   toggle is on; surface the speaker labels (and any cost note) in the UI.

---

## Future architecture: auth, billing, SEO

Captured so we don't re-litigate it later. **None of the below is needed for v1.**

### Layering model (the key idea)

Convex and Next.js solve **different layers** — they are complementary, not alternatives:

| Layer | Owner |
|---|---|
| Data, business logic, realtime, file storage, webhooks, **auth checks**, **billing state** | **Convex** (the actual backend) |
| Page rendering (SSR/SSG), routing, edge middleware, request-time server glue | **Next.js** |

**Rule:** keep all business logic + data in Convex and keep Next's server side **thin**
(rendering + auth redirects only). Never split the backend across both — that's the trap
that makes people think the two compete.

### Why Next.js (on Vercel)

Next.js is the first-class Vercel target (zero-config deploys, edge/serverless), and the App
Router lets us SSR **public** pages (landing, pricing, blog) when SEO matters while the
authenticated app surface stays a Convex-driven client island. The browser still talks to
Convex directly over a websocket for live state, so most of the app is client components;
Next's server half earns its keep on rendering and request-time glue, not business logic.
(Note: the Wix **custom-element widget** must be a self-contained client bundle — build that
target separately as a web component; it doesn't use Next's SSR.)

### Auth

Handled by an auth provider + Convex: Convex Auth (built-in) or Clerk/Auth0/WorkOS. The
Convex client holds the session; Convex functions enforce it via `ctx.auth`. With Next.js we
can additionally enforce **server-side** (redirect before render via middleware, no flash,
cookie sessions) for gated pages.

### Billing / pricing plans

Stripe + Convex: a Convex **HTTP action** receives Stripe webhooks, a Convex **action**
creates the Checkout session, and subscription state lives in a Convex table that functions
read to gate features. The pricing *page* is just UI — SSR'd by Next when we want it indexed.

### SEO / SSR

Next.js server-renders the **public** marketing pages so crawlers get HTML; the
authenticated app stays a client island. Additive — doesn't touch `packages/core`,
`convex/`, or `modal/`.

## Environment / accounts needed

- **Convex** project (free; `NEXT_PUBLIC_CONVEX_URL` for the web app).
- **Modal** account + CLI (`pip install modal`, `modal token new`). A Modal **secret** named
  `audio-unpack` carrying `CONVEX_HTTP_URL`, `CONVEX_CALLBACK_SECRET`, `MODAL_AUTH_TOKEN`,
  and `HF_TOKEN`. On the Convex side: `MODAL_TRANSCRIBE_URL`, `MODAL_AUTH_TOKEN`,
  `CONVEX_CALLBACK_SECRET`.
- **Hugging Face** token (`HF_TOKEN`) + accept the gated pyannote 3.1 terms — only for the
  diarization mode.
- **Summaries:** `ANTHROPIC_API_KEY` (default) and/or `GROQ_API_KEY` (free option).
- **Vercel** (deploy `apps/web`) and a **Wix** dev account (free).

See `.env.example` and `modal/README.md`.

---

## Verification

- **Pipeline:** `modal serve modal/transcribe.py`; run mp3/m4a/wav and a video .mov (proves
  ffmpeg audio extraction); confirm a correct transcript and that long files complete.
- **Compute sanity:** a 1h file transcribes on Modal GPU in a few minutes; container scales
  to zero afterward; cost stays within Modal's free credits at test volume.
- **Diarization mode:** toggle on → segments carry `speaker` labels (WhisperX + pyannote);
  off → plain faster-whisper path.
- **Realtime:** UI status + progress update live as the Modal job writes back to Convex
  (no polling).
- **Summary:** "Generate summary" → coherent, cached summary.
- **Standalone / Wix A / Wix B:** full upload→transcript→summary in each surface.

---

## Sources

- Modal (GPU, serverless, pricing/free credits): https://modal.com/docs · https://modal.com/pricing
- faster-whisper: https://github.com/SYSTRAN/faster-whisper
- WhisperX (alignment + diarization): https://github.com/m-bain/whisperX
- pyannote speaker diarization 3.1 (gated): https://huggingface.co/pyannote/speaker-diarization-3.1
- Vercel AI SDK (generateText/streamText): https://ai-sdk.dev/docs
- Convex limits/actions/file-storage: https://docs.convex.dev/production/state/limits · https://docs.convex.dev/functions/actions · https://docs.convex.dev/file-storage
- Next.js on Vercel: https://nextjs.org/docs · https://vercel.com/docs/frameworks/nextjs
- Cloudflare R2 (later): https://developers.cloudflare.com/r2/
- Wix unified CLI / site widgets: https://dev.wix.com/docs/wix-cli/guides/about-the-wix-cli
```
