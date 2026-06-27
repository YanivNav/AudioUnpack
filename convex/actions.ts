"use node";

import { v } from "convex/values";
import { internalAction, action } from "./_generated/server";

/**
 * Kick off the Modal transcription job for a job row.
 * POSTs to the Modal web endpoint (MODAL_TRANSCRIBE_URL) with a shared bearer token;
 * Modal spawns the GPU job and streams results back via the httpAction callback.
 */
export const startTranscription = internalAction({
  args: { jobId: v.id("jobs") },
  handler: async (_ctx, _args) => {
    // TODO(impl):
    //   1. const job = await ctx.runQuery(api.jobs.get, { jobId: args.jobId });
    //   2. const fileUrl = await ctx.storage.getUrl(job.storageId); // signed URL
    //   3. POST to Modal, matching transcribeTaskPayloadSchema from @audio-unpack/core:
    //      await fetch(process.env.MODAL_TRANSCRIBE_URL!, {
    //        method: "POST",
    //        headers: {
    //          "Content-Type": "application/json",
    //          Authorization: `Bearer ${process.env.MODAL_AUTH_TOKEN}`,
    //        },
    //        body: JSON.stringify({ jobId: args.jobId, fileUrl, diarize: job.diarize, language: job.language }),
    //      });
    //   4. await ctx.runMutation(internal.jobs.applyUpdate, { jobId: args.jobId, status: "queued" });
    throw new Error("TODO(impl): startTranscription not implemented");
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
  handler: async (_ctx, _args) => {
    // TODO(impl):
    //   1. const job = await ctx.runQuery(api.jobs.get, { jobId: args.jobId });
    //   2. import { summarizeConversation } from "@audio-unpack/core";
    //      const summary = await summarizeConversation(
    //        { text: job.transcript ?? "", segments: job.segments, instructions: args.instructions },
    //        { GROQ_API_KEY: process.env.GROQ_API_KEY, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
    //        args.model ?? "anthropic");
    //   3. await ctx.runMutation(internal.jobs.applyUpdate, { jobId: args.jobId, status: "done" }); // + summary patch
    //   4. return summary;
    throw new Error("TODO(impl): generateSummary not implemented");
  },
});
