"use client";

import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

interface JobViewProps {
  jobId: string;
}

const ACTIVE = new Set(["uploaded", "queued", "normalizing", "transcribing", "diarizing"]);

/**
 * Live job view. Subscribes to the `jobs.get` reactive query, so status, progress and
 * transcript update automatically as the Modal job writes back to Convex — no polling.
 */
export function JobView({ jobId }: JobViewProps) {
  const job = useQuery(api.jobs.get, { jobId: jobId as Id<"jobs"> });
  const generateSummary = useAction(api.actions.generateSummary);

  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  if (job === undefined) {
    return (
      <section className="job">
        <p>Loading…</p>
      </section>
    );
  }
  if (job === null) {
    return (
      <section className="job">
        <p>Job not found.</p>
      </section>
    );
  }

  const active = ACTIVE.has(job.status);

  async function handleSummarize() {
    setSummarizing(true);
    setSummaryError(null);
    try {
      await generateSummary({ jobId: jobId as Id<"jobs"> });
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : String(err));
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <section className="job">
      {/* Indeterminate while active without a number; otherwise shows the live 0–100 value. */}
      <progress
        className="job-progress"
        max={100}
        {...(job.progress !== undefined ? { value: job.progress } : {})}
      />

      <p>
        <strong>{job.fileName}</strong> — status: <code>{job.status}</code>
        {job.progress !== undefined && active ? ` (${job.progress}%)` : ""}
      </p>

      {job.status === "failed" && job.error && (
        <p role="alert">Failed: {job.error}</p>
      )}

      {job.transcript && (
        <article className="transcript">
          {job.segments && job.segments.length > 0 ? (
            job.segments.map((s, i) => (
              <p key={i}>
                {s.speaker ? <strong>{s.speaker}: </strong> : null}
                {s.text}
              </p>
            ))
          ) : (
            <p>{job.transcript}</p>
          )}
        </article>
      )}

      {job.status === "done" && (
        <div className="summary">
          {job.summary ? (
            <>
              <h3>Summary</h3>
              <p>{job.summary}</p>
            </>
          ) : (
            <button type="button" onClick={() => void handleSummarize()} disabled={summarizing}>
              {summarizing ? "Summarizing…" : "Generate summary"}
            </button>
          )}
          {summaryError && <p role="alert">Summary error: {summaryError}</p>}
        </div>
      )}
    </section>
  );
}
