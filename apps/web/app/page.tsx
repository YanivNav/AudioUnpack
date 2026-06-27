"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { SUMMARIZE_MODELS, type SummaryModel } from "@audio-unpack/core";
import type { AvailableModels } from "@/components/JobCard";
import { Uploader } from "@/components/Uploader";
import { JobCard } from "@/components/JobCard";
import { Modal } from "@/components/Modal";
import { useIframeAutoResize } from "@/lib/iframe-resize";
import { marked } from "marked";

const renderMarkdown = (md: string) => marked.parse(md, { async: false }) as string;

const RTL_LANGS = new Set(["he", "ar", "fa", "ur", "ps", "sd", "ku", "yi"]);
const isRTL = (lang?: string) => (lang ? RTL_LANGS.has(lang) : false);

export default function Page() {
  useIframeAutoResize();
  const [modalState, setModalState] = useState<{
    jobId: Id<"jobs">;
    tab: "transcript" | "summary";
  } | null>(null);
  const jobs = useQuery(api.jobs.list);

  // Fetch which AI providers have keys on the backend (once on mount).
  const getAvailableModels = useAction(api.actions.getAvailableModels);
  const [availableModels, setAvailableModels] = useState<AvailableModels | null>(null);
  useEffect(() => {
    getAvailableModels().then(setAvailableModels);
  }, [getAvailableModels]);

  // Sort newest first and partition into processing vs completed.
  const { processing, completed } = useMemo(() => {
    if (!jobs) return { processing: undefined, completed: undefined };
    const sorted = [...jobs].sort((a, b) => b._creationTime - a._creationTime);
    const inflight = new Set(["uploaded", "queued", "normalizing", "transcribing", "diarizing"]);
    return {
      processing: sorted.filter((j) => inflight.has(j.status)),
      completed: sorted.filter((j) => !inflight.has(j.status)),
    };
  }, [jobs]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Audio Unpack
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Transcribe audio of any format, then summarize the conversation.
        </p>
      </header>

      {/* Uploader */}
      <Uploader />

      {/* Job history */}
      {processing === undefined ? (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
            Recent Jobs
          </h2>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-[var(--radius-card)] border border-slate-200 bg-white p-4"
              >
                <div className="mb-2 h-4 w-3/4 rounded bg-slate-100" />
                <div className="h-3 w-1/2 rounded bg-slate-50" />
              </div>
            ))}
          </div>
        </section>
      ) : processing.length === 0 && completed.length === 0 ? (
        <section className="mt-6">
          <p className="py-12 text-center text-sm text-slate-400">
            No jobs yet — upload a file to get started.
          </p>
        </section>
      ) : (
        <>
          {/* In-progress jobs */}
          {processing.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-600">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                Processing ({processing.length})
              </h2>
              <div className="space-y-2">
                {processing.map((job) => (
                  <JobCard
                    key={job._id}
                    jobId={job._id}
                    onOpenModal={(tab) => setModalState({ jobId: job._id, tab })}
                    availableModels={availableModels}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Completed jobs */}
          {completed.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Completed ({completed.length})
              </h2>
              <div className="space-y-2">
                {completed.map((job) => (
                  <JobCard
                    key={job._id}
                    jobId={job._id}
                    onOpenModal={(tab) => setModalState({ jobId: job._id, tab })}
                    availableModels={availableModels}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Transcript modal */}
      {modalState && (
        <TranscriptModal
          jobId={modalState.jobId}
          initialTab={modalState.tab}
          onClose={() => setModalState(null)}
          availableModels={availableModels}
        />
      )}
    </div>
  );
}

/** Transcript viewer inside the modal — reads the job reactively. */
function TranscriptModal({
  jobId,
  initialTab,
  onClose,
  availableModels,
}: {
  jobId: Id<"jobs">;
  initialTab: "transcript" | "summary";
  onClose: () => void;
  availableModels: AvailableModels | null;
}) {
  const job = useQuery(api.jobs.get, { jobId });
  const generateSummary = useAction(api.actions.generateSummary);
  const renameJob = useMutation(api.jobs.rename);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryModel, setSummaryModel] = useState<SummaryModel>("groq");
  const [tab, setTab] = useState<"transcript" | "summary">(initialTab);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  if (job === undefined) {
    return (
      <Modal open onClose={onClose} title="Loading…">
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-primary-500" />
        </div>
      </Modal>
    );
  }

  if (job === null) {
    return (
      <Modal open onClose={onClose} title="Job not found">
        <p className="py-8 text-center text-sm text-slate-400">This job no longer exists.</p>
      </Modal>
    );
  }

  const hasSegments = job.segments && job.segments.length > 0;
  const isDone = job.status === "done";
  const isFailed = job.status === "failed";

  return (
    <Modal open onClose={onClose} title={
      editingName ? (
        <input
          autoFocus
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={async () => {
            setEditingName(false);
            const trimmed = nameDraft.trim();
            if (trimmed && trimmed !== job.fileName) {
              try { await renameJob({ jobId, fileName: trimmed }); } catch {}
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") { setEditingName(false); setNameDraft(job.fileName); }
          }}
          className="w-full rounded border border-primary-300 bg-white px-2 py-1 text-lg font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-primary-200"
        />
      ) : (
        <button
          type="button"
          onClick={() => { setNameDraft(job.fileName); setEditingName(true); }}
          className="group flex items-center gap-2 text-lg font-semibold text-slate-800 hover:text-primary-600"
          title="Click to rename"
        >
          {job.fileName}
          <svg className="h-4 w-4 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
        </button>
      )
    }>
      {/* Status & metadata */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        {job.durationSeconds != null && (
            <span>
              {Math.floor(job.durationSeconds / 60)}:
              {String(Math.floor(job.durationSeconds % 60)).padStart(2, "0")}
            </span>
        )}
        {job.language && <span>· {job.language}</span>}
        {isDone && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Done</span>}
        {isFailed && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Failed</span>}
      </div>

      {/* Error */}
      {isFailed && job.error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {job.error}
          </div>
      )}
      {/* Tab bar — pinned above the scroll area */}
      <div className="-mx-6 -mt-4 mb-0 flex border-b border-slate-200 px-6 pt-1">
        <button
          type="button"
          onClick={() => setTab("transcript")}
          className={`relative px-4 pb-2.5 pt-1 text-sm font-medium transition-colors ${
            tab === "transcript"
              ? "text-primary-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-primary-600"
              : "text-slate-400 hover:text-slate-600"
          }`}
        >
          Transcript
        </button>
        <button
          type="button"
          onClick={() => setTab("summary")}
          className={`relative px-4 pb-2.5 pt-1 text-sm font-medium transition-colors ${
            tab === "summary"
              ? "text-primary-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-primary-600"
              : "text-slate-400 hover:text-slate-600"
          }`}
        >
          Summary
          {job.summary && (
            <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-[10px] text-emerald-700">
              ✓
            </span>
          )}
        </button>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Tab: Transcript */}
        {tab === "transcript" && (
          <>
            {hasSegments ? (
              <div className="space-y-2">
                {job.segments!.map((seg, i) => (
                  <div
                    key={i}
                    className="group rounded-md px-3 py-2 transition-colors hover:bg-slate-50"
                    dir={isRTL(job.language) ? "rtl" : undefined}
                  >
                    <div className="mb-0.5 flex items-center gap-2">
                      {seg.speaker && (
                        <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary-700">
                          {seg.speaker}
                        </span>
                      )}
                      <span className="text-[11px] tabular-nums text-slate-400">
                        {formatTimestamp(seg.start)} – {formatTimestamp(seg.end)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-700" dir={isRTL(job.language) ? "rtl" : undefined}>{seg.text}</p>
                  </div>
                ))}
              </div>
            ) : job.transcript ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700" dir={isRTL(job.language) ? "rtl" : undefined}>
                {job.transcript}
              </p>
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">
                {isFailed ? "No transcript — the job failed." : "No transcript yet."}
              </p>
            )}
          </>
        )}

        {/* Tab: Summary */}
        {tab === "summary" && (
          <>
            {job.summary ? (
              <div
                className="prose prose-sm max-w-none text-slate-600"
                dir={isRTL(job.language) ? "rtl" : undefined}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(job.summary) }}
              />
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">
                No summary yet — generate one from this transcript.
              </p>
            )}

            {summaryError && (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {summaryError}
              </p>
            )}
          </>
        )}
      </div>

      {/* Summary action bar — pinned below scroll, always visible for summary tab */}
      {tab === "summary" && (
        <div className="-mx-6 -mb-4 flex items-center gap-2 border-t border-slate-200 px-6 pb-1 pt-3">
          <select
            value={summaryModel}
            onChange={(e) => setSummaryModel(e.target.value as SummaryModel)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-600 focus:border-primary-300 focus:outline-none"
          >
            {SUMMARIZE_MODELS.map((m) => {
              const has = availableModels?.[m.id] ?? false;
              return (
                <option key={m.id} value={m.id} disabled={!has}>
                  {m.label}{!has ? " — no key" : ""}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            disabled={summarizing}
            onClick={async () => {
              setSummarizing(true);
              setSummaryError(null);
              try {
                await generateSummary({ jobId: job._id, model: summaryModel });
              } catch (err) {
                setSummaryError(
                  err instanceof Error ? err.message : String(err),
                );
              } finally {
                setSummarizing(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {summarizing ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Summarizing…
              </>
            ) : job.summary ? (
              "Regenerate"
            ) : (
              "Summarize"
            )}
          </button>
        </div>
      )}

    </Modal>
  );
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
