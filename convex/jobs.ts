import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { jobStatusValidator, segmentValidator } from "./schema";

/** Create a job after the file has been uploaded to Convex storage. */
export const create = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    diarize: v.boolean(),
    language: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const jobId = await ctx.db.insert("jobs", {
      storageId: args.storageId,
      fileName: args.fileName,
      status: "uploaded",
      diarize: args.diarize,
      language: args.language,
    });
    // Kick off the Modal transcription job (runs in a Node action, so scheduled here).
    await ctx.scheduler.runAfter(0, internal.actions.startTranscription, { jobId });
    return jobId;
  },
});

/** Reactive query the UI subscribes to for live status + transcript. */
export const get = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => ctx.db.get(args.jobId),
});

/** Most recent jobs (for a simple history list). */
export const list = query({
  args: {},
  handler: async (ctx) => ctx.db.query("jobs").order("desc").take(50),
});

/**
 * Internal: apply a status/transcript update coming from the Modal callback.
 * Called by the httpAction in `http.ts` (and the kickoff action for "queued").
 *
 * Only fields that are actually present are patched — we never write `undefined`, which
 * would otherwise clear an already-set field on a later progress-only update.
 */
export const applyUpdate = internalMutation({
  args: {
    jobId: v.id("jobs"),
    status: jobStatusValidator,
    progress: v.optional(v.number()), // 0–100
    transcript: v.optional(v.string()),
    segments: v.optional(v.array(segmentValidator)),
    durationSeconds: v.optional(v.number()),
    summary: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Partial<Doc<"jobs">> = { status: args.status };
    if (args.progress !== undefined) patch.progress = args.progress;
    if (args.transcript !== undefined) patch.transcript = args.transcript;
    if (args.segments !== undefined) patch.segments = args.segments;
    if (args.durationSeconds !== undefined) patch.durationSeconds = args.durationSeconds;
    if (args.summary !== undefined) patch.summary = args.summary;
    if (args.error !== undefined) patch.error = args.error;
    await ctx.db.patch(args.jobId, patch);
  },
});
