"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useAction } from "convex/react";
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

  // Sort: newest first (already returned desc by the query, but ensure it)
  const sorted = useMemo(
    () => (jobs ? [...jobs].sort((a, b) => b._creationTime - a._creationTime) : jobs),
    [jobs],
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          audio‑unpack
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Transcribe audio of any format, then summarize the conversation.
        </p>
      </header>

      {/* Uploader */}
      <Uploader
        onJobCreated={(jobId) => {
          setModalState({ jobId, tab: "transcript" });
        }}
      />

      {/* Job history */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Recent Jobs
        </h2>

        {sorted === undefined ? (
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
        ) : sorted.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            No jobs yet — upload a file to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {sorted.map((job) => (
              <JobCard
                key={job._id}
                jobId={job._id}
                onOpenModal={(tab) => setModalState({ jobId: job._id, tab })}
                availableModels={availableModels}
              />
            ))}
          </div>
        )}
      </section>

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
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryModel, setSummaryModel] = useState<SummaryModel>("groq");
  const [tab, setTab] = useState<"transcript" | "summary">(initialTab);

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
    <Modal open onClose={onClose} title={job.fileName}>
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

        {/* Tab: Transcript */}
        {tab === "transcript" && (
          <>
            {hasSegments ? (
              <div className="space-y-2">
                {job.segments!.map((seg, i) => (
                  <div
                    key={i}
                    className="group rounded-md px-3 py-2 transition-colors hover:bg-slate-50"
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
