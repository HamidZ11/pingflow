import { resolveDateReference } from "@/domain/messages/dates";
import type {
  DateReference,
  TimeReference,
} from "@/domain/messages/interpretation";
import type { OwnerCommand } from "@/domain/owner/command";
import {
  decideOwnerCommand,
  type OwnerDecision,
  type OwnerMutation,
} from "@/domain/owner/decide";
import type { OwnerEvalCase } from "@/domain/owner/fixtures/corpus";
import { NOW, ownerInputFor, TODAY, TZ } from "@/domain/owner/fixtures/world";

// Runs owner corpus cases through the real owner rules against the fixed
// world. The unit tests use it with the gold readings; `pnpm ai:eval
// --owner` uses it with what the live model returned.

const businessType = "driving_instructor";
const services = ["Driving lesson", "Two-hour lesson"];

/** What the interpreter is sent for a case, as the pipeline would send it. */
export function ownerRequestFor(testCase: OwnerEvalCase) {
  return {
    message: testCase.text,
    receivedAt: NOW,
    timeZone: TZ,
    businessType,
    services,
    clarification: testCase.pending
      ? {
          originalMessage: testCase.pending.originalText,
          question: testCase.pending.question,
        }
      : null,
  };
}

export function decideOwnerCase(
  testCase: OwnerEvalCase,
  command: OwnerCommand | null,
): OwnerDecision {
  return decideOwnerCommand(
    ownerInputFor(command, {
      world: testCase.world,
      pending: testCase.pending
        ? { ...testCase.pending, messageId: "m-0" }
        : null,
    }),
  );
}

export type OwnerStructured =
  "valid" | "refused" | "incomplete" | "invalid_output" | "provider_error";

export type OwnerCaseAssessment = {
  id: string;
  structured: OwnerStructured;
  criteria: {
    intent: boolean;
    /** Null when neither the case nor the reading names a day. */
    date: boolean | null;
    /** Start, end and length; null when none is expected or read. */
    time: boolean | null;
    /** Null when neither names anyone. */
    person: boolean | null;
    clarification: boolean;
    outcome: boolean;
    /** Exactly the same reply and the same change as the gold reading. */
    sameEffect: boolean;
  };
  pass: boolean;
  severity: "critical" | "important" | "minor" | null;
  reasons: string[];
  expected: { outcome: OwnerDecision["outcome"]; reply: string | null };
  actual: { outcome: OwnerDecision["outcome"]; reply: string | null } | null;
};

const dayOf = (ref: DateReference | null) => {
  const r = resolveDateReference(ref, TODAY);
  return r ? JSON.stringify(r) : null;
};
const timeOf = (ref: TimeReference | null) =>
  ref ? `${ref.constraint}:${ref.time ?? ""}` : null;
const personOf = (s: string | null) =>
  s?.trim().toLowerCase().replace(/\s+/g, " ") || null;

function mutationKey(m: OwnerMutation | null) {
  return m ? JSON.stringify(m) : null;
}

export function assessOwnerCase(
  testCase: OwnerEvalCase,
  result: { ok: true; command: OwnerCommand } | { ok: false; failure: string },
): OwnerCaseAssessment {
  const gold = testCase.gold;
  const got = result.ok ? result.command : null;
  const expected = decideOwnerCase(testCase, gold);
  const actual = got ? decideOwnerCase(testCase, got) : null;

  const structured: OwnerStructured = result.ok
    ? "valid"
    : result.failure === "refused" ||
        result.failure === "incomplete" ||
        result.failure === "invalid_output"
      ? result.failure
      : "provider_error";

  const either = <T>(g: T | null, a: T | null, same: boolean) =>
    g === null && a === null ? null : same;
  const goldDay = dayOf(gold.date) ?? dayOf(gold.booking_date);
  const gotDay = got ? (dayOf(got.date) ?? dayOf(got.booking_date)) : null;
  const goldTime = [
    timeOf(gold.time),
    gold.end_time,
    gold.duration_minutes,
    gold.booking_time,
  ];
  const gotTime = got
    ? [timeOf(got.time), got.end_time, got.duration_minutes, got.booking_time]
    : [null, null, null, null];
  const hasTime = (t: unknown[]) => t.some((x) => x !== null);

  const criteria = {
    intent: got?.intent === gold.intent,
    date: either(goldDay, gotDay, goldDay === gotDay),
    time:
      hasTime(goldTime) || hasTime(gotTime)
        ? JSON.stringify(goldTime) === JSON.stringify(gotTime)
        : null,
    person: either(
      personOf(gold.person),
      got ? personOf(got.person) : null,
      personOf(gold.person) === (got ? personOf(got.person) : null),
    ),
    clarification:
      (actual?.outcome === "clarify") ===
      (testCase.expected.outcome === "clarify"),
    outcome: actual?.outcome === testCase.expected.outcome,
    sameEffect: Boolean(
      actual &&
      actual.reply === expected.reply &&
      mutationKey(actual.mutation) === mutationKey(expected.mutation),
    ),
  };

  const reasons: string[] = [];
  let severity: OwnerCaseAssessment["severity"] = null;
  const flag = (level: "critical" | "important" | "minor", why: string) => {
    reasons.push(`${level}: ${why}`);
    const rank = { minor: 1, important: 2, critical: 3 };
    if (!severity || rank[level] > rank[severity]) severity = level;
  };

  if (!actual) {
    // No reading: the owner is told nothing changed. Safe, but a failure.
    flag("important", `no usable reading (${result.ok ? "" : result.failure})`);
  } else if (criteria.sameEffect) {
    for (const [key, ok] of Object.entries(criteria)) {
      if (ok === false) flag("minor", `${key} differs, same effect`);
    }
  } else if (
    actual.mutation &&
    mutationKey(actual.mutation) !== mutationKey(expected.mutation)
  ) {
    flag(
      "critical",
      expected.mutation
        ? `made a different change (${actual.mutation.kind})`
        : `made a change where none was expected (${actual.mutation.kind})`,
    );
  } else if (!criteria.outcome) {
    flag(
      "important",
      `${actual.outcome} (${actual.reason}) where ${testCase.expected.outcome} was expected`,
    );
  } else if (actual.outcome === "answer") {
    // A wrong answer is wrong information, even though nothing changed.
    flag("important", "answered, but not what was asked");
  } else {
    flag("minor", "same outcome, different reply");
  }

  return {
    id: testCase.id,
    structured,
    criteria,
    pass: criteria.intent && criteria.outcome,
    severity,
    reasons,
    expected: { outcome: expected.outcome, reply: expected.reply },
    actual: actual ? { outcome: actual.outcome, reply: actual.reply } : null,
  };
}
