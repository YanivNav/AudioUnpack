"use client";

// import { useQuery, useAction } from "convex/react";
// import { api } from "@convex/_generated/api"; // available after `npx convex dev`

interface JobViewProps {
  jobId: string;
}

/**
 * Live job view. Subscribes to the `jobs.get` reactive query, so status and transcript
 * update automatically as the Modal job writes back to Convex — no polling.
 */
export function JobView({ jobId }: JobViewProps) {
  // const job = useQuery(api.jobs.get, { jobId: jobId as Id<"jobs"> });
  // const generateSummary = useAction(api.actions.generateSummary);

  // TODO(impl): render job.status (uploaded → normalizing → transcribing → diarizing? → done),
  //   the transcript (segments with speaker labels when present), and a
  //   "Generate summary" button that calls generateSummary({ jobId }) and shows job.summary.

  return (
    <section className="job">
      {/* Progress bar driven by the reactive `progress` field (0–100), updated live as the
          Modal job reports through the Convex callback. Omitting `value` renders an
          indeterminate bar; once wired use `value={job?.progress ?? 0}`. */}
      <progress className="job-progress" max={100} /* value={job?.progress ?? 0} */ />
      <p>
        Job <code>{jobId}</code> — TODO(impl): live status, transcript, and summary button.
      </p>
    </section>
  );
}
