"""
audio-unpack transcription compute — Modal.

This is the ONLY job that lives off-Convex (Convex can't run ffmpeg or a GPU model).
Modal gives on-demand GPU that scales to zero between jobs.

Pipeline (one job):
  1. download source audio from the signed Convex storage URL
  2. ffmpeg → 16kHz mono WAV
  3. transcribe with faster-whisper (Whisper large-v3, CTranslate2) → segments
  4. if diarize=true → WhisperX + pyannote → speaker labels  (Phase 6, not yet implemented)
  5. POST status/progress/result back to the Convex httpAction callback as it goes

The request/response contract mirrors `@audio-unpack/core` (the TS schemas are the source
of truth): inbound ≈ transcribeTaskPayloadSchema, callback ≈ transcriptCallbackSchema.

Auth: Convex sends MODAL_AUTH_TOKEN in the request body (`token`), not a header, so the
endpoint needs no local fastapi at deploy time.

Run locally:   modal serve modal/transcribe.py
Deploy:        modal deploy modal/transcribe.py
Secrets:       a Modal secret named "audio-unpack" providing
               CONVEX_HTTP_URL, CONVEX_CALLBACK_SECRET, MODAL_AUTH_TOKEN, (HF_TOKEN for diarize)
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import time

import modal

# ---------------------------------------------------------------------------
# Image: built on NVIDIA's CUDA + cuDNN 8 runtime, because faster-whisper's CTranslate2
# backend dynamically loads libcudnn_ops_infer.so.8 at GPU inference time — a plain slim
# image has no CUDA/cuDNN and fails with "Could not load library libcudnn_ops_infer.so.8".
# fastapi[standard] is needed to *serve* the web endpoint (runs in the image, not locally).
# whisperx/pyannote (the Phase 6 diarization mode) are intentionally NOT installed yet:
# they pull in torch and pin faster-whisper, so add them back when implementing Phase 6.
# ---------------------------------------------------------------------------
image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.2.2-cudnn8-runtime-ubuntu22.04", add_python="3.11"
    )
    .apt_install("ffmpeg")
    .pip_install(
        "faster-whisper==1.1.0",
        "httpx==0.28.1",
        "fastapi[standard]",
        "requests>=2.32",
    )
    .env({"NVIDIA_DISABLE_REQUIRE": "1"})
)

app = modal.App("audio-unpack-transcribe")

# Cache model weights across cold starts so we only download Whisper once.
model_volume = modal.Volume.from_name("audio-unpack-models", create_if_missing=True)
MODEL_DIR = "/models"

# Secret carrying the Convex callback config + auth token (+ HF token for diarize).
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
    retries=0,  # fail a bad job once instead of relaunching containers in a loop
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
        language = payload.get("language") or None

        workdir = tempfile.mkdtemp(prefix="audio-unpack-")
        try:
            report(job_id, "normalizing", progress=STAGE_NORMALIZE[0])
            source = os.path.join(workdir, "source")
            download(file_url, source)
            wav = os.path.join(workdir, "audio.wav")
            ffmpeg_to_wav(source, wav)

            report(job_id, "transcribing", progress=STAGE_TRANSCRIBE[0])
            segments_iter, info = self.model.transcribe(
                wav, language=language, vad_filter=True
            )
            total = info.duration or 0.0

            out_segments: list[dict] = []
            text_parts: list[str] = []
            last_emit = 0.0
            for seg in segments_iter:
                out_segments.append(
                    {"start": seg.start, "end": seg.end, "text": seg.text.strip()}
                )
                text_parts.append(seg.text)
                # Throttle progress posts to ~1/sec; ride seg.end / total within the stage.
                now = time.monotonic()
                if total and now - last_emit >= 1.0:
                    last_emit = now
                    report(
                        job_id,
                        "transcribing",
                        progress=scale(seg.end / total, *STAGE_TRANSCRIBE),
                    )

            text = "".join(text_parts).strip()

            if diarize:
                report(job_id, "diarizing", progress=STAGE_DIARIZE[0])
                # TODO(impl) Phase 6: WhisperX align + pyannote 3.1 (needs HF_TOKEN +
                #   accepting the gated pyannote/speaker-diarization-3.1 terms once on HF).
                #   Assign out_segments[i]["speaker"] = "A"/"B"/... by time overlap.
                raise NotImplementedError(
                    "Speaker recognition (diarization) is not implemented yet."
                )

            result = {
                "text": text,
                "language": info.language,
                "durationSeconds": info.duration,
                "segments": out_segments,
            }
            report(job_id, "done", progress=100, result=result)
        except Exception as exc:  # surface failures to the UI instead of dying silently
            report(job_id, "failed", error=str(exc))
            raise
        finally:
            shutil.rmtree(workdir, ignore_errors=True)


@app.function(image=image, secrets=[secret])
@modal.fastapi_endpoint(method="POST")
def transcribe(payload: dict) -> dict:
    """
    HTTP entrypoint the Convex `startTranscription` action POSTs to.
    Authenticates with a shared token in the body, then spawns the GPU job async and
    returns immediately (results arrive via the Convex callback).
    """
    token = payload.pop("token", None)
    if not token or token != os.environ.get("MODAL_AUTH_TOKEN"):
        raise Exception("unauthorized")
    if not payload.get("jobId") or not payload.get("fileUrl"):
        raise Exception("jobId and fileUrl are required")

    Transcriber().run.spawn(payload)
    return {"accepted": True, "jobId": payload["jobId"]}


def download(url: str, dest: str) -> None:
    """Stream the (signed) source audio URL to a local file."""
    import httpx

    with httpx.stream("GET", url, timeout=300, follow_redirects=True) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_bytes():
                f.write(chunk)


def ffmpeg_to_wav(src: str, dest: str) -> None:
    """Normalize any audio/video input to 16kHz mono WAV (drops any video stream)."""
    proc = subprocess.run(
        ["ffmpeg", "-nostdin", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", dest],
        capture_output=True,
    )
    if proc.returncode != 0:
        tail = proc.stderr.decode("utf-8", "replace")[-2000:]
        raise RuntimeError(f"ffmpeg failed ({proc.returncode}): {tail}")


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

    httpx.post(
        url,
        json=body,
        headers={"x-callback-secret": os.environ["CONVEX_CALLBACK_SECRET"]},
        timeout=30,
    )


def scale(ratio: float, lo: float, hi: float) -> float:
    """Map a 0–1 ratio into a [lo, hi] sub-range for a pipeline stage."""
    return lo + max(0.0, min(1.0, ratio)) * (hi - lo)
