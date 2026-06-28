import type { TranscriptSegment } from "./types";

// ── Model registry ──────────────────────────────────────────────────
// Add / remove entries here to change the available summary models.
// The Convex deployment needs the corresponding *_API_KEY env var set
// for the model to be selectable in the UI.

interface ModelDef {
  readonly id: string;
  readonly label: string;
  readonly provider: "groq" | "anthropic" | "openai";
  readonly modelId: string;
  readonly envKey: string;
  readonly baseURL?: string; // for OpenAI-compatible providers (e.g. DeepSeek)
}

export const SUMMARIZE_MODELS = [
  {
    id: "deepseek",
    label: "DeepSeek",
    provider: "openai",
    modelId: "deepseek-chat",
    envKey: "DEEPSEEK_API_KEY",
    baseURL: "https://api.deepseek.com/v1",
  },
  {
    id: "groq",
    label: "Groq",
    provider: "groq",
    modelId: "llama-3.3-70b-versatile",
    envKey: "GROQ_API_KEY",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    provider: "anthropic",
    modelId: "claude-sonnet-4-6",
    envKey: "ANTHROPIC_API_KEY",
  },
  {
    id: "openai",
    label: "OpenAI",
    provider: "openai",
    modelId: "gpt-4o",
    envKey: "OPENAI_API_KEY",
  },
] as const satisfies readonly ModelDef[];

export type SummaryModel = (typeof SUMMARIZE_MODELS)[number]["id"];

// ── Types ───────────────────────────────────────────────────────────

export interface SummaryInput {
  text: string;
  segments?: TranscriptSegment[];
  /** Optional steer, e.g. "action items only" or a target language. */
  instructions?: string;
  /** Language code of the conversation (from Whisper auto-detect). Summary is written in this language. */
  language?: string;
}

/** Map of env-var name → value. Pass the relevant *_API_KEY entries from process.env. */
export type SummaryEnv = Record<string, string | undefined>;

// ── Core function ───────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You summarize conversations. Produce a concise summary with: a 2-3 sentence overview, " +
  "key points as bullets, decisions made, and action items (with owner if identifiable). " +
  "Use speaker labels when present. Be faithful to the transcript; do not invent details.";

/**
 * Generate a conversation summary with the Vercel AI SDK.
 * Looks up `model` in {@link SUMMARIZE_MODELS} and routes to the right provider.
 * Called from a Convex action (a plain fetch, well under Convex's action limit).
 */
export async function summarizeConversation(
  input: SummaryInput,
  env: SummaryEnv,
  model: SummaryModel = "groq",
): Promise<string> {
  const cfg = SUMMARIZE_MODELS.find((m) => m.id === model);
  if (!cfg) throw new Error(`Unknown summary model: ${model}`);

  const apiKey = env[cfg.envKey];
  if (!apiKey) throw new Error(`${cfg.envKey} is not set`);

  const { generateText } = await import("ai");
  const languageModel = await resolveLanguageModel(cfg, apiKey);
  const prompt = buildPrompt(input);

  const { text } = await generateText({
    model: languageModel,
    system: SYSTEM_PROMPT,
    prompt,
  });

  return text;
}

// ── Provider routing ────────────────────────────────────────────────

async function resolveLanguageModel(
  cfg: ModelDef,
  apiKey: string,
): Promise<any> {
  switch (cfg.provider) {
    case "groq": {
      const { createGroq } = await import("@ai-sdk/groq");
      return createGroq({ apiKey }).languageModel(cfg.modelId);
    }
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      return createAnthropic({ apiKey }).languageModel(cfg.modelId);
    }
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      return createOpenAI({
        apiKey,
        ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}),
      }).languageModel(cfg.modelId);
    }
    default:
      throw new Error(`Unknown provider: ${(cfg as ModelDef).provider}`);
  }
}

// ── Prompt helpers ──────────────────────────────────────────────────

/** Common Whisper language codes → human-readable names. */
const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian",
  pt: "Portuguese", nl: "Dutch", ru: "Russian", zh: "Chinese", ja: "Japanese",
  ko: "Korean", ar: "Arabic", he: "Hebrew", hi: "Hindi", tr: "Turkish",
  pl: "Polish", sv: "Swedish", da: "Danish", fi: "Finnish", no: "Norwegian",
  cs: "Czech", hu: "Hungarian", ro: "Romanian", el: "Greek", th: "Thai",
  vi: "Vietnamese", id: "Indonesian", ms: "Malay", uk: "Ukrainian",
};

function buildPrompt(input: SummaryInput): string {
  const transcript = formatTranscript(input);
  let prompt = `Please summarize the following conversation transcript:\n\n${transcript}`;
  if (input.language) {
    const name = LANG_NAMES[input.language] ?? input.language;
    prompt += `\n\nIMPORTANT: This conversation is in ${name}. You MUST write the summary in ${name} — do NOT translate it to English or any other language. Write your entire response in ${name}.`;
  }
  if (input.instructions) {
    prompt += `\n\nAdditional instructions: ${input.instructions}`;
  }
  return prompt;
}

function formatTranscript(input: SummaryInput): string {
  const { segments, text } = input;
  if (segments && segments.length > 0 && segments[0]?.speaker) {
    return segments.map((s) => `${s.speaker}: ${s.text}`).join("\n");
  }
  return text;
}
