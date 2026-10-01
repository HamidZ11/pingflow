import type {
  Interpretation,
  InterpretationIssue,
} from "@/domain/messages/interpretation";

// The seam between Pingflow and whatever reads customer language. The
// pipeline only knows this interface; which implementation runs is decided
// once, in config.ts. An implementation interprets. It never decides,
// writes or replies.

export type InterpreterName = "openai" | "fixture" | "static" | "none";

export type InterpreterRequest = {
  message: string;
  receivedAt: Date;
  timeZone: string;
  businessType: string;
  services: string[];
  sender: {
    known: boolean;
    /** First names of the customers this number is linked to. */
    customers: string[];
  };
  /** Set when this message answers a question Pingflow asked. */
  clarification: { originalMessage: string; question: string } | null;
  /**
   * The message behind this customer's request that is still waiting for
   * the owner, so a follow-up ("actually 6 would be better") can be read
   * as a change to it. Its words only: never the booking itself.
   */
  openRequest?: { originalMessage: string } | null;
};

/** What the provider reported it used: real counts, never estimates. */
export type InterpreterUsage = {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  /** The provider's ID for the response (idempotency key for usage). */
  responseId: string | null;
  /** The provider's request ID, for support queries. */
  requestId: string | null;
};

export type InterpreterFailure =
  | "not_configured"
  | "timeout"
  | "unavailable"
  | "rate_limited"
  | "refused"
  | "incomplete"
  | "invalid_output"
  | "unknown_message";

type Common = {
  interpreter: InterpreterName;
  model: string | null;
  promptVersion: string | null;
  usage: InterpreterUsage | null;
};

export type InterpreterResult =
  | (Common & {
      ok: true;
      interpretation: Interpretation;
      issues: InterpretationIssue[];
    })
  | (Common & { ok: false; failure: InterpreterFailure; detail?: string });

export interface MessageInterpreter {
  readonly name: InterpreterName;
  readonly model: string | null;
  interpret(request: InterpreterRequest): Promise<InterpreterResult>;
}
