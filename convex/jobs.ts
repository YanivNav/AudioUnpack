import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

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
    // TODO(impl): schedule the Modal kickoff action, e.g.
    //   await ctx.scheduler.runAfter(0, internal.actions.startTranscription, { jobId });
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
 * Called by the httpAction in `http.ts`.
 */
export const applyUpdate = internalMutation({
  args: {
    jobId: v.id("jobs"),
    status: v.string(),
    progress: v.optional(v.number()), // 0–100
    transcript: v.optional(v.string()),
    segments: v.optional(
      v.array(
        v.object({
          speaker: v.optional(v.string()),
          start: v.number(),
          end: v.number(),
          text: v.string(),
        }),
      ),
    ),
    durationSeconds: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { jobId, ...patch } = args;
    // TODO(impl): validate `status` against the allowed union before patching.
    await ctx.db.patch(jobId, patch as Record<string, unknown>);
  },
});
