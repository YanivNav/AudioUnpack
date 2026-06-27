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
 * Generate a conversation summary with the Vercel AI SDK (`generateText`).
 * Default model is Anthropic (quality); `model: "groq"` is a free alternative.
 * Called from a Convex action (a plain fetch, well under Convex's action limit).
 */
export async function summarizeConversation(
  input: SummaryInput,
  env: SummaryEnv,
  model: SummaryModel = "anthropic",
): Promise<string> {
  const { generateText } = await import("ai");
  const { createAnthropic } = await import("@ai-sdk/anthropic");
  const { createGroq } = await import("@ai-sdk/groq");

  const prompt = buildPrompt(input);

  const languageModel =
    model === "groq"
      ? createGroq({ apiKey: env.GROQ_API_KEY }).languageModel(
          "llama-3.3-70b-versatile",
        )
      : createAnthropic({ apiKey: env.ANTHROPIC_API_KEY }).languageModel(
          "claude-sonnet-4-6",
        );

  const { text } = await generateText({
    model: languageModel,
    system: SYSTEM_PROMPT,
    prompt,
  });

  return text;
}

/** Build the user prompt from the transcript (optionally speaker-tagged) + instructions. */
function buildPrompt(input: SummaryInput): string {
  const transcript = formatTranscript(input);
  const prompt = `Please summarize the following conversation transcript:\n\n${transcript}`;
  if (input.instructions) {
    return `${prompt}\n\nInstructions: ${input.instructions}`;
  }
  return prompt;
}

/**
 * Format the transcript for the model. When speaker-labelled segments are available,
 * prefix each segment with the speaker label so the model knows who said what.
 * Otherwise just return the flat text.
 */
function formatTranscript(input: SummaryInput): string {
  const { segments, text } = input;
  if (segments && segments.length > 0 && segments[0]?.speaker) {
    return segments
      .map((s) => `${s.speaker}: ${s.text}`)
      .join("\n");
  }
  return text;
}
