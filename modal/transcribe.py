"""
audio-unpack transcription compute — Modal.

This is the ONLY job that lives off-Convex (Convex can't run ffmpeg or a GPU model).
Modal gives us on-demand GPU that scales to zero between jobs.

Pipeline (one job):
  1. download source audio from the signed Convex storage URL
  2. ffmpeg → 16kHz mono WAV (faster-whisper decodes anything ffmpeg can read)
  3. transcribe with faster-whisper (Whisper large-v3, CTranslate2) → segments
  4. if diarize=true → WhisperX word alignment + pyannote 3.1 → speaker labels (optional mode)
  5. POST status/progress/result back to the Convex httpAction callback as it goes

The request/response contract mirrors `@audio-unpack/core` (TS is the source of truth):
  - inbound payload      ≈ transcribeTaskPayloadSchema  (jobId, fileUrl, diarize, language)
  - outbound callback    ≈ transcriptCallbackSchema      (jobId, status, progress, result, error)

Run locally:   modal serve modal/transcribe.py
Deploy:        modal deploy modal/transcribe.py
Secrets:       a Modal secret named "audio-unpack" providing
               CONVEX_HTTP_URL, CONVEX_CALLBACK_SECRET, MODAL_AUTH_TOKEN, HF_TOKEN
"""

from __future__ import annotations

import os

import modal

# ---------------------------------------------------------------------------
# Image: ffmpeg + the Python transcription stack. faster-whisper is the engine;
# whisperx + pyannote are pulled in only for the opt-in diarization mode.
# ---------------------------------------------------------------------------
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "faster-whisper==1.1.1",
        "whisperx==3.3.1",  # word-level alignment + pyannote diarization (opt-in)
        "httpx==0.28.1",
        "pydantic==2.11.0",
    )
)

app = modal.App("audio-unpack-transcribe")

# Cache model weights across cold starts so we only download Whisper/pyannote once.
model_volume = modal.Volume.from_name("audio-unpack-models", create_if_missing=True)
MODEL_DIR = "/models"

# Secret carrying the Convex callback config + HF token (for gated pyannote weights).
secret = modal.Secret.from_name("audio-unpack")

# Progress is split across stages, mirrored to Convex so the UI bar moves live:
#   download+normalize → 0–15, transcribe → 15–85, diarize → 85–100 (or transcribe → 100).
STAGE_NORMALIZE = (0, 15)
STAGE_TRANSCRIBE = (15, 85)
STAGE_DIARIZE = (85, 100)


@app.cls(
    image=image,
    gpu="a10g",  # T4 is cheaper/slower; A10G is a good price/perf default for large-v3
    volumes={MODEL_DIR: model_volume},
    secrets=[secret],
    timeout=3600,
    scaledown_window=300,  # keep warm 5 min to amortize cold starts, then scale to zero
)
class Transcriber:
    @modal.enter()
    def load(self) -> None:
        """Load the Whisper model once per container (kept warm by scaledown_window)."""
        from faster_whisper import WhisperModel

        self.model = WhisperModel(
            "large-v3",
            device="cuda",
            compute_type="float16",
            download_root=MODEL_DIR,
        )

    @modal.method()
    def run(self, payload: dict) -> None:
        """Transcribe one job end-to-end and stream results back to Convex."""
        job_id = payload["jobId"]
        file_url = payload["fileUrl"]
        diarize = bool(payload.get("diarize", False))
        language = payload.get("language")

        try:
            report(job_id, "normalizing", progress=STAGE_NORMALIZE[0])

            # TODO(impl) 1: download file_url → a temp path (httpx stream).
            # TODO(impl) 2: ffmpeg → 16kHz mono WAV; report continuous progress into
            #   STAGE_NORMALIZE via `scale(done/total, *STAGE_NORMALIZE)`.
            audio_path = "/tmp/input.wav"  # placeholder

            report(job_id, "transcribing", progress=STAGE_TRANSCRIBE[0])
            # TODO(impl) 3: segments, info = self.model.transcribe(audio_path, language=language)
            #   Accumulate segments; report per-segment progress into STAGE_TRANSCRIBE using
            #   info.duration as the denominator (segment.end / info.duration).
            result: dict = {"text": "", "segments": []}  # placeholder
            _ = (audio_path, language)

            if diarize:
                report(job_id, "diarizing", progress=STAGE_DIARIZE[0])
                # TODO(impl) 4: WhisperX align + pyannote 3.1 diarization (needs HF_TOKEN +
                #   accepting the gated pyannote/speaker-diarization-3.1 terms once on HF).
                #   Assign result["segments"][i]["speaker"] = "A"/"B"/... by overlap.

            report(job_id, "done", progress=100, result=result)
        except Exception as exc:  # surface failures to the UI instead of dying silently
            report(job_id, "failed", error=str(exc))
            raise


@app.function(image=image, secrets=[secret])
@modal.fastapi_endpoint(method="POST")
def transcribe(payload: dict, authorization: str = "") -> dict:
    """
    HTTP entrypoint the Convex `startTranscription` action POSTs to.
    Authenticates with a shared bearer token, then spawns the GPU job async and
    returns immediately (results arrive via the Convex callback).
    """
    expected = os.environ["MODAL_AUTH_TOKEN"]
    if authorization != f"Bearer {expected}":
        from fastapi import HTTPException

        raise HTTPException(status_code=401, detail="bad token")

    # TODO(impl): validate payload shape (jobId, fileUrl, diarize, language) before spawning.
    Transcriber().run.spawn(payload)
    return {"accepted": True, "jobId": payload.get("jobId")}


def report(
    job_id: str,
    status: str,
    *,
    progress: float | None = None,
    result: dict | None = None,
    error: str | None = None,
) -> None:
    """
    POST a status/progress/result update to the Convex httpAction callback.
    Mirrors `transcriptCallbackSchema` from @audio-unpack/core.
    """
    import httpx

    url = f"{os.environ['CONVEX_HTTP_URL']}/modal/transcript"
    body: dict = {"jobId": job_id, "status": status}
    if progress is not None:
        body["progress"] = round(progress)
    if result is not None:
        body["result"] = result
    if error is not None:
        body["error"] = error

    # TODO(impl): throttle frequent progress posts to ~1/sec so we don't hammer Convex.
    httpx.post(
        url,
        json=body,
        headers={"x-callback-secret": os.environ["CONVEX_CALLBACK_SECRET"]},
        timeout=30,
    )


def scale(ratio: float, lo: float, hi: float) -> float:
    """Map a 0–1 ratio into a [lo, hi] sub-range for a pipeline stage."""
    return lo + max(0.0, min(1.0, ratio)) * (hi - lo)
