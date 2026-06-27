# Modal transcription compute

The transcription pipeline (ffmpeg + faster-whisper + optional WhisperX/pyannote
diarization). This is the one piece that runs off Convex, because Convex can't run
ffmpeg or a GPU model. Modal gives on-demand GPU that scales to zero between jobs.

| File | Role |
|---|---|
| `transcribe.py` | Modal app: `transcribe` web endpoint (Convex calls it) + `Transcriber` GPU class |
| `requirements.txt` | Mirror of the image deps, for local tooling only (Modal builds from the image) |

## Flow

```
Convex action  ──POST /transcribe (Bearer MODAL_AUTH_TOKEN)──►  Modal web endpoint
                                                                  └─ spawns Transcriber.run (GPU)
Modal job  ──POST /modal/transcript (x-callback-secret)──►  Convex httpAction  ──►  jobs row (live UI)
```

The request/response shapes mirror `@audio-unpack/core` (the TypeScript schemas are the
source of truth): inbound ≈ `transcribeTaskPayloadSchema`, callback ≈ `transcriptCallbackSchema`.

## Setup

```bash
pip install modal
modal token new                      # one-time auth

# Secret the app reads at runtime (Convex callback config + HF token for pyannote):
modal secret create audio-unpack \
  CONVEX_HTTP_URL=https://<deployment>.convex.site \
  CONVEX_CALLBACK_SECRET=<shared-secret> \
  MODAL_AUTH_TOKEN=<shared-secret> \
  HF_TOKEN=<huggingface-token>       # only needed for the diarization mode
```

Diarization (`diarize: true`) uses pyannote 3.1, a **gated** model: accept its terms
once at https://huggingface.co/pyannote/speaker-diarization-3.1 with the same HF account
that owns `HF_TOKEN`.

## Run

```bash
modal serve modal/transcribe.py     # local dev: hot-reloads, prints the endpoint URL
modal deploy modal/transcribe.py    # deploy; prints the stable endpoint URL
```

Put the printed endpoint URL into Convex as `MODAL_TRANSCRIBE_URL`
(`npx convex env set MODAL_TRANSCRIBE_URL https://...modal.run`).

## Cost

faster-whisper `large-v3` on an A10G transcribes well above real-time, and Modal bills GPU
per-second only while a container is running (scales to zero otherwise). Modal's free
monthly compute credits cover low volume; switch `gpu="a10g"` to `"t4"` to trade speed for
cost. Diarization adds GPU time on top.
