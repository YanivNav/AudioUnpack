import { z } from "zod";

/**
 * Shared domain types for audio-unpack.
 * These are the contracts shared between the Convex backend, the Modal transcription
 * job, and the web/Wix frontends. The Modal app (Python) mirrors these shapes.
 */

/** Lifecycle of a single transcription job. */
export const jobStatusSchema = z.enum([
  "uploaded", // file is in Convex storage, not yet processing
  "queued", // Modal job accepted
  "normalizing", // ffmpeg converting to 16kHz mono WAV
  "transcribing", // faster-whisper running
  "diarizing", // WhisperX/pyannote speaker labeling (only when diarize = true)
  "done", // transcript persisted
  "failed",
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

/** One contiguous span of transcript, optionally attributed to a speaker. */
export const transcriptSegmentSchema = z.object({
  speaker: z.string().optional(), // e.g. "A", "B" (only when diarize = true)
  start: z.number(), // seconds from start of audio
  end: z.number(),
  text: z.string(),
});
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

/** The normalized result every TranscriptionProvider returns. */
export const transcriptionResultSchema = z.object({
  text: z.string(),
  language: z.string().optional(),
  durationSeconds: z.number().optional(),
  segments: z.array(transcriptSegmentSchema).optional(),
});
export type TranscriptionResult = z.infer<typeof transcriptionResultSchema>;

/** Payload the Modal job sends back to the Convex httpAction callback. */
export const transcriptCallbackSchema = z.object({
  jobId: z.string(),
  status: jobStatusSchema,
  progress: z.number().min(0).max(100).optional(), // drives the UI progress bar
  result: transcriptionResultSchema.optional(),
  error: z.string().optional(),
});
export type TranscriptCallback = z.infer<typeof transcriptCallbackSchema>;

/** Payload the Convex action POSTs to the Modal transcription endpoint. */
export const transcribeTaskPayloadSchema = z.object({
  jobId: z.string(),
  fileUrl: z.string().url(), // signed Convex storage URL for the source audio
  diarize: z.boolean().default(false),
  language: z.string().optional(), // ISO code; omit for auto-detect
});
export type TranscribeTaskPayload = z.infer<typeof transcribeTaskPayloadSchema>;

/**
 * Which transcription engine to use for a job. Both run on Modal:
 *  - "faster-whisper": default (no speaker labels)
 *  - "whisperx-pyannote": opt-in diarization mode (Whisper + speaker labels)
 */
export type TranscriptionEngine = "faster-whisper" | "whisperx-pyannote";

