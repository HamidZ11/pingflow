import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  checkOwnerCommand,
  type OwnerCommand,
  type OwnerCommandIssue,
  ownerCommandSchema,
} from "@/domain/owner/command";
import type {
  InterpreterFailure,
  InterpreterName,
  InterpreterUsage,
} from "@/lib/ai/interpreter";
import { callStructured, createOpenAIClient } from "@/lib/ai/openai-structured";
import {
  buildOwnerInput,
  OWNER_INSTRUCTIONS,
  OWNER_PROMPT_VERSION,
} from "@/lib/ai/prompts/owner-command";

// Reading the owner's commands. The same seam as customer messages: an
// implementation reads words into a command and nothing else; what it
// means for the schedule is decided in src/domain/owner/decide.ts.

export type OwnerInterpreterRequest = {
  message: string;
  receivedAt: Date;
  timeZone: string;
  businessType: string;
  services: string[];
  /** Set when this message answers a question Pingflow asked. */
  clarification: { originalMessage: string; question: string } | null;
};

type Common = {
  interpreter: InterpreterName;
  model: string | null;
  promptVersion: string | null;
  usage: InterpreterUsage | null;
};

export type OwnerInterpreterResult =
  | (Common & { ok: true; command: OwnerCommand; issues: OwnerCommandIssue[] })
  | (Common & { ok: false; failure: InterpreterFailure; detail?: string });

export interface OwnerCommandInterpreter {
  readonly name: InterpreterName;
  readonly model: string | null;
  interpret(request: OwnerInterpreterRequest): Promise<OwnerInterpreterResult>;
}

/** The strict JSON Schema the model answers owner commands in. */
export const ownerCommandFormat = zodTextFormat(
  ownerCommandSchema,
  "owner_command",
);

export type OpenAIOwnerInterpreterOptions = {
  apiKey: string;
  model: string;
  reasoningEffort: "none" | "minimal" | "low" | "medium" | null;
  timeoutMs: number;
  maxRetries: number;
  maxOutputTokens: number;
  client?: OpenAI;
  fetch?: typeof globalThis.fetch;
};

export class OpenAIOwnerInterpreter implements OwnerCommandInterpreter {
  readonly name = "openai" as const;
  readonly model: string;
  private readonly client: OpenAI;

  constructor(private readonly options: OpenAIOwnerInterpreterOptions) {
    this.model = options.model;
    this.client = options.client ?? createOpenAIClient(options);
  }

  async interpret(
    request: OwnerInterpreterRequest,
  ): Promise<OwnerInterpreterResult> {
    const common = {
      interpreter: this.name,
      model: this.model,
      promptVersion: OWNER_PROMPT_VERSION,
    };
    const result = await callStructured(
      this.client,
      this.options,
      {
        format: ownerCommandFormat,
        instructions: OWNER_INSTRUCTIONS,
        check: (parsed) => {
          const checked = checkOwnerCommand(parsed);
          return checked
            ? { value: checked.command, issues: checked.issues }
            : null;
        },
      },
      buildOwnerInput(request),
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
      command: result.value,
      issues: result.issues,
    };
  }
}

function normalise(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Knows the owner evaluation corpus and nothing else (tests, development). */
export class FixtureOwnerInterpreter implements OwnerCommandInterpreter {
  readonly name = "fixture" as const;
  readonly model = null;
  private readonly known: Map<string, OwnerCommand>;

  constructor(cases: { text: string; gold: OwnerCommand }[]) {
    this.known = new Map(cases.map((c) => [normalise(c.text), c.gold]));
  }

  async interpret(
    request: OwnerInterpreterRequest,
  ): Promise<OwnerInterpreterResult> {
    const found = this.known.get(normalise(request.message));
    const common = {
      interpreter: this.name,
      model: null,
      promptVersion: null,
      usage: null,
    };
    return found
      ? { ...common, ok: true, command: found, issues: [] }
      : {
          ...common,
          ok: false,
          failure: "unknown_message",
          detail: "not in the fixture set",
        };
  }
}

/** Always gives the same command: for tests. */
export class StaticOwnerInterpreter implements OwnerCommandInterpreter {
  readonly name = "static" as const;
  readonly model = null;
  constructor(private readonly value: OwnerCommand) {}
  async interpret(): Promise<OwnerInterpreterResult> {
    return {
      interpreter: this.name,
      model: null,
      promptVersion: null,
      usage: null,
      ok: true,
      command: this.value,
      issues: [],
    };
  }
}

/** No interpreter configured: every command gets "I couldn't process that". */
export class UnavailableOwnerInterpreter implements OwnerCommandInterpreter {
  readonly name = "none" as const;
  readonly model = null;
  async interpret(): Promise<OwnerInterpreterResult> {
    return {
      interpreter: this.name,
      model: null,
      promptVersion: null,
      usage: null,
      ok: false,
      failure: "not_configured",
    };
  }
}
