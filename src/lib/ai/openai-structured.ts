import OpenAI from "openai";
import type {
  InterpreterFailure,
  InterpreterUsage,
} from "@/lib/ai/interpreter";

// One small Responses API call answered in a strict JSON Schema, shared by
// every reader (customers' messages, the owner's commands). A 200 isn't
// success on its own: refusals, incomplete answers and anything the
// caller's check rejects are failures, and failures are never guessed
// around. Retries of temporary failures are the SDK's, bounded by the
// client's maxRetries.

export type StructuredSpec<T, I> = {
  /** zodTextFormat(schema, name) */
  format: ReturnType<typeof import("openai/helpers/zod").zodTextFormat>;
  instructions: string;
  /** Validates the parsed output again; null means it isn't usable. */
  check: (parsed: unknown) => { value: T; issues: I[] } | null;
};

export type StructuredOptions = {
  model: string;
  reasoningEffort: "none" | "minimal" | "low" | "medium" | null;
  maxOutputTokens: number;
};

export type StructuredResult<T, I> =
  | { ok: true; value: T; issues: I[]; usage: InterpreterUsage | null }
  | {
      ok: false;
      failure: InterpreterFailure;
      detail?: string;
      usage: InterpreterUsage | null;
    };

export async function callStructured<T, I>(
  client: OpenAI,
  options: StructuredOptions,
  spec: StructuredSpec<T, I>,
  input: string,
): Promise<StructuredResult<T, I>> {
  let usage: InterpreterUsage | null = null;
  try {
    const response = await client.responses.parse({
      model: options.model,
      instructions: spec.instructions,
      input,
      text: { format: spec.format },
      // Nothing about the conversation is kept on the provider's side.
      store: false,
      max_output_tokens: options.maxOutputTokens,
      ...(options.reasoningEffort
        ? { reasoning: { effort: options.reasoningEffort } }
        : {}),
    });

    if (response.usage) {
      usage = {
        model: response.model ?? options.model,
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
    if (refused) return { ok: false, failure: "refused", usage };

    const checked = spec.check(response.output_parsed);
    if (!checked) return { ok: false, failure: "invalid_output", usage };
    return { ok: true, value: checked.value, issues: checked.issues, usage };
  } catch (error) {
    return { ok: false, usage, ...classify(error) };
  }
}

export function createOpenAIClient(options: {
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
  fetch?: typeof globalThis.fetch;
}) {
  return new OpenAI({
    apiKey: options.apiKey,
    timeout: options.timeoutMs,
    maxRetries: options.maxRetries,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
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
