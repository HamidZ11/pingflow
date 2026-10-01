import type { Interpretation } from "@/domain/messages/interpretation";
import type {
  InterpreterRequest,
  InterpreterResult,
  MessageInterpreter,
} from "@/lib/ai/interpreter";

// Deterministic interpreters with no model behind them. Neither pretends to
// be one: results say which interpreter produced them, and there's never
// any usage or cost.

function normalise(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Knows a fixed set of messages (the evaluation corpus) and their expected
 * interpretations. For tests, and for developing without an OpenAI key when
 * explicitly enabled. Any other message is reported as unknown, which the
 * pipeline treats like an unavailable interpreter.
 */
export class FixtureMessageInterpreter implements MessageInterpreter {
  readonly name = "fixture" as const;
  readonly model = null;
  private readonly known: Map<string, Interpretation>;

  constructor(cases: { text: string; gold: Interpretation }[]) {
    this.known = new Map(cases.map((c) => [normalise(c.text), c.gold]));
  }

  async interpret(request: InterpreterRequest): Promise<InterpreterResult> {
    const found = this.known.get(normalise(request.message));
    const common = {
      interpreter: this.name,
      model: null,
      promptVersion: null,
      usage: null,
    };
    if (!found) {
      return {
        ...common,
        ok: false,
        failure: "unknown_message",
        detail: "not in the fixture set",
      };
    }
    return { ...common, ok: true, interpretation: found, issues: [] };
  }
}

/** Always gives the same interpretation: used by the demo seed. */
export class StaticMessageInterpreter implements MessageInterpreter {
  readonly name = "static" as const;
  readonly model = null;

  constructor(private readonly value: Interpretation) {}

  async interpret(): Promise<InterpreterResult> {
    return {
      interpreter: this.name,
      model: null,
      promptVersion: null,
      usage: null,
      ok: true,
      interpretation: this.value,
      issues: [],
    };
  }
}

/** No interpreter configured: every message goes to the owner. */
export class UnavailableMessageInterpreter implements MessageInterpreter {
  readonly name = "none" as const;
  readonly model = null;

  async interpret(): Promise<InterpreterResult> {
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
