"use client";

import { useState } from "react";
// import { useMutation } from "convex/react";
// import { api } from "@convex/_generated/api"; // available after `npx convex dev`

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

  // const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  // const createJob = useMutation(api.jobs.create);

  async function handleFile(_file: File) {
    setBusy(true);
    try {
      // TODO(impl):
      //   const url = await generateUploadUrl();
      //   const res = await fetch(url, { method: "POST", headers: { "Content-Type": _file.type }, body: _file });
      //   const { storageId } = await res.json();
      //   const jobId = await createJob({ storageId, fileName: _file.name, diarize });
      //   onJobCreated(jobId);
      void onJobCreated;
      throw new Error("TODO(impl): upload flow not implemented");
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
    </section>
  );
}
