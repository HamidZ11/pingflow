import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  checkInterpretation,
  interpretationSchema,
} from "@/domain/messages/interpretation";
import type {
  InterpreterRequest,
  InterpreterResult,
  MessageInterpreter,
} from "@/lib/ai/interpreter";
import { callStructured, createOpenAIClient } from "@/lib/ai/openai-structured";
import {
  buildInput,
  INSTRUCTIONS,
  PROMPT_VERSION,
} from "@/lib/ai/prompts/message-interpreter";

// Message interpretation with OpenAI: one small Responses API call per
// message, answered in a strict JSON Schema (Structured Outputs), then
// validated again here (see openai-structured.ts for the call itself).

export type OpenAIInterpreterOptions = {
  apiKey: string;
  model: string;
  /** Omitted when null: the model's own default applies. */
  reasoningEffort: "none" | "minimal" | "low" | "medium" | null;
  /** Per attempt. */
  timeoutMs: number;
  /** Retries of transient failures (connection, 429, 5xx) by the SDK. */
  maxRetries: number;
  maxOutputTokens: number;
  /** For tests: a client with a fake transport. */
  client?: OpenAI;
  /** For the live evaluation: a transport that counts requests. */
  fetch?: typeof globalThis.fetch;
};

/** The strict JSON Schema the model answers in. */
export const interpretationFormat = zodTextFormat(
  interpretationSchema,
  "message_interpretation",
);
const format = interpretationFormat;

export class OpenAIMessageInterpreter implements MessageInterpreter {
  readonly name = "openai" as const;
  readonly model: string;
  private readonly client: OpenAI;

  constructor(private readonly options: OpenAIInterpreterOptions) {
    this.model = options.model;
    this.client = options.client ?? createOpenAIClient(options);
  }

  async interpret(request: InterpreterRequest): Promise<InterpreterResult> {
    const common = {
      interpreter: this.name,
      model: this.model,
      promptVersion: PROMPT_VERSION,
    };
    const result = await callStructured(
      this.client,
      this.options,
      {
        format,
        instructions: INSTRUCTIONS,
        check: (parsed) => {
          const checked = checkInterpretation(parsed);
          return checked
            ? { value: checked.interpretation, issues: checked.issues }
            : null;
        },
      },
      buildInput(request),
    );
    if (!result.ok) {
      return {
        ...common,
        ok: false,
        failure: result.failure,
        usage: result.usage,
        ...(result.detail ? { detail: result.detail } : {}),
      };
    }
    return {
      ...common,
      ok: true,
      usage: result.usage,
      interpretation: result.value,
      issues: result.issues,
    };
  }
}
