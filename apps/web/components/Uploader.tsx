"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

interface UploaderProps {
  onJobCreated: (jobId: string) => void;
}

/**
 * Upload flow:
 *   1. generateUploadUrl() (Convex mutation)
 *   2. POST the file directly to that URL → { storageId }
 *   3. jobs.create({ storageId, fileName, diarize, language }) → jobId
 *
 * The "speaker recognition" toggle is the single per-job switch that opts into the
 * diarization mode (WhisperX/pyannote). Default OFF runs plain faster-whisper on Modal.
 */
export function Uploader({ onJobCreated }: UploaderProps) {
  const [diarize, setDiarize] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const createJob = useMutation(api.jobs.create);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error(`upload failed (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: string };

      const jobId = await createJob({
        storageId: storageId as Id<"_storage">,
        fileName: file.name,
        diarize,
      });
      onJobCreated(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="uploader">
      <label className="toggle">
        <input
          type="checkbox"
          checked={diarize}
          disabled={busy}
          onChange={(e) => setDiarize(e.target.checked)}
        />
        Speaker recognition (extra compute — see PLAN.md)
      </label>

      <input
        type="file"
        accept="audio/*,video/*"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      {busy && <p>Uploading…</p>}
      {error && <p role="alert">Error: {error}</p>}
    </section>
  );
}
