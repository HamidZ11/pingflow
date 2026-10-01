import { expect, test } from "@playwright/test";
import { corpus } from "../../src/domain/messages/fixtures/corpus";
import { interpretation } from "../../src/domain/messages/interpretation";
import {
  type PipelineDeps,
  processInboundMessage,
  reprocessRun,
} from "../../src/features/messages/pipeline";
import {
  FixtureMessageInterpreter,
  UnavailableMessageInterpreter,
} from "../../src/lib/ai/fixture-interpreter";
import { OpenAIMessageInterpreter } from "../../src/lib/ai/openai-interpreter";
import type { MessageInterpreter } from "../../src/lib/ai/interpreter";
import { PROMPT_VERSION } from "../../src/lib/ai/prompts/message-interpreter";
import { adminClient, anonClient, demoOwner, hasKeys, ownerClient } from "./db";

// The inbound message pipeline against the real database: the same
// function the WhatsApp webhook will call, with the fixture interpreter
// (the evaluation corpus) instead of OpenAI. No model is called here.

test.describe.configure({ mode: "serial" });
test.skip(!hasKeys, "Needs the Supabase keys in .env.local");

const email = "db-messages@pingflow.test";
const otherEmail = "db-messages-other@pingflow.test";
const SARAH = "+447700900123";
const DANA = "+447700900567";
const UNKNOWN = "+447700900111";

const fixture = new FixtureMessageInterpreter(corpus);

function deps(interpreter: MessageInterpreter = fixture): PipelineDeps {
  return { db: adminClient(), interpreter };
}

let businessId = "";
let seq = 0;

/** How a reply names Friday: "tomorrow" when run on a Thursday. */
const FRIDAY =
  new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: "Europe/London",
  }).format(new Date(Date.now() + 86_400_000)) === "Friday"
    ? /tomorrow/
    : /Friday/;
const nextId = () => `test-${Date.now()}-${++seq}`;

function send(
  from: string,
  body: string,
  options: { externalId?: string; interpreter?: MessageInterpreter } = {},
) {
  return processInboundMessage(deps(options.interpreter), {
    businessId,
    from,
    body,
    externalId: options.externalId ?? nextId(),
    source: "simulator",
  });
}

async function tally() {
  const admin = adminClient();
  const table = async (
    name:
      | "messages"
      | "pending_actions"
      | "activity_events"
      | "message_processing_runs"
      | "bookings",
  ) => {
    const { count } = await admin
      .from(name)
      .select("*", { count: "exact", head: true })
      .eq("business_id", businessId);
    return count ?? 0;
  };
  return {
    messages: await table("messages"),
    actions: await table("pending_actions"),
    activity: await table("activity_events"),
    runs: await table("message_processing_runs"),
    bookings: await table("bookings"),
  };
}

async function openActionFor(messageId: string) {
  const { data } = await adminClient()
    .from("pending_actions")
    .select("id, kind, status, understood, proposed_starts_at, booking_id")
    .eq("source_message_id", messageId)
    .eq("status", "open");
  return data ?? [];
}

async function repliesFor(runId: string) {
  const { data } = await adminClient()
    .from("messages")
    .select("id, body, direction, author, delivery")
    .eq("processing_run_id", runId);
  return data ?? [];
}

test.beforeAll(async () => {
  businessId = (await demoOwner(email)).businessId;
});

test("the demo's Sarah request was produced by the pipeline", async () => {
  const admin = adminClient();
  const { data: runs } = await admin
    .from("message_processing_runs")
    .select(
      "status, decision, interpreter, message:messages!message_processing_runs_business_id_message_id_fkey ( body, source )",
    )
    .eq("business_id", businessId);
  expect(runs).toHaveLength(1);
  expect(runs![0]).toMatchObject({
    status: "completed",
    decision: "create_approval",
    interpreter: "static",
    message: { source: "simulator" },
  });
  const { data: actions } = await admin
    .from("pending_actions")
    .select("kind, status, proposed_starts_at")
    .eq("business_id", businessId)
    .eq("status", "open");
  expect(actions).toEqual([
    expect.objectContaining({
      kind: "reschedule_request",
      proposed_starts_at: expect.any(String),
    }),
  ]);
});

test("A: a known customer asking for their next booking gets an automatic reply from real data", async () => {
  const report = await send(SARAH, "When's my next lesson?");
  expect(report.status).toBe("completed");
  expect(report.decision?.outcome).toBe("auto_reply");
  expect(report.decision?.reply?.body).toMatch(
    /^Your next driving lesson is .+ at 16:00\.$/,
  );
  const replies = await repliesFor(report.runId);
  expect(replies).toEqual([
    expect.objectContaining({
      direction: "outbound",
      author: "pingflow",
      delivery: "simulated",
      body: report.decision!.reply!.body,
    }),
  ]);
  expect(await openActionFor(report.messageId)).toEqual([]);

  const { data: activity } = await adminClient()
    .from("activity_events")
    .select("kind, message_id")
    .eq("business_id", businessId)
    .in("message_id", [report.messageId, replies[0].id]);
  expect(activity!.map((a) => a.kind).sort()).toEqual([
    "message_received",
    "reply_sent",
  ]);
});

test("delivering the same message again changes nothing", async () => {
  const externalId = nextId();
  const first = await send(SARAH, "When's my next lesson?", { externalId });
  const before = await tally();
  const again = await send(SARAH, "When's my next lesson?", { externalId });
  expect(again.duplicate).toBe(true);
  expect(again.runId).toBe(first.runId);
  expect(await tally()).toEqual(before);
  expect(await repliesFor(first.runId)).toHaveLength(1);

  // The same words under a new ID are a new message.
  const separate = await send(SARAH, "When's my next lesson?");
  expect(separate.runId).not.toBe(first.runId);
});

test("B: availability after 4 on Friday offers at most three real times after 16:00", async () => {
  const report = await send(SARAH, "Anything after 4 Friday?");
  expect(report.decision?.outcome).toBe("auto_reply");
  const body = report.decision!.reply!.body;
  expect(body).toMatch(FRIDAY);
  const times = body.match(/\d\d:\d\d/g) ?? [];
  expect(times.length).toBeLessThanOrEqual(3);
  for (const t of times) expect(t >= "16:00").toBe(true);
});

test("automation settings decide whether routine replies go automatically", async () => {
  const admin = adminClient();
  await admin
    .from("automation_settings")
    .update({ availability_replies_enabled: false })
    .eq("business_id", businessId);
  try {
    const report = await send(SARAH, "Anything after 4 Friday?");
    expect(report.decision?.outcome).toBe("owner_reply_task");
    expect(report.decision?.reason).toBe("automation_off");
    expect(await repliesFor(report.runId)).toEqual([]);
    const [task] = await openActionFor(report.messageId);
    expect(task.kind).toBe("reply_needed");
    expect(task.understood).toMatchObject({
      reason: "automation_off",
      draft: expect.stringMatching(FRIDAY),
    });
  } finally {
    await admin
      .from("automation_settings")
      .update({ availability_replies_enabled: true })
      .eq("business_id", businessId);
  }
});

test("C: a newer reschedule request replaces the open one for the same booking", async () => {
  const admin = adminClient();
  const { data: seeded } = await admin
    .from("pending_actions")
    .select("id, booking_id")
    .eq("business_id", businessId)
    .eq("kind", "reschedule_request")
    .eq("status", "open")
    .single();

  // "Can we do later?" then "Friday": one question, then an approval.
  const asked = await send(SARAH, "Can we do later?");
  expect(asked.decision?.outcome).toBe("request_clarification");
  const answered = await send(SARAH, "Friday");
  expect(answered.decision?.outcome).toBe("create_approval");

  const [request] = await openActionFor(answered.messageId);
  expect(request.kind).toBe("reschedule_request");
  expect(request.booking_id).toBe(seeded!.booking_id);
  const { data: old } = await admin
    .from("pending_actions")
    .select("status, resolution")
    .eq("id", seeded!.id)
    .single();
  expect(old).toMatchObject({
    status: "dismissed",
    resolution: { reason: "superseded" },
  });
  const { count } = await admin
    .from("pending_actions")
    .select("*", { count: "exact", head: true })
    .eq("booking_id", seeded!.booking_id!)
    .eq("status", "open");
  expect(count).toBe(1);
});

test("D: an unclear message gets one question, then goes to the owner", async () => {
  const admin = adminClient();
  const asked = await send(SARAH, "Can we do later?");
  expect(asked.decision?.reply?.body).toBe(
    "Do you mean later today, or a different day?",
  );
  const { data: conversation } = await admin
    .from("conversations")
    .select("id, clarification")
    .eq("business_id", businessId)
    .not("clarification", "is", null)
    .single();
  expect(conversation!.clarification).toMatchObject({ turns: 1 });

  const still = await send(SARAH, "dunno really");
  expect(still.decision?.outcome).toBe("owner_reply_task");
  expect(still.decision?.reason).toBe("clarification_exhausted");
  // One fixed line saying so, never a second question.
  expect(await repliesFor(still.runId)).toEqual([
    expect.objectContaining({
      body: "I still can’t tell when you’d like instead. I’ve passed this to the owner.",
      author: "pingflow",
    }),
  ]);
  const [task] = await openActionFor(still.messageId);
  expect(task).toMatchObject({
    kind: "reply_needed",
    understood: { reason: "clarification_exhausted" },
  });
  const { data: cleared } = await admin
    .from("conversations")
    .select("clarification")
    .eq("id", conversation!.id)
    .single();
  expect(cleared!.clarification).toBeNull();
});

test("E: an unknown number asking about a customer learns nothing", async () => {
  const report = await send(UNKNOWN, "When is Sarah booked?");
  expect(report.decision?.outcome).toBe("privacy_hold");
  expect(await repliesFor(report.runId)).toEqual([]);
  const [task] = await openActionFor(report.messageId);
  expect(task).toMatchObject({
    kind: "reply_needed",
    understood: { reason: "identity_unknown" },
  });

  // Nothing at all went back to that number.
  const admin = adminClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("id, conversations ( id )")
    .eq("business_id", businessId)
    .eq("phone_e164", UNKNOWN)
    .single();
  const conversationIds = contact!.conversations.map((c) => c.id);
  const { data: outbound } = await admin
    .from("messages")
    .select("id")
    .in("conversation_id", conversationIds)
    .eq("direction", "outbound");
  expect(outbound).toEqual([]);

  // Asking what's free is fine, but the answer is a draft for the owner.
  const free = await send(UNKNOWN, "Hi, do you have anything free next week?");
  expect(free.decision?.outcome).toBe("owner_reply_task");
  expect(await repliesFor(free.runId)).toEqual([]);
});

test("a parent names the child, or is asked which one", async () => {
  const which = await send(DANA, "When is the lesson?");
  expect(which.decision?.reply?.body).toBe("Is this about Adam or Leo?");
  const adam = await send(DANA, "When is Adam booked?");
  expect(adam.decision?.outcome).toBe("auto_reply");
  expect(adam.decision?.reply?.body).toMatch(
    /^Adam’s next driving lesson is .+ at 12:00\.$/,
  );
});

test("when the interpreter is unavailable the message waits for the owner, and a retry doesn't duplicate anything", async () => {
  const report = await send(SARAH, "When's my next lesson?", {
    interpreter: new UnavailableMessageInterpreter(),
  });
  expect(report.status).toBe("failed");
  expect(await repliesFor(report.runId)).toEqual([]);
  const failed = await openActionFor(report.messageId);
  expect(failed).toEqual([
    expect.objectContaining({
      kind: "reply_needed",
      understood: { reason: "interpreter_unavailable" },
    }),
  ]);

  // Failing again keeps the one item.
  await reprocessRun(deps(new UnavailableMessageInterpreter()), report.runId);
  expect(await openActionFor(report.messageId)).toHaveLength(1);

  // Once it can be read, the retry does what it should have, and the
  // owner's item goes (it's been answered).
  const retried = await reprocessRun(deps(), report.runId);
  expect(retried.status).toBe("completed");
  expect(retried.decision?.outcome).toBe("auto_reply");
  expect(await openActionFor(report.messageId)).toEqual([]);
  expect(await repliesFor(report.runId)).toHaveLength(1);
  const { data: closed } = await adminClient()
    .from("pending_actions")
    .select("status, resolution")
    .eq("id", failed[0].id)
    .single();
  expect(closed).toMatchObject({
    status: "dismissed",
    resolution: { reason: "reprocessed" },
  });

  // A completed run is never redone.
  const before = await tally();
  const again = await reprocessRun(deps(), report.runId);
  expect(again.status).toBe("completed");
  expect(await tally()).toEqual(before);
});

test("an unexpected error part-way keeps the message and hands it to the owner", async () => {
  const broken: MessageInterpreter = {
    name: "fixture",
    model: null,
    interpret: async () => {
      throw new Error("boom");
    },
  };
  const externalId = nextId();
  await expect(
    send(SARAH, "When's my next lesson?", { externalId, interpreter: broken }),
  ).rejects.toThrow("The message couldn’t be processed. It was kept.");

  const admin = adminClient();
  const { data: message } = await admin
    .from("messages")
    .select(
      "id, run:message_processing_runs!message_processing_runs_business_id_message_id_fkey ( id, status, error_category )",
    )
    .eq("business_id", businessId)
    .eq("external_id", externalId)
    .single();
  expect(message!.run).toMatchObject([
    { status: "failed", error_category: "processing_error" },
  ]);
  expect(await openActionFor(message!.id)).toEqual([
    expect.objectContaining({
      kind: "reply_needed",
      understood: { reason: "interpreter_unavailable" },
    }),
  ]);
  const retried = await reprocessRun(deps(), message!.run[0].id);
  expect(retried.decision?.outcome).toBe("auto_reply");
  expect(await openActionFor(message!.id)).toEqual([]);
});

test("messages in one conversation are handled one at a time, in order", async () => {
  const [a, b, c] = await Promise.all([
    send(SARAH, "When's my next lesson?"),
    send(SARAH, "Cheers, see you then"),
    send(SARAH, "When's my next lesson?"),
  ]);
  const admin = adminClient();
  const { data: runs } = await admin
    .from("message_processing_runs")
    .select("id, status")
    .in("id", [a.runId, b.runId, c.runId]);
  expect(runs!.every((r) => r.status === "completed")).toBe(true);
  for (const r of [a, c]) expect(await repliesFor(r.runId)).toHaveLength(1);
  expect(await repliesFor(b.runId)).toHaveLength(0);

  // The same delivery racing itself is stored once.
  const externalId = nextId();
  const both = await Promise.allSettled([
    send(SARAH, "When's my next lesson?", { externalId }),
    send(SARAH, "When's my next lesson?", { externalId }),
  ]);
  const { count } = await admin
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("external_id", externalId);
  expect(count).toBe(1);
  expect(both.some((r) => r.status === "fulfilled")).toBe(true);
});

// The real OpenAI adapter, answering from the corpus through a fake
// transport: the pipeline, the ledger and the prices exactly as with the
// live API, without calling it.
function fakeOpenAI(
  answer: (
    text: string,
    call: number,
  ) => { status: number; body?: Record<string, unknown> },
) {
  let calls = 0;
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    const text = JSON.parse(
      /Message: ([\s\S]*)$/.exec(body.input)![1],
    ) as string;
    const { status, body: overrides = {} } = answer(text, calls);
    const gold = corpus.find((c) => c.text === text)?.gold;
    const response =
      status === 200
        ? {
            id: `resp_${crypto.randomUUID()}`,
            object: "response",
            created_at: 1,
            status: "completed",
            model: "gpt-5.6-luna",
            incomplete_details: null,
            error: null,
            output: [
              {
                type: "message",
                id: "msg_1",
                status: "completed",
                role: "assistant",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify(gold),
                    annotations: [],
                  },
                ],
              },
            ],
            usage: {
              input_tokens: 800,
              input_tokens_details: { cached_tokens: 500 },
              output_tokens: 100,
              output_tokens_details: { reasoning_tokens: 30 },
              total_tokens: 900,
            },
            ...overrides,
          }
        : { error: { message: "unavailable", type: "server_error" } };
    return new Response(JSON.stringify(response), {
      status,
      headers: { "content-type": "application/json", "x-request-id": "req_x" },
    });
  };
  const interpreter = new OpenAIMessageInterpreter({
    apiKey: "test-key",
    model: "gpt-5.6-luna",
    reasoningEffort: "low",
    timeoutMs: 8000,
    maxRetries: 1,
    maxOutputTokens: 1200,
    fetch,
  });
  return { interpreter, calls: () => calls };
}

async function usageFor(runId: string) {
  const { data } = await adminClient()
    .from("usage_events")
    .select("*")
    .eq("business_id", businessId)
    .contains("metadata", { run_id: runId });
  return data ?? [];
}

test("each OpenAI call is recorded once, at Luna's price, to the micro-dollar", async () => {
  const openai = fakeOpenAI(() => ({ status: 200 }));
  const externalId = nextId();
  const report = await send(SARAH, "When's my next lesson?", {
    externalId,
    interpreter: openai.interpreter,
  });
  expect(report.decision?.outcome).toBe("auto_reply");
  // 300 fresh × $0.20 + 500 cached × $0.02 + 100 out × $1.20 per million
  // = 60 + 10 + 120 micro-dollars: $0.00019, not $0.00.
  expect(report.usage).toMatchObject({
    model: "gpt-5.6-luna",
    estimatedCostMicros: 190,
    currency: "USD",
    recorded: true,
  });

  const rows = await usageFor(report.runId);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    business_id: businessId,
    category: "ai",
    provider: "openai",
    operation: "interpret_message",
    model: "gpt-5.6-luna",
    input_tokens: 800,
    cached_input_tokens: 500,
    output_tokens: 100,
    estimated_cost_micros: 190,
    currency: "USD",
    external_reference: expect.stringMatching(/^resp_/),
    metadata: expect.objectContaining({
      prompt_version: PROMPT_VERSION,
      provider_request_id: "req_x",
      message_id: report.messageId,
      outcome: "interpreted",
    }),
  });

  // Delivered again: no call, no second row.
  await send(SARAH, "When's my next lesson?", {
    externalId,
    interpreter: openai.interpreter,
  });
  expect(openai.calls()).toBe(1);
  expect(await usageFor(report.runId)).toHaveLength(1);
});

test("a failed call that was billed and its retry are two rows; nothing more", async () => {
  // First answer: cut off (billed, unusable). The retry succeeds.
  const openai = fakeOpenAI((_text, call) =>
    call === 1
      ? {
          status: 200,
          body: {
            status: "incomplete",
            incomplete_details: { reason: "max_output_tokens" },
          },
        }
      : { status: 200 },
  );
  const report = await send(SARAH, "When's my next lesson?", {
    interpreter: openai.interpreter,
  });
  expect(report).toMatchObject({ status: "failed", failure: "incomplete" });
  expect(await usageFor(report.runId)).toHaveLength(1);

  const retried = await reprocessRun(deps(openai.interpreter), report.runId);
  expect(retried.status).toBe("completed");
  const rows = await usageFor(report.runId);
  // Two calls, two rows, in whatever order they come back.
  expect(
    rows.map((r) => (r.metadata as { outcome?: string }).outcome).sort(),
  ).toEqual(["incomplete", "interpreted"]);
  expect(new Set(rows.map((r) => r.external_reference)).size).toBe(2);

  // A completed run is never sent again.
  await reprocessRun(deps(openai.interpreter), report.runId);
  expect(openai.calls()).toBe(2);
  expect(await usageFor(report.runId)).toHaveLength(2);
});

test("an OpenAI outage keeps the message, invents nothing and tells the owner", async () => {
  const openai = fakeOpenAI(() => ({ status: 500 }));
  const before = await tally();
  const report = await send(SARAH, "Need to cancel tomorrow sorry", {
    interpreter: openai.interpreter,
  });

  // One try and one retry, then it stops.
  expect(openai.calls()).toBe(2);
  expect(report).toMatchObject({ status: "failed", failure: "unavailable" });
  expect(await repliesFor(report.runId)).toEqual([]);
  expect(await openActionFor(report.messageId)).toEqual([
    expect.objectContaining({
      kind: "reply_needed",
      understood: { reason: "interpreter_unavailable" },
    }),
  ]);
  // Nothing was billed, so nothing is recorded; no booking changed.
  expect(await usageFor(report.runId)).toEqual([]);
  const after = await tally();
  expect(after.bookings).toBe(before.bookings);
  expect(after.messages - before.messages).toBe(1); // the inbound only
  const { data: stored } = await adminClient()
    .from("messages")
    .select("body")
    .eq("id", report.messageId)
    .single();
  expect(stored!.body).toBe("Need to cancel tomorrow sorry");
});

test("processing internals stay with the server", async () => {
  const owner = await ownerClient(email);
  const { data: runs } = await owner
    .from("message_processing_runs")
    .select("id");
  expect(runs ?? []).toEqual([]);

  for (const client of [owner, anonClient()]) {
    const ingest = await client.rpc("ingest_inbound_message", {
      p_business_id: businessId,
      p_phone_e164: SARAH,
      p_body: "hello",
      p_received_at: new Date().toISOString(),
      p_external_id: nextId(),
      p_source: "simulator",
    });
    expect(ingest.error?.code).toBe("42501");
    const claim = await client.rpc("claim_message_run", {
      p_run_id: crypto.randomUUID(),
    });
    expect(claim.error?.code).toBe("42501");
  }

  // Another owner can't see or answer this business's items.
  const other = await demoOwner(otherEmail);
  const report = await send(UNKNOWN, "When is Sarah booked?");
  const [task] = await openActionFor(report.messageId);
  const { data: seen } = await other.client
    .from("pending_actions")
    .select("id")
    .eq("id", task.id);
  expect(seen).toEqual([]);
  const reply = await other.client.rpc("reply_to_pending_action", {
    p_action_id: task.id,
    p_body: "Hi",
  });
  expect(reply.error?.hint).toBe("not_found");

  // The owner can answer it, once.
  const answered = await owner.rpc("reply_to_pending_action", {
    p_action_id: task.id,
    p_body: "Who is this, please?",
  });
  expect(answered.error).toBeNull();
  const twice = await owner.rpc("reply_to_pending_action", {
    p_action_id: task.id,
    p_body: "Who is this, please?",
  });
  expect(twice.error?.hint).toBe("already_resolved");
});

test("new booking and cancellation requests are approved by the owner in one step", async () => {
  const owner = await ownerClient(email);
  const admin = adminClient();

  // A cancellation: Sarah's next lesson, acknowledged, then approved.
  const cancel = await send(SARAH, "can't make Friday", {
    interpreter: {
      name: "static",
      model: null,
      interpret: async () => ({
        ok: true,
        interpreter: "static",
        model: null,
        promptVersion: null,
        usage: null,
        issues: [],
        interpretation: interpretation({
          intent: "cancellation_request",
          referenced_booking: {
            kind: "next",
            date: null,
            time: null,
            service: null,
          },
          cancellation_scope: "single",
        }),
      }),
    },
  });
  expect(cancel.decision?.outcome).toBe("create_approval");
  expect(cancel.decision?.reply?.body).toBe(
    "I’ve got your cancellation request. I’ll confirm it shortly.",
  );
  const [request] = await openActionFor(cancel.messageId);
  expect(request.kind).toBe("cancellation_request");
  const approved = await owner.rpc("resolve_cancellation_request", {
    p_action_id: request.id,
    p_decision: "approve",
    p_reply_body: "Hi Sarah, that’s done.",
  });
  expect(approved.error).toBeNull();
  const { data: booking } = await admin
    .from("bookings")
    .select("status")
    .eq("id", request.booking_id!)
    .single();
  expect(booking!.status).toBe("cancelled");

  // A new booking: created only when the owner approves a free time.
  const { data: service } = await admin
    .from("services")
    .select("id")
    .eq("business_id", businessId)
    .eq("name", "Driving lesson")
    .single();
  const book = await send(
    SARAH,
    "Could I book a lesson next Wednesday at 10?",
    {
      interpreter: {
        name: "static",
        model: null,
        interpret: async () => ({
          ok: true,
          interpreter: "static",
          model: null,
          promptVersion: null,
          usage: null,
          issues: [],
          interpretation: interpretation({
            intent: "new_booking_request",
            requested_date: {
              kind: "weekday",
              weekday: "wednesday",
              week: "next",
              day: null,
              month: null,
            },
            requested_time: { constraint: "exact", time: "10:00" },
            service_reference: "Driving lesson",
          }),
        }),
      },
    },
  );
  expect(book.decision?.outcome).toBe("create_approval");
  const [bookingRequest] = await openActionFor(book.messageId);
  expect(bookingRequest).toMatchObject({
    kind: "booking_request",
    understood: { service_id: service!.id },
  });
  const before = await tally();
  const created = await owner.rpc("resolve_booking_request", {
    p_action_id: bookingRequest.id,
    p_decision: "approve",
    p_starts_at: bookingRequest.proposed_starts_at!,
  });
  expect(created.error).toBeNull();
  expect((await tally()).bookings - before.bookings).toBe(1);
});
