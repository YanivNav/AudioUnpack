import type { SummaryModel, TranscriptSegment } from "./types.js";

export interface SummaryInput {
  text: string;
  segments?: TranscriptSegment[];
  /** Optional steer, e.g. "action items only" or a target language. */
  instructions?: string;
}

export interface SummaryEnv {
  GROQ_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}

const SYSTEM_PROMPT =
  "You summarize conversations. Produce a concise summary with: a 2-3 sentence overview, " +
  "key points as bullets, decisions made, and action items (with owner if identifiable). " +
  "Use speaker labels when present. Be faithful to the transcript; do not invent details.";

/**
 * Generate a conversation summary with the Vercel AI SDK (`generateText`/`streamText`).
 * Default model is Anthropic (quality); `model: "groq"` is a free alternative.
 * Called from a Convex action (a plain fetch, well under Convex's action limit).
 */
export async function summarizeConversation(
  _input: SummaryInput,
  _env: SummaryEnv,
  _model: SummaryModel = "anthropic",
): Promise<string> {
  // TODO(impl): build the prompt from input.text (or speaker-joined segments) and call:
  //   import { generateText } from "ai";
  //   import { createAnthropic } from "@ai-sdk/anthropic";
  //   import { createGroq } from "@ai-sdk/groq";
  //   const model = _model === "groq"
  //     ? createGroq({ apiKey: _env.GROQ_API_KEY }).languageModel("llama-3.3-70b-versatile")
  //     : createAnthropic({ apiKey: _env.ANTHROPIC_API_KEY }).languageModel("claude-...");
  //   const { text } = await generateText({ model, system: SYSTEM_PROMPT, prompt });
  //   return text;
  void SYSTEM_PROMPT;
  throw new Error("TODO(impl): summarizeConversation not implemented");
}
