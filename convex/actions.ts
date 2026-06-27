"use node";

import { v } from "convex/values";
import { internalAction, action } from "./_generated/server";
import { api, internal } from "./_generated/api";

/**
 * Kick off the Modal transcription job for a job row.
 * POSTs to the Modal web endpoint (MODAL_TRANSCRIBE_URL) with a shared bearer token;
 * Modal spawns the GPU job and streams results back via the httpAction callback.
 * Body matches `transcribeTaskPayloadSchema` from @audio-unpack/core.
 */
export const startTranscription = internalAction({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(api.jobs.get, { jobId: args.jobId });
    if (!job) throw new Error(`job ${args.jobId} not found`);

    try {
      const endpoint = process.env.MODAL_TRANSCRIBE_URL;
      const token = process.env.MODAL_AUTH_TOKEN;
      if (!endpoint || !token) {
        throw new Error(
          "MODAL_TRANSCRIBE_URL / MODAL_AUTH_TOKEN are not set on the Convex deployment",
        );
      }
      if (!job.storageId) throw new Error("job has no storageId (file not uploaded)");
      const fileUrl = await ctx.storage.getUrl(job.storageId);
      if (!fileUrl) throw new Error("could not get a signed URL for the source audio");

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `token` authenticates the call (the Modal endpoint avoids header parsing so it
        // needs no fastapi at deploy time); the rest matches transcribeTaskPayloadSchema.
        body: JSON.stringify({
          token,
          jobId: args.jobId,
          fileUrl,
          diarize: job.diarize,
          language: job.language,
        }),
      });
      if (!res.ok) {
        throw new Error(`Modal endpoint returned ${res.status}: ${await res.text()}`);
      }

      await ctx.runMutation(internal.jobs.applyUpdate, {
        jobId: args.jobId,
        status: "queued",
      });
    } catch (err) {
      await ctx.runMutation(internal.jobs.applyUpdate, {
        jobId: args.jobId,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
});

/**
 * On-demand conversation summary. Reads the stored transcript, calls the AI SDK
 * (free Groq by default), and caches the result on the job.
 */
export const generateSummary = action({
  args: {
    jobId: v.id("jobs"),
    instructions: v.optional(v.string()),
    model: v.optional(v.union(v.literal("groq"), v.literal("anthropic"))),
  },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(api.jobs.get, { jobId: args.jobId });
    if (!job) throw new Error(`job ${args.jobId} not found`);
    if (!job.transcript) throw new Error("job has no transcript yet");

    try {
      const { summarizeConversation } = await import("@audio-unpack/core");
      const summary = await summarizeConversation(
        {
          text: job.transcript,
          segments: job.segments,
          instructions: args.instructions,
        },
        {
          GROQ_API_KEY: process.env.GROQ_API_KEY,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        },
        args.model ?? "anthropic",
      );

      await ctx.runMutation(internal.jobs.applyUpdate, {
        jobId: args.jobId,
        status: "done",
        summary,
      });

      return summary;
    } catch (err) {
      await ctx.runMutation(internal.jobs.applyUpdate, {
        jobId: args.jobId,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
});
