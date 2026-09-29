import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  checkInterpretation,
  interpretationSchema,
} from "@/domain/messages/interpretation";
import type {
  InterpreterRequest,
  InterpreterResult,
  InterpreterUsage,
  MessageInterpreter,
} from "@/lib/ai/interpreter";
import {
  buildInput,
  INSTRUCTIONS,
  PROMPT_VERSION,
} from "@/lib/ai/prompts/message-interpreter";

// Message interpretation with OpenAI: one small Responses API call per
// message, answered in a strict JSON Schema (Structured Outputs), then
// validated again here. A 200 response isn't taken as success on its own:
// refusals, incomplete answers and anything that doesn't validate are
// failures, and failures are never guessed around.

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
    this.client =
      options.client ??
      new OpenAI({
        apiKey: options.apiKey,
        timeout: options.timeoutMs,
        maxRetries: options.maxRetries,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      });
  }

  async interpret(request: InterpreterRequest): Promise<InterpreterResult> {
    const common = {
      interpreter: this.name,
      model: this.model,
      promptVersion: PROMPT_VERSION,
    };
    let usage: InterpreterUsage | null = null;

    try {
      const response = await this.client.responses.parse({
        model: this.model,
        instructions: INSTRUCTIONS,
        input: buildInput(request),
        text: { format },
        // Nothing about the conversation is kept on the provider's side.
        store: false,
        max_output_tokens: this.options.maxOutputTokens,
        ...(this.options.reasoningEffort
          ? { reasoning: { effort: this.options.reasoningEffort } }
          : {}),
      });

      if (response.usage) {
        usage = {
          model: response.model ?? this.model,
          inputTokens: response.usage.input_tokens,
          cachedInputTokens:
            response.usage.input_tokens_details?.cached_tokens ?? 0,
          outputTokens: response.usage.output_tokens,
          responseId: response.id ?? null,
          requestId:
            (response as { _request_id?: string | null })._request_id ?? null,
        };
      }

      if (response.status === "incomplete") {
        return {
          ...common,
          ok: false,
          failure: "incomplete",
          usage,
          detail: response.incomplete_details?.reason ?? undefined,
        };
      }
      const refused = response.output.some(
        (item) =>
          item.type === "message" &&
          item.content.some((part) => part.type === "refusal"),
      );
      if (refused) return { ...common, ok: false, failure: "refused", usage };

      const checked = checkInterpretation(response.output_parsed);
      if (!checked) {
        return { ...common, ok: false, failure: "invalid_output", usage };
      }
      return {
        ...common,
        ok: true,
        usage,
        interpretation: checked.interpretation,
        issues: checked.issues,
      };
    } catch (error) {
      return { ...common, ok: false, usage, ...classify(error) };
    }
  }
}

function classify(error: unknown): {
  failure: "timeout" | "rate_limited" | "unavailable" | "invalid_output";
  detail: string;
} {
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return { failure: "timeout", detail: "timed out" };
  }
  if (error instanceof OpenAI.RateLimitError) {
    return { failure: "rate_limited", detail: "rate limited" };
  }
  if (error instanceof OpenAI.APIError) {
    // Authentication, permission and request errors are configuration
    // problems; the status is enough to diagnose them. Never the key.
    return {
      failure: "unavailable",
      detail: `provider error ${error.status ?? "connection"}`,
    };
  }
  // The structured output didn't match the schema.
  return { failure: "invalid_output", detail: "output did not validate" };
}
