import { expect, test } from "@playwright/test";
import { availableSlots } from "../../src/domain/availability/engine";
import { corpus } from "../../src/domain/messages/fixtures/corpus";
import {
  type OwnerCommand,
  ownerCommand,
} from "../../src/domain/owner/command";
import { ownerCorpus } from "../../src/domain/owner/fixtures/corpus";
import { addDays, clockTimeOf, dateKeyOf } from "../../src/domain/time/zoned";
import {
  type PipelineDeps,
  processInboundMessage,
} from "../../src/features/messages/pipeline";
import { loadScheduleContext } from "../../src/features/schedule/load-schedule";
import type { WhatsAppDeps } from "../../src/features/whatsapp/deps";
import { runWhatsAppWork } from "../../src/features/whatsapp/worker";
import { FixtureMessageInterpreter } from "../../src/lib/ai/fixture-interpreter";
import {
  FixtureOwnerInterpreter,
  type OwnerCommandInterpreter,
  StaticOwnerInterpreter,
  UnavailableOwnerInterpreter,
} from "../../src/lib/ai/owner-interpreter";
import { FakeMessagingTransport } from "../../src/lib/whatsapp/fake-transport";
import type { Database, Json } from "../../src/lib/supabase/database.types";
import { adminClient, demoOwner, hasKeys } from "./db";

// Owner commands against the real database. The owner is whoever the
// business has named as its owner's number; everything the owner asks for
// is checked in code and applied (at most once) by complete_owner_command.
// No model and no Meta: fixed readings and a fake transport.

test.describe.configure({ mode: "serial" });
test.skip(!hasKeys, "Needs the Supabase keys in .env.local");

const email = "db-owner-commands@pingflow.test";
const otherEmail = "db-owner-commands-other@pingflow.test";
const OWNER = "+447700900001";
const OTHER_OWNER = "+447700900002";
const SARAH = "+447700900123";

let businessId = "";
let otherBusinessId = "";
let seq = 0;
const nextId = () => `owner-test-${Date.now()}-${++seq}`;
const admin = () => adminClient();

function deps(
  ownerInterpreter: OwnerCommandInterpreter = new FixtureOwnerInterpreter(
    ownerCorpus,
  ),
): PipelineDeps {
  return {
    db: admin(),
    interpreter: new FixtureMessageInterpreter(corpus),
    ownerInterpreter,
  };
}

function send(
  body: string,
  options: {
    from?: string;
    business?: string;
    reading?: OwnerCommand | OwnerCommandInterpreter;
    externalId?: string;
  } = {},
) {
  const reading = options.reading;
  const interpreter =
    reading && "intent" in reading
      ? new StaticOwnerInterpreter(reading)
      : reading;
  return processInboundMessage(
    deps(interpreter as OwnerCommandInterpreter | undefined),
    {
      businessId: options.business ?? businessId,
      from: options.from ?? OWNER,
      body,
      externalId: options.externalId ?? nextId(),
      source: "simulator",
    },
  );
}

async function sarahsNextBooking() {
  const { data } = await admin()
    .from("bookings")
    .select(
      "id, starts_at, ends_at, buffer_minutes, customer:customers!inner ( full_name )",
    )
    .eq("business_id", businessId)
    .eq("customer.full_name", "Sarah Khan")
    .eq("status", "confirmed")
    .gt("starts_at", new Date().toISOString())
    .order("starts_at")
    .limit(1)
    .single();
  return data!;
}

/** A really free start for a booking, two or more days from now. */
async function freeSlotFor(booking: {
  id: string;
  starts_at: string;
  ends_at: string;
  buffer_minutes: number;
}) {
  const today = dateKeyOf(new Date(), tz);
  const context = await loadScheduleContext(
    admin(),
    { id: businessId, timeZone: tz, scheduleMode: "regular" },
    today,
    21,
  );
  const minutes =
    (new Date(booking.ends_at).getTime() -
      new Date(booking.starts_at).getTime()) /
    60000;
  for (let d = 2; d < 21; d++) {
    const date = addDays(today, d);
    const slot = availableSlots(context, date, {
      durationMinutes: minutes,
      bufferMinutes: booking.buffer_minutes,
      ignoreBookingId: booking.id,
    })[0];
    if (slot)
      return {
        date,
        time: clockTimeOf(slot.startsAt, tz),
        startsAt: slot.startsAt,
      };
  }
  throw new Error("No free slot found");
}

const tz = "Europe/London";
const calendar = (date: string) => ({
  kind: "calendar_date" as const,
  weekday: null,
  week: null,
  day: Number(date.slice(8, 10)),
  month: Number(date.slice(5, 7)),
});

/** Names exactly which of Sarah's bookings, so tests never hinge on "next". */
const which = (booking: { starts_at: string }) => ({
  person: "Sarah",
  booking_date: calendar(dateKeyOf(new Date(booking.starts_at), tz)),
  booking_time: clockTimeOf(new Date(booking.starts_at), tz),
});

type ActivityKind = Database["public"]["Enums"]["activity_kind"];

async function activityCount(kind: ActivityKind, bookingId?: string) {
  let q = admin()
    .from("activity_events")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("kind", kind);
  if (bookingId) q = q.eq("booking_id", bookingId);
  return (await q).count ?? 0;
}

async function repliesFor(runId: string) {
  const { data } = await admin()
    .from("messages")
    .select("body, delivery, author")
    .eq("processing_run_id", runId);
  return data ?? [];
}

test.beforeAll(async () => {
  businessId = (await demoOwner(email)).businessId;
  otherBusinessId = (await demoOwner(otherEmail)).businessId;
  // The seed names the same demo owner number for both; the other
  // business's owner gets their own.
  await admin()
    .from("owner_channel_identities")
    .update({ address_e164: OTHER_OWNER })
    .eq("business_id", otherBusinessId);
});

test("the owner's number takes the owner path; anyone else is a customer", async () => {
  const before = await activityCount("message_received");
  const owner = await send("Who have I got tomorrow?");
  expect(owner.owner).toMatchObject({
    intent: "owner_schedule_query",
    outcome: "answer",
  });
  const [reply] = await repliesFor(owner.runId);
  expect(reply).toMatchObject({ author: "pingflow", delivery: "simulated" });
  expect(reply.body).toMatch(/^(Tomorrow:\n• |You’re free tomorrow\.)/);
  // Not customer activity, not Attention.
  expect(await activityCount("message_received")).toBe(before);
  const { count: items } = await admin()
    .from("pending_actions")
    .select("*", { count: "exact", head: true })
    .eq("source_message_id", owner.messageId);
  expect(items).toBe(0);

  // The same words from a customer are a customer's message.
  const customer = await send("Who have I got tomorrow?", { from: SARAH });
  expect(customer.owner).toBeUndefined();
});

test("with no owner number set up, nobody is the owner", async () => {
  const { data: saved } = await admin()
    .from("owner_channel_identities")
    .delete()
    .eq("business_id", businessId)
    .select("address_e164")
    .single();
  try {
    const report = await send("Cancel Sarah's lesson", {
      reading: ownerCommand({
        intent: "owner_cancel_booking",
        person: "Sarah",
      }),
    });
    expect(report.owner).toBeUndefined();
    expect((await sarahsNextBooking()).id).toBeTruthy();
  } finally {
    await admin().from("owner_channel_identities").insert({
      business_id: businessId,
      channel: "whatsapp",
      address_e164: saved!.address_e164,
    });
  }
});

test("a move happens once, even when the message is delivered again", async () => {
  const booking = await sarahsNextBooking();
  const target = await freeSlotFor(booking);
  const reading = ownerCommand({
    intent: "owner_reschedule_booking",
    ...which(booking),
    date: calendar(target.date),
    time: { constraint: "exact", time: target.time },
  });
  const externalId = nextId();
  const moved = await send("Move Sarah", { reading, externalId });
  expect(moved.owner).toMatchObject({ outcome: "change", applied: "changed" });
  expect(moved.owner!.reply).toMatch(
    /^Done\. Sarah Khan’s driving lesson is now .+\. Sarah hasn’t been messaged\.$/,
  );

  const { data: after } = await admin()
    .from("bookings")
    .select("starts_at")
    .eq("id", booking.id)
    .single();
  expect(new Date(after!.starts_at).getTime()).toBe(target.startsAt.getTime());
  expect(await activityCount("booking_moved", booking.id)).toBe(1);
  const { data: activity } = await admin()
    .from("activity_events")
    .select("actor, details")
    .eq("booking_id", booking.id)
    .eq("kind", "booking_moved")
    .single();
  expect(activity).toMatchObject({
    actor: "owner",
    details: expect.objectContaining({ via: "whatsapp" }),
  });

  // Delivered again: nothing more.
  const again = await send("Move Sarah", { reading, externalId });
  expect(again.duplicate).toBe(true);
  expect(again.owner).toEqual(moved.owner);
  expect(again.interpretation).toBeNull();
  expect(await activityCount("booking_moved", booking.id)).toBe(1);
  expect(await repliesFor(moved.runId)).toHaveLength(1);
});

test("an unavailable time changes nothing and offers real ones", async () => {
  const booking = await sarahsNextBooking();
  // Omar's next lesson is taken, by definition.
  const { data: omar } = await admin()
    .from("bookings")
    .select("starts_at, customer:customers!inner ( full_name )")
    .eq("business_id", businessId)
    .eq("customer.full_name", "Omar Ali")
    .eq("status", "confirmed")
    .gt("starts_at", new Date().toISOString())
    .order("starts_at")
    .limit(1)
    .single();
  const report = await send("Move Sarah", {
    reading: ownerCommand({
      intent: "owner_reschedule_booking",
      ...which(booking),
      date: calendar(dateKeyOf(new Date(omar!.starts_at), tz)),
      time: {
        constraint: "exact",
        time: clockTimeOf(new Date(omar!.starts_at), tz),
      },
    }),
  });
  expect(report.owner).toMatchObject({ outcome: "clarify", applied: null });
  expect(report.owner!.reply).toMatch(
    /isn’t available\. .+ (You’re free at|Nothing is free)/,
  );
  const { data: same } = await admin()
    .from("bookings")
    .select("starts_at")
    .eq("id", booking.id)
    .single();
  expect(same!.starts_at).toBe(booking.starts_at);
});

test("the booking is checked again as the change is written", async () => {
  const booking = await sarahsNextBooking();
  const target = await freeSlotFor(booking);

  // A run to complete by hand, as the pipeline would.
  async function claimedRun(body: string) {
    const { data: ingested } = await admin().rpc("ingest_inbound_message", {
      p_business_id: businessId,
      p_phone_e164: OWNER,
      p_body: body,
      p_received_at: new Date().toISOString(),
      p_external_id: nextId(),
      p_source: "simulator",
    });
    const runId = (ingested as { run_id: string }).run_id;
    const { data: attempt } = await admin().rpc("claim_message_run", {
      p_run_id: runId,
    });
    return { runId, attempt: attempt as number };
  }
  const complete = (
    runId: string,
    attempt: number,
    mutation: { [key: string]: Json },
  ) =>
    admin().rpc("complete_owner_command", {
      p_run_id: runId,
      p_attempt: attempt,
      p_result: {
        decision: "owner_change",
        reply: "Done.",
        conflict_reply: "Nothing was changed.",
        mutation,
      },
    });

  // The booking moved since Pingflow looked: nothing happens.
  const stale = await claimedRun("move it");
  const staleResult = await complete(stale.runId, stale.attempt, {
    kind: "reschedule",
    booking_id: booking.id,
    expected_starts_at: new Date(
      new Date(booking.starts_at).getTime() - 3600e3,
    ).toISOString(),
    starts_at: target.startsAt.toISOString(),
    reminder_send_at: null,
  });
  expect(staleResult.data).toMatchObject({ outcome: "stale" });
  expect((await repliesFor(stale.runId))[0].body).toBe("Nothing was changed.");

  // The time was taken since Pingflow looked: the guard refuses, nothing
  // changes, and the owner is told.
  const { data: omar } = await admin()
    .from("bookings")
    .select("starts_at, customer:customers!inner ( full_name )")
    .eq("business_id", businessId)
    .eq("customer.full_name", "Omar Ali")
    .eq("status", "confirmed")
    .gt("starts_at", new Date().toISOString())
    .order("starts_at")
    .limit(1)
    .single();
  const taken = await claimedRun("move it there");
  const takenResult = await complete(taken.runId, taken.attempt, {
    kind: "reschedule",
    booking_id: booking.id,
    expected_starts_at: booking.starts_at,
    starts_at: omar!.starts_at,
    reminder_send_at: null,
  });
  expect(takenResult.data).toMatchObject({ outcome: "conflict" });
  const { data: unchanged } = await admin()
    .from("bookings")
    .select("starts_at")
    .eq("id", booking.id)
    .single();
  expect(unchanged!.starts_at).toBe(booking.starts_at);

  // A block over a booking is refused by the database too.
  const block = await claimedRun("block it");
  const blockResult = await complete(block.runId, block.attempt, {
    kind: "block",
    starts_at: booking.starts_at,
    ends_at: booking.ends_at,
    label: null,
  });
  expect(blockResult.data).toMatchObject({ outcome: "conflict" });

  // Another business's booking can't be touched from here.
  const { data: theirs } = await admin()
    .from("bookings")
    .select("id, starts_at")
    .eq("business_id", otherBusinessId)
    .eq("status", "confirmed")
    .gt("starts_at", new Date().toISOString())
    .limit(1)
    .single();
  const cross = await claimedRun("cancel it");
  const crossResult = await complete(cross.runId, cross.attempt, {
    kind: "cancel",
    booking_id: theirs!.id,
    expected_starts_at: theirs!.starts_at,
  });
  expect(crossResult.data).toMatchObject({ outcome: "stale" });
  const { data: still } = await admin()
    .from("bookings")
    .select("status")
    .eq("id", theirs!.id)
    .single();
  expect(still!.status).toBe("confirmed");

  // A broken change rolls everything back: no reply, run not completed.
  const broken = await claimedRun("do something odd");
  const brokenResult = await complete(broken.runId, broken.attempt, {
    kind: "delete_everything",
  });
  expect(brokenResult.error?.hint).toBe("invalid_mutation");
  expect(await repliesFor(broken.runId)).toEqual([]);
  const { data: run } = await admin()
    .from("message_processing_runs")
    .select("status")
    .eq("id", broken.runId)
    .single();
  expect(run!.status).toBe("processing");
  // The pipeline then records the failure, as it would.
  await admin().rpc("fail_message_run", {
    p_run_id: broken.runId,
    p_attempt: broken.attempt,
    p_error_category: "processing_error",
  });
});

test("a block never covers a booking", async () => {
  const booking = await sarahsNextBooking();
  const before = await activityCount("time_blocked");
  const report = await send("Block it", {
    reading: ownerCommand({
      intent: "owner_block_time",
      date: calendar(dateKeyOf(new Date(booking.starts_at), tz)),
      time: {
        constraint: "exact",
        time: clockTimeOf(new Date(booking.starts_at), tz),
      },
      duration_minutes: 60,
    }),
  });
  expect(report.owner).toMatchObject({
    outcome: "refuse",
    reason: "block_overlaps_booking",
  });
  expect(report.owner!.reply).toMatch(
    /^I can’t block .+: Sarah Khan is booked at .+\. Nothing was changed\.$/,
  );
  expect(await activityCount("time_blocked")).toBe(before);
});

test("one question, then the command carries on; asked twice, it hands back", async () => {
  await admin()
    .from("customers")
    .insert({ business_id: businessId, full_name: "Sarah Ahmed" });
  const asked = await send("When is Sarah booked?", {
    reading: ownerCommand({
      intent: "owner_customer_booking_query",
      person: "Sarah",
    }),
  });
  expect(asked.owner).toMatchObject({ outcome: "clarify" });
  expect(asked.owner!.reply).toBe(
    "I found 2 customers called Sarah: Sarah Ahmed and Sarah Khan. Which one?",
  );
  const answered = await send("Sarah Khan", {
    reading: ownerCommand({
      intent: "owner_customer_booking_query",
      person: "Sarah Khan",
    }),
  });
  expect(answered.owner).toMatchObject({ outcome: "answer" });
  expect(answered.owner!.reply).toMatch(/^Sarah Khan/);

  const again = await send("When is Sarah booked?", {
    reading: ownerCommand({
      intent: "owner_customer_booking_query",
      person: "Sarah",
    }),
  });
  expect(again.owner!.outcome).toBe("clarify");
  const still = await send("dunno", {
    reading: ownerCommand({ intent: "owner_unclear", confidence: "low" }),
  });
  expect(still.owner).toMatchObject({
    outcome: "refuse",
    reply: "I still can’t tell what you mean. Please update it in Pingflow.",
  });
  const { data: conversation } = await admin()
    .from("messages")
    .select("conversation:conversations ( clarification )")
    .eq("id", still.messageId)
    .single();
  expect(
    (conversation as { conversation: { clarification: unknown } }).conversation
      .clarification,
  ).toBeNull();
});

test("when the command can't be read, nothing changes and the owner is told", async () => {
  const before = await activityCount("booking_cancelled");
  const report = await send("Cancel Sarah", {
    reading: new UnavailableOwnerInterpreter(),
  });
  expect(report.owner).toMatchObject({
    outcome: "refuse",
    reply: "I couldn’t process that command. Nothing was changed.",
  });
  expect(await activityCount("booking_cancelled")).toBe(before);
  const { data: inbound } = await admin()
    .from("messages")
    .select("body")
    .eq("id", report.messageId)
    .single();
  expect(inbound!.body).toBe("Cancel Sarah");
});

test("when the database fails part-way, nothing changes and the owner is told", async () => {
  const booking = await sarahsNextBooking();
  const db = admin();
  // Loading the schedule fails: the command is never decided or applied.
  const failing = new Proxy(db, {
    get(target, key, receiver) {
      if (key === "from") {
        return (table: string) => {
          if (table === "schedule_blocks") throw new Error("connection reset");
          return target.from(table as never);
        };
      }
      return Reflect.get(target, key, receiver);
    },
  });
  const report = await processInboundMessage(
    {
      db: failing,
      interpreter: new FixtureMessageInterpreter(corpus),
      ownerInterpreter: new StaticOwnerInterpreter(
        ownerCommand({ intent: "owner_cancel_booking", ...which(booking) }),
      ),
    },
    {
      businessId,
      from: OWNER,
      body: "Cancel Sarah",
      externalId: nextId(),
      source: "simulator",
    },
  );
  expect(report.owner).toMatchObject({
    outcome: "refuse",
    reason: "processing_error",
    reply: "I couldn’t process that command. Nothing was changed.",
  });
  const { data: same } = await admin()
    .from("bookings")
    .select("status")
    .eq("id", booking.id)
    .single();
  expect(same!.status).toBe("confirmed");
});

test("owner usage is recorded as interpret_owner_command", async () => {
  const responseId = `resp_${crypto.randomUUID()}`;
  const metered: OwnerCommandInterpreter = {
    name: "openai",
    model: "gpt-5.6-luna",
    interpret: async () => ({
      ok: true,
      interpreter: "openai",
      model: "gpt-5.6-luna",
      promptVersion: "owner_command_v1",
      issues: [],
      command: ownerCommand({
        intent: "owner_booking_count_query",
        date: {
          kind: "tomorrow",
          weekday: null,
          week: null,
          day: null,
          month: null,
        },
      }),
      usage: {
        model: "gpt-5.6-luna",
        inputTokens: 900,
        cachedInputTokens: 0,
        outputTokens: 80,
        responseId,
        requestId: "req_o",
      },
    }),
  };
  const report = await send("How many tomorrow?", { reading: metered });
  expect(report.usage).toMatchObject({
    recorded: true,
    estimatedCostMicros: 276,
  });
  const { data: rows } = await admin()
    .from("usage_events")
    .select("operation, model, metadata")
    .eq("external_reference", responseId);
  expect(rows).toEqual([
    expect.objectContaining({
      operation: "interpret_owner_command",
      model: "gpt-5.6-luna",
      metadata: expect.objectContaining({ prompt_version: "owner_command_v1" }),
    }),
  ]);
});

test("each owner sees only their own business", async () => {
  await admin()
    .from("customers")
    .update({ full_name: "Zelda Unique" })
    .eq("business_id", businessId)
    .eq("full_name", "Tom Reid");
  // The other business's owner asks about a customer only this business has.
  const theirs = await send("When is Zelda booked?", {
    from: OTHER_OWNER,
    business: otherBusinessId,
    reading: ownerCommand({
      intent: "owner_customer_booking_query",
      person: "Zelda",
    }),
  });
  expect(theirs.owner).toMatchObject({
    outcome: "refuse",
    reply: "I can’t find a customer called Zelda.",
  });

  // This business's owner number, messaging the other business, is just a
  // customer there.
  const crossed = await send("Cancel Sarah's lesson", {
    from: OWNER,
    business: otherBusinessId,
    reading: ownerCommand({ intent: "owner_cancel_booking", person: "Sarah" }),
  });
  expect(crossed.owner).toBeUndefined();
});

test("the owner's replies go out on WhatsApp, and a failed send is reported, not claimed", async () => {
  const { data: connection } = await admin()
    .from("whatsapp_connections")
    .insert({
      business_id: businessId,
      mode: "developer",
      status: "connected",
      phone_number_id: "700000000051",
    })
    .select("id")
    .single();
  const db = admin();
  const whatsapp = (transport: FakeMessagingTransport): WhatsAppDeps => ({
    db,
    credentials: {
      getCredentials: async (c) => ({
        accessToken: "fake",
        phoneNumberId: c.phoneNumberId,
      }),
    },
    transportFor: () => transport,
    pipeline: deps(),
  });
  try {
    const ok = new FakeMessagingTransport();
    const answered = await processInboundMessage(deps(), {
      businessId,
      from: OWNER,
      body: "Who have I got tomorrow?",
      externalId: `wamid.owner-${Date.now()}`,
      source: "whatsapp",
    });
    await runWhatsAppWork(whatsapp(ok));
    expect(ok.sent).toEqual([
      expect.objectContaining({ type: "text", to: OWNER }),
    ]);
    expect((await repliesFor(answered.runId))[0].delivery).toBe("accepted");

    const failing = new FakeMessagingTransport([
      { ok: false, category: "recipient_unavailable", code: 131026 },
    ]);
    const refused = await processInboundMessage(deps(), {
      businessId,
      from: OWNER,
      body: "How many lessons have I got tomorrow?",
      externalId: `wamid.owner-${Date.now()}-2`,
      source: "whatsapp",
    });
    await runWhatsAppWork(whatsapp(failing));
    expect((await repliesFor(refused.runId))[0].delivery).toBe("failed");
  } finally {
    await admin()
      .from("whatsapp_connections")
      .delete()
      .eq("id", connection!.id);
  }
});
