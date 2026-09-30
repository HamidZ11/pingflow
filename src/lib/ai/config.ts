import { corpus } from "@/domain/messages/fixtures/corpus";
import type { MessageInterpreter } from "@/lib/ai/interpreter";
import {
  FixtureMessageInterpreter,
  UnavailableMessageInterpreter,
} from "@/lib/ai/fixture-interpreter";
import { OpenAIMessageInterpreter } from "@/lib/ai/openai-interpreter";
import { ownerCorpus } from "@/domain/owner/fixtures/corpus";
import {
  FixtureOwnerInterpreter,
  OpenAIOwnerInterpreter,
  type OwnerCommandInterpreter,
  UnavailableOwnerInterpreter,
} from "@/lib/ai/owner-interpreter";

// Which message interpreter runs, decided in one place.
//
//   OPENAI_API_KEY                 server only; enables OpenAI
//   OPENAI_MESSAGE_MODEL           default gpt-5.6-luna
//   OPENAI_MESSAGE_REASONING_EFFORT  default "low"; "default" sends none
//   PINGFLOW_MESSAGE_INTERPRETER   "fixture" to use the test interpreter
//                                  (development only, never production)
//
// With no key and no fixture flag, messages are still received and stored,
// and each goes to the owner as "Pingflow couldn't read this message".

export const DEFAULT_MESSAGE_MODEL = "gpt-5.6-luna";

export type AiSettings = {
  interpreter: "openai" | "fixture" | "none";
  model: string;
  reasoningEffort: "none" | "minimal" | "low" | "medium" | null;
  timeoutMs: number;
  maxRetries: number;
  maxOutputTokens: number;
  /** Why the interpreter is what it is, for the developer view. */
  note: string;
};

const efforts = ["none", "minimal", "low", "medium"] as const;

export function aiSettings(env: NodeJS.ProcessEnv = process.env): AiSettings {
  const model = env.OPENAI_MESSAGE_MODEL?.trim() || DEFAULT_MESSAGE_MODEL;
  const effortSetting = env.OPENAI_MESSAGE_REASONING_EFFORT?.trim() || "low";
  const reasoningEffort = (efforts as readonly string[]).includes(effortSetting)
    ? (effortSetting as AiSettings["reasoningEffort"])
    : null;
  const base = {
    model,
    reasoningEffort,
    // One short attempt, one retry of a transient failure: about 16 seconds
    // at worst, never a minute.
    timeoutMs: 8000,
    maxRetries: 1,
    maxOutputTokens: 1200,
  };

  if (env.PINGFLOW_MESSAGE_INTERPRETER === "fixture") {
    if (env.NODE_ENV === "production") {
      return {
        ...base,
        interpreter: "none",
        note: "The fixture interpreter is never used in production.",
      };
    }
    return {
      ...base,
      interpreter: "fixture",
      note: "Test interpreter: understands the evaluation messages only.",
    };
  }
  if (env.OPENAI_API_KEY) {
    return { ...base, interpreter: "openai", note: `OpenAI, ${model}` };
  }
  return {
    ...base,
    interpreter: "none",
    note: "No OpenAI key set: messages go to the owner unread.",
  };
}

export function createMessageInterpreter(
  settings: AiSettings = aiSettings(),
): MessageInterpreter {
  switch (settings.interpreter) {
    case "openai":
      return new OpenAIMessageInterpreter({
        apiKey: process.env.OPENAI_API_KEY!,
        model: settings.model,
        reasoningEffort: settings.reasoningEffort,
        timeoutMs: settings.timeoutMs,
        maxRetries: settings.maxRetries,
        maxOutputTokens: settings.maxOutputTokens,
      });
    case "fixture":
      return new FixtureMessageInterpreter(corpus);
    case "none":
      return new UnavailableMessageInterpreter();
  }
}

/** The owner-command reader, with the same settings as customer messages. */
export function createOwnerInterpreter(
  settings: AiSettings = aiSettings(),
): OwnerCommandInterpreter {
  switch (settings.interpreter) {
    case "openai":
      return new OpenAIOwnerInterpreter({
        apiKey: process.env.OPENAI_API_KEY!,
        model: settings.model,
        reasoningEffort: settings.reasoningEffort,
        timeoutMs: settings.timeoutMs,
        maxRetries: settings.maxRetries,
        maxOutputTokens: settings.maxOutputTokens,
      });
    case "fixture":
      return new FixtureOwnerInterpreter(ownerCorpus);
    case "none":
      return new UnavailableOwnerInterpreter();
  }
}
