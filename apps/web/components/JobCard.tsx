"use client";

import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { SUMMARIZE_MODELS, type SummaryModel } from "@audio-unpack/core";

export type AvailableModels = Record<string, boolean>; // model id → has key

interface JobCardProps {
  jobId: Id<"jobs">;
  onOpenModal: (tab: "transcript" | "summary") => void;
  availableModels: AvailableModels | null;
}

const STATUS_STYLE: Record<string, string> = {
  uploaded: "bg-slate-100 text-slate-600",
  queued: "bg-blue-50 text-blue-700",
  normalizing: "bg-amber-50 text-amber-700",
  transcribing: "bg-amber-50 text-amber-700",
  diarizing: "bg-purple-50 text-purple-700",
  done: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  queued: "Queued",
  normalizing: "Normalizing audio",
  transcribing: "Transcribing",
  diarizing: "Assigning speakers",
  done: "Done",
  failed: "Failed",
};

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "2-digit" : undefined,
  });
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function JobCard({ jobId, onOpenModal, availableModels }: JobCardProps) {
  const job = useQuery(api.jobs.get, { jobId });
  const generateSummary = useAction(api.actions.generateSummary);
  const [model, setModel] = useState<SummaryModel>("groq");
  const [summarizing, setSummarizing] = useState(false);


  if (job === undefined) {
    return (
      <div className="animate-pulse rounded-[var(--radius-card)] border border-slate-200 bg-white p-4">
        <div className="mb-2 h-4 w-3/4 rounded bg-slate-100" />
        <div className="h-3 w-1/2 rounded bg-slate-50" />
      </div>
    );
  }

  if (job === null) return null;

  const status = job.status ?? "unknown";
  const isInFlight = ["uploaded", "queued", "normalizing", "transcribing", "diarizing"].includes(status);
  const isDone = status === "done";
  const isFailed = status === "failed";

  return (
    <div className="rounded-[var(--radius-card)] border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* Top row: file name + status badge */}
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800" title={job.fileName}>
            {job.fileName}
          </p>
          <p className="text-xs text-slate-400">
            {formatDate(job._creationTime)} · {formatTime(job._creationTime)}
            {isDone && job.durationSeconds != null
              ? ` · ${formatDuration(job.durationSeconds)}`
              : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status] ?? "bg-slate-100 text-slate-500"}`}
        >
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>

      {/* Progress bar (in-flight jobs) */}
      {isInFlight && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-primary-500 transition-all duration-700"
              style={{ width: `${job.progress ?? 0}%` }}
            />
          </div>
          {job.progress != null && (
            <p className="mt-1 text-right text-xs text-slate-400">{job.progress}%</p>
          )}
        </div>
      )}

      {/* Error (shown even when transcript exists — the error may be from summarization) */}
      {isFailed && job.error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{job.error}</p>
      )}

      {/* Actions — available whenever a transcript exists, regardless of status */}
      {job.transcript != null && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onOpenModal("transcript")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            View Transcript
          </button>

          {job.summary ? (
            <button
              type="button"
              onClick={() => onOpenModal("summary")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              View Summary
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as SummaryModel)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600 focus:border-primary-300 focus:outline-none"
              >
                {SUMMARIZE_MODELS.map((m) => {
                  const has = availableModels?.[m.id] ?? false;
                  return (
                    <option key={m.id} value={m.id} disabled={!has}>
                      {m.label}{!has ? " (no key)" : ""}
                    </option>
                  );
                })}
              </select>
              <button
                type="button"
                disabled={summarizing}
                onClick={async () => {
                  setSummarizing(true);
                  try {
                    await generateSummary({ jobId: job._id, model });
                  } catch {
                    // error surfaces via the reactive query (job.error)
                  } finally {
                    setSummarizing(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {summarizing ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                )}
                {summarizing ? "Summarizing…" : "Summarize"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
