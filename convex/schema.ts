import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Convex data model. See PLAN.md → "Pipeline flow".
 * `convex/_generated/*` is created by `npx convex dev`.
 */

/** Job lifecycle. Mirrors `jobStatusSchema` in @audio-unpack/core. */
export const jobStatusValidator = v.union(
  v.literal("uploaded"), // file is in Convex storage, not yet processing
  v.literal("queued"), // Modal job accepted
  v.literal("normalizing"), // ffmpeg converting to 16kHz mono WAV
  v.literal("transcribing"), // faster-whisper running
  v.literal("diarizing"), // WhisperX/pyannote speaker labeling (diarize = true only)
  v.literal("done"), // transcript persisted
  v.literal("failed"),
);

/** One contiguous span of transcript, optionally attributed to a speaker. */
export const segmentValidator = v.object({
  speaker: v.optional(v.string()),
  start: v.number(),
  end: v.number(),
  text: v.string(),
});

export default defineSchema({
  jobs: defineTable({
    // source audio in Convex file storage (deleted after transcription to save the 1GB quota)
    storageId: v.optional(v.id("_storage")),
    fileName: v.string(),
    status: jobStatusValidator,
    diarize: v.boolean(), // end-user "speaker recognition" toggle
    language: v.optional(v.string()), // omit = auto-detect
    progress: v.optional(v.number()), // 0–100, drives the UI progress bar
    error: v.optional(v.string()),
    // filled in when status = "done"
    transcript: v.optional(v.string()),
    segments: v.optional(v.array(segmentValidator)),
    durationSeconds: v.optional(v.number()),
    summary: v.optional(v.string()), // cached on-demand summary
  }).index("by_status", ["status"]),
});
