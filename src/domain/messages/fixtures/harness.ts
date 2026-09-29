import type { EvalCase } from "@/domain/messages/fixtures/corpus";
import {
  linkedCustomers,
  NOW,
  TODAY,
  TZ,
  upcomingFor,
  type WorldName,
  worlds,
} from "@/domain/messages/fixtures/world";
import {
  resolveDateReference,
  resolveTimeWindow,
} from "@/domain/messages/dates";
import { resolveIdentity } from "@/domain/messages/identity";
import type {
  DateReference,
  Intent,
  Interpretation,
  TimeReference,
} from "@/domain/messages/interpretation";
import {
  type Decision,
  decide,
  type PolicyInput,
} from "@/domain/messages/policy";

// Runs corpus cases through the real decision policy against the fixed
// worlds. The unit tests use it with the gold interpretations; `pnpm
// ai:eval` uses it with what the live model returned.

type CaseContext = Pick<EvalCase, "sender" | "world" | "pending">;

const businessTypes: Record<WorldName, string> = {
  driving: "driving_instructor",
  groomer: "dog_groomer",
};

export function policyInputFor(
  testCase: CaseContext,
  i: Interpretation | null,
  overrides: Partial<PolicyInput> = {},
): PolicyInput {
  const world = worlds[testCase.world];
  const identity = resolveIdentity(
    linkedCustomers(testCase.world, testCase.sender),
    i?.person_reference ?? null,
  );
  const upcoming =
    identity.kind === "customer"
      ? upcomingFor(testCase.world, identity.customer.id)
      : [];
  return {
    messageId: "m-1",
    now: NOW,
    today: TODAY,
    timeZone: TZ,
    identity,
    interpretation: i,
    issues: [],
    interpreterFailure: null,
    automation: {
      availabilityReplies: true,
      bookingTimeReplies: true,
      cancellationAcknowledgements: true,
    },
    pendingClarification: testCase.pending
      ? { ...testCase.pending, messageId: "m-0", customerId: null }
      : null,
    services: world.services,
    upcoming,
    usualServiceId: upcoming[0]?.serviceId ?? null,
    schedule: world.schedule,
    ...overrides,
  };
}

/** What the interpreter is given for a corpus case, as the pipeline would. */
export function interpreterRequestFor(testCase: EvalCase) {
  const world = worlds[testCase.world];
  const customers = linkedCustomers(testCase.world, testCase.sender);
  return {
    message: testCase.text,
    receivedAt: NOW,
    timeZone: TZ,
    businessType: businessTypes[testCase.world],
    services: world.services.map((s) => s.name),
    sender: {
      known: customers.length > 0,
      customers: customers.map((c) => c.fullName.split(/\s+/)[0]),
    },
    clarification: testCase.pending
      ? {
          originalMessage: testCase.pending.originalText,
          question: testCase.pending.question,
        }
      : null,
  };
}

export type CaseScore = {
  id: string;
  intent: boolean;
  outcome: boolean;
  /** Null when the case doesn't check it. */
  date: boolean | null;
  time: boolean | null;
  person: boolean | null;
  pass: boolean;
  got: { intent: string | null; outcome: Decision["outcome"] };
};

/** Scores one interpretation (or a failure, as null) against a case. */
export function scoreCase(
  testCase: EvalCase,
  i: Interpretation | null,
): CaseScore {
  const decision = decide(
    policyInputFor(testCase, i, {
      interpreterFailure: i ? null : "unavailable",
    }),
  );
  const expected = testCase.expected;

  let date: boolean | null = null;
  if (expected.date !== undefined) {
    const got = i?.requested_date ?? i?.referenced_booking?.date ?? null;
    date =
      expected.date === null
        ? got === null
        : Boolean(
            got &&
            got.kind === expected.date.kind &&
            (expected.date.weekday === undefined ||
              got.weekday === expected.date.weekday) &&
            (expected.date.week === undefined ||
              got.week === expected.date.week),
          );
  }

  let time: boolean | null = null;
  if (expected.time !== undefined) {
    const got = i?.requested_time ?? null;
    time =
      expected.time === null
        ? got === null
        : Boolean(
            got &&
            got.constraint === expected.time.constraint &&
            (expected.time.time === undefined ||
              got.time === expected.time.time),
          );
  }

  let person: boolean | null = null;
  if (expected.person !== undefined) {
    const got = i?.person_reference?.trim().split(/\s+/)[0]?.toLowerCase();
    person =
      expected.person === null ? !got : got === expected.person.toLowerCase();
  }

  const intent = i?.intent === expected.intent;
  const outcome = decision.outcome === expected.outcome;
  return {
    id: testCase.id,
    intent,
    outcome,
    date,
    time,
    person,
    pass:
      intent && outcome && date !== false && time !== false && person !== false,
    got: { intent: i?.intent ?? null, outcome: decision.outcome },
  };
}

// ---------------------------------------------------------------------------
// The full assessment, for the live evaluation: every criterion, and how
// much a miss matters. The deciding question is what Pingflow would *do*:
// a reading that leads to exactly the same reply, approval or owner task as
// the expected one differs only in detail.
// ---------------------------------------------------------------------------

const CORE_INTENTS: Intent[] = [
  "next_booking_query",
  "availability_query",
  "new_booking_request",
  "reschedule_request",
  "cancellation_request",
];
const BOOKING_ACTIONS: Intent[] = [
  "new_booking_request",
  "reschedule_request",
  "cancellation_request",
];

export type Severity = "critical" | "important" | "minor";

/** What Pingflow does with a reading: the parts a customer or owner sees. */
function effect(d: Decision) {
  return {
    outcome: d.outcome,
    reason: d.reason,
    reply: d.reply?.body ?? null,
    approval: d.approval
      ? {
          kind: d.approval.kind,
          booking: d.approval.bookingId,
          proposal: d.approval.proposal?.startsAt.toISOString() ?? null,
        }
      : null,
    ownerTask: d.ownerTask?.reason ?? null,
    question:
      d.clarification && "set" in d.clarification
        ? d.clarification.set.topic
        : null,
  };
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Dates are equal when they name the same day or days. */
function sameDate(a: DateReference, b: DateReference) {
  return same(resolveDateReference(a, TODAY), resolveDateReference(b, TODAY));
}

/** Times are equal when they allow the same slots ("anytime" = none said). */
function sameTime(a: TimeReference, b: TimeReference) {
  return (
    same(resolveTimeWindow(a, "16:00"), resolveTimeWindow(b, "16:00")) &&
    (a?.constraint === "later") === (b?.constraint === "later") &&
    (a?.constraint === "earlier") === (b?.constraint === "earlier")
  );
}

const simplified = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function sameService(gold: string | null, got: string | null) {
  const g = simplified(gold);
  const a = simplified(got);
  // Naming a service the expected reading doesn't is harmless.
  if (!g) return true;
  return Boolean(a) && (a.includes(g) || g.includes(a));
}

const firstNameOf = (s: string | null | undefined) =>
  s?.trim().split(/\s+/)[0]?.toLowerCase() || null;

export type StructuredResult =
  "valid" | "refused" | "incomplete" | "invalid_output" | "provider_error";

export type CaseAssessment = {
  id: string;
  structured: StructuredResult;
  criteria: {
    intent: boolean;
    /** requested_date and the referenced booking's date. */
    date: boolean;
    time: boolean;
    /** Null when neither the case nor the reading names anyone. */
    person: boolean | null;
    clarification: boolean;
    /** Null when the expected reading names no service. */
    service: boolean | null;
    outcome: boolean;
    /** Exactly the same reply, approval or owner task as expected. */
    sameEffect: boolean;
  };
  /** The corpus's own pass mark (intent, outcome and its explicit checks). */
  pass: boolean;
  /** A clear request among the five core intents: must be read right. */
  clearCore: boolean;
  /** Which of date, time, person and service the expected reading has. */
  keyEntities: {
    date: boolean;
    time: boolean;
    person: boolean;
    service: boolean;
  };
  severity: Severity | null;
  reasons: string[];
  expected: ReturnType<typeof effect> & { intent: Intent };
  actual: (ReturnType<typeof effect> & { intent: Intent | null }) | null;
};

export function assessCase(
  testCase: EvalCase,
  result:
    | { ok: true; interpretation: Interpretation }
    | { ok: false; failure: string },
): CaseAssessment {
  const gold = testCase.gold;
  const i = result.ok ? result.interpretation : null;
  const goldEffect = effect(decide(policyInputFor(testCase, gold)));
  const actualDecision = decide(
    policyInputFor(testCase, i, {
      interpreterFailure: i ? null : "unavailable",
    }),
  );
  const actualEffect = effect(actualDecision);
  const score = scoreCase(testCase, i);

  const structured: StructuredResult = result.ok
    ? "valid"
    : result.failure === "refused" ||
        result.failure === "incomplete" ||
        result.failure === "invalid_output"
      ? result.failure
      : "provider_error";

  const goldPerson = firstNameOf(gold.person_reference);
  const gotPerson = firstNameOf(i?.person_reference);
  const criteria = {
    intent: i?.intent === gold.intent,
    date: Boolean(
      i &&
      sameDate(i.requested_date, gold.requested_date) &&
      sameDate(
        i.referenced_booking?.date ?? null,
        gold.referenced_booking?.date ?? null,
      ),
    ),
    time: Boolean(i && sameTime(i.requested_time, gold.requested_time)),
    person:
      goldPerson || gotPerson || testCase.expected.person !== undefined
        ? goldPerson === gotPerson
        : null,
    clarification: i?.clarification_needed === gold.clarification_needed,
    service: gold.service_reference
      ? Boolean(i) && sameService(gold.service_reference, i!.service_reference)
      : null,
    outcome: actualEffect.outcome === testCase.expected.outcome,
    sameEffect: same(actualEffect, goldEffect),
  };

  const reasons: string[] = [];
  const critical = (why: string) => reasons.push(`critical: ${why}`);
  const important = (why: string) => reasons.push(`important: ${why}`);
  const minor = (why: string) => reasons.push(`minor: ${why}`);

  if (structured !== "valid") {
    (structured === "provider_error" ? important : critical)(
      `no usable reading (${result.ok ? "" : result.failure})`,
    );
  } else if (criteria.sameEffect) {
    // Same effect: any difference is detail.
    for (const [key, ok] of Object.entries(criteria)) {
      if (ok === false) minor(`${key} differs, same effect`);
    }
    if (i!.confidence !== gold.confidence) minor("confidence differs");
  } else {
    const g = goldEffect;
    const a = actualEffect;
    const privateSender =
      testCase.sender === "unknown" || testCase.sender === "parent";
    if (g.approval && a.approval && g.approval.kind !== a.approval.kind) {
      critical(`${g.approval.kind} read as ${a.approval.kind}`);
    } else if (a.approval && !g.approval) {
      critical(`raised a ${a.approval.kind} that wasn't asked for`);
    }
    // Mixing up two clear requests where one is a booking change (a
    // cancellation read as a booking, a move as a new booking) is critical
    // whatever it leads to. Reading one as "unclear" is failing safe.
    if (
      i!.intent !== gold.intent &&
      CORE_INTENTS.includes(gold.intent) &&
      CORE_INTENTS.includes(i!.intent) &&
      (BOOKING_ACTIONS.includes(gold.intent) ||
        BOOKING_ACTIONS.includes(i!.intent))
    ) {
      critical(`${gold.intent} read as ${i!.intent}`);
    }
    if (
      (a.outcome === "auto_reply" || a.outcome === "create_approval") &&
      [
        "request_clarification",
        "owner_reply_task",
        "privacy_hold",
        "unsupported",
      ].includes(g.outcome)
    ) {
      critical(
        g.outcome === "request_clarification"
          ? "ambiguity treated as complete"
          : g.outcome === "unsupported"
            ? "unsupported message handled as routine"
            : `acted where the owner should (${g.outcome})`,
      );
    }
    if (privateSender && (criteria.person === false || a.reply !== g.reply)) {
      critical(
        "privacy: a different person, or a different answer to a parent or unknown number",
      );
    } else if (criteria.person === false) {
      critical("person reference wrong");
    }
    const invented =
      (!gold.requested_date && i!.requested_date) ||
      (!gold.referenced_booking?.date && i!.referenced_booking?.date) ||
      (!gold.requested_time &&
        i!.requested_time &&
        i!.requested_time.constraint !== "anytime");
    if (invented) critical("a date or time that wasn't in the message");
    if (reasons.length === 0) {
      if (
        a.outcome === "request_clarification" &&
        g.outcome !== "request_clarification"
      ) {
        important("unnecessary clarification");
      }
      if (!criteria.date) important("date semantics");
      if (!criteria.time) important("time constraint");
      if (criteria.service === false) important("service reference missed");
      if (!criteria.intent)
        important(`intent ${gold.intent} read as ${i!.intent}`);
      if (reasons.length === 0) important("different effect");
    }
  }

  const severity: Severity | null = reasons.some((r) =>
    r.startsWith("critical"),
  )
    ? "critical"
    : reasons.some((r) => r.startsWith("important"))
      ? "important"
      : reasons.length
        ? "minor"
        : null;

  return {
    id: testCase.id,
    structured,
    criteria,
    pass: score.pass,
    clearCore:
      CORE_INTENTS.includes(gold.intent) &&
      !gold.clarification_needed &&
      !testCase.pending,
    keyEntities: {
      date: Boolean(gold.requested_date || gold.referenced_booking?.date),
      time: Boolean(gold.requested_time),
      person: Boolean(goldPerson),
      service: Boolean(gold.service_reference),
    },
    severity,
    reasons,
    expected: { intent: gold.intent, ...goldEffect },
    actual: i ? { intent: i.intent, ...actualEffect } : null,
  };
}
