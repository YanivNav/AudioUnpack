import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Convex data model. See PLAN.md → "Pipeline flow".
 * `convex/_generated/*` is created by `npx convex dev`.
 */
export default defineSchema({
  jobs: defineTable({
    // source audio in Convex file storage (deleted after transcription to save the 1GB quota)
    storageId: v.optional(v.id("_storage")),
    fileName: v.string(),
    status: v.union(
      v.literal("uploaded"),
      v.literal("queued"),
      v.literal("normalizing"),
      v.literal("transcribing"),
      v.literal("diarizing"),
      v.literal("done"),
      v.literal("failed"),
    ),
    diarize: v.boolean(), // end-user "speaker recognition" toggle
    language: v.optional(v.string()), // omit = auto-detect
    progress: v.optional(v.number()), // 0–100, drives the UI progress bar
    error: v.optional(v.string()),
    // filled in when status = "done"
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
    summary: v.optional(v.string()), // cached on-demand summary
  }).index("by_status", ["status"]),
});
