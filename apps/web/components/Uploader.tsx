"use client";

import { useState, useRef, type DragEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

interface UploaderProps {
  onJobCreated: (jobId: Id<"jobs">) => void;
}

export function Uploader({ onJobCreated }: UploaderProps) {
  const [diarize, setDiarize] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
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

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && !busy) void handleFile(file);
  }

  return (
    <section className="rounded-[var(--radius-card)] border border-slate-200 bg-white p-5 shadow-sm">
      {/* Toggle */}
      <label className="mb-4 flex cursor-pointer items-center gap-3">
        <span className="relative inline-flex items-center">
          <input
            type="checkbox"
            checked={diarize}
            disabled={busy}
            onChange={(e) => setDiarize(e.target.checked)}
            className="peer sr-only"
          />
          <span className="h-5 w-9 rounded-full bg-slate-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-primary-500 peer-checked:after:translate-x-4" />
        </span>
        <span className="text-sm text-slate-600">
          Speaker recognition{" "}
          <span className="text-slate-400">(takes a little longer)</span>
        </span>
      </label>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          busy
            ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
            : dragOver
              ? "border-primary-400 bg-primary-50 text-primary-600"
              : "cursor-pointer border-slate-200 bg-slate-50/50 text-slate-400 hover:border-primary-300 hover:text-primary-500"
        }`}
      >
        {busy ? (
          <>
            <svg className="h-8 w-8 animate-spin text-slate-300" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm font-medium">Uploading…</span>
          </>
        ) : (
          <>
            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-slate-500">
                Drop an audio or video file here, or click to browse
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Supports MP3, M4A, WAV, MOV, MP4, and more
              </p>
            </div>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="audio/*,video/*"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
        className="hidden"
      />

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
