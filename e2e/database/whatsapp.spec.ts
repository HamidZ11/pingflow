import { expect, test } from "@playwright/test";
import { corpus } from "../../src/domain/messages/fixtures/corpus";
import { interpretation } from "../../src/domain/messages/interpretation";
import { processInboundMessage } from "../../src/features/messages/pipeline";
import type { WhatsAppDeps } from "../../src/features/whatsapp/deps";
import { ingestWebhook } from "../../src/features/whatsapp/ingest";
import { runWhatsAppWork } from "../../src/features/whatsapp/worker";
import {
  FixtureMessageInterpreter,
  StaticMessageInterpreter,
} from "../../src/lib/ai/fixture-interpreter";
import type { MessageInterpreter } from "../../src/lib/ai/interpreter";
import type { SendResult } from "../../src/lib/messaging/transport";
import { FakeMessagingTransport } from "../../src/lib/whatsapp/fake-transport";
import {
  currentMetaInboundText,
  inboundOfType,
  inboundText,
  statusUpdate,
} from "../../src/lib/whatsapp/fixtures";
import { signBody } from "../../src/lib/whatsapp/signature";
import { adminClient, demoOwner, hasKeys, ownerClient } from "./db";

// The WhatsApp channel against the real database, with a fake transport
// instead of Meta: signed webhooks in, the same message pipeline, the
// outbox out, statuses back. Nothing here calls Meta or OpenAI.

test.describe.configure({ mode: "serial" });
test.skip(!hasKeys, "Needs the Supabase keys in .env.local");

const email = "db-whatsapp@pingflow.test";
const otherEmail = "db-whatsapp-other@pingflow.test";
const SECRET = "test-app-secret";
const NUMBER_ID = "700000000001";
const OTHER_NUMBER_ID = "700000000002";
const SARAH = "447700900123";
const OMAR = "447700900456";
const AISHA = "447700900345";
const UNKNOWN = "447700900111";

let businessId = "";
let connectionId = "";
let transport = new FakeMessagingTransport();
let seq = 0;
const wamid = () => `wamid.test-${Date.now()}-${++seq}`;

function deps(interpreter: MessageInterpreter = fixture()): WhatsAppDeps {
  const db = adminClient();
  return {
    db,
    credentials: {
      getCredentials: async (c) =>
        c.phoneNumberId === NUMBER_ID || c.phoneNumberId === OTHER_NUMBER_ID
          ? { accessToken: "fake", phoneNumberId: c.phoneNumberId }
          : null,
    },
    transportFor: () => transport,
    pipeline: { db, interpreter },
  };
}
function fixture() {
  return new FixtureMessageInterpreter(corpus);
}

async function deliver(payload: unknown, d = deps()) {
  const body = JSON.stringify(payload);
  return ingestWebhook(d, {
    rawBody: new TextEncoder().encode(body),
    signature: signBody(body, SECRET),
    appSecret: SECRET,
  });
}

const admin = () => adminClient();

async function messageFor(externalId: string) {
  const { data } = await admin()
    .from("messages")
    .select("id, conversation_id, content_type, body")
    .eq("business_id", businessId)
    .eq("external_id", externalId)
    .maybeSingle();
  return data;
}

async function repliesTo(messageId: string) {
  const { data: run } = await admin()
    .from("message_processing_runs")
    .select("id")
    .eq("message_id", messageId)
    .single();
  const { data } = await admin()
    .from("messages")
    .select("id, body, delivery")
    .eq("processing_run_id", run!.id);
  return data ?? [];
}

async function delivery(messageId: string) {
  const { data } = await admin()
    .from("message_deliveries")
    .select("*")
    .eq("message_id", messageId)
    .maybeSingle();
  return data;
}

async function messageDelivery(messageId: string) {
  const { data } = await admin()
    .from("messages")
    .select("delivery")
    .eq("id", messageId)
    .single();
  return data!.delivery;
}

async function openActions(sourceMessageId: string) {
  const { data } = await admin()
    .from("pending_actions")
    .select("id, kind, understood, booking_id, proposed_starts_at")
    .eq("source_message_id", sourceMessageId)
    .eq("status", "open");
  return data ?? [];
}

/** Makes a customer's last WhatsApp message older (for window tests). */
async function ageInbound(externalId: string, hours: number) {
  const at = new Date(Date.now() - hours * 3600e3).toISOString();
  const { data } = await admin()
    .from("messages")
    .update({ sent_at: at })
    .eq("business_id", businessId)
    .eq("external_id", externalId)
    .select("id");
  expect(data).toHaveLength(1);
}

test.beforeAll(async () => {
  businessId = (await demoOwner(email)).businessId;
  const { data, error } = await admin()
    .from("whatsapp_connections")
    .insert({
      business_id: businessId,
      mode: "developer",
      status: "connected",
      phone_number_id: NUMBER_ID,
      waba_id: "700000000100",
      display_phone_number: "+447700900000",
      connected_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  connectionId = data!.id;
});

test.beforeEach(() => {
  transport = new FakeMessagingTransport();
});

test("A: a real WhatsApp text goes through the same pipeline and the reply goes out on WhatsApp", async () => {
  const id = wamid();
  const stored = await deliver(
    inboundText({
      id,
      from: SARAH,
      body: "When's my next lesson?",
      phoneNumberId: NUMBER_ID,
    }),
  );
  expect(stored).toEqual({ status: 200, stored: 1, duplicates: 0 });

  const summary = await runWhatsAppWork(deps());
  expect(summary.events.done).toBe(1);
  expect(summary.sends.accepted).toBe(1);

  const inbound = await messageFor(id);
  expect(inbound).toMatchObject({
    content_type: "text",
    body: "When's my next lesson?",
  });
  const [reply] = await repliesTo(inbound!.id);
  expect(reply.body).toMatch(/^Your next driving lesson is .+ at 16:00\.$/);
  expect(reply.delivery).toBe("accepted");
  expect(transport.sent).toEqual([
    { type: "text", to: "+447700900123", body: reply.body },
  ]);
  expect(await delivery(reply.id)).toMatchObject({
    dispatch: "done",
    attempts: 1,
    sent_via: "text",
    provider_message_id: expect.stringMatching(/^wamid\.fake-/),
  });
  expect(await openActions(inbound!.id)).toEqual([]);

  // WhatsApp usage: one row for the message WhatsApp accepted.
  const d = await delivery(reply.id);
  const { data: usage } = await admin()
    .from("usage_events")
    .select(
      "category, provider, operation, destination_country, billable, estimated_cost_micros, external_reference",
    )
    .eq("external_reference", d!.provider_message_id!);
  expect(usage).toEqual([
    {
      category: "whatsapp",
      provider: "meta",
      operation: "send_text",
      destination_country: "GB",
      billable: null,
      estimated_cost_micros: null,
      external_reference: d!.provider_message_id,
    },
  ]);
  // The event's copy of the text is gone once stored as a message.
  const { data: event } = await admin()
    .from("whatsapp_events")
    .select("status, payload, message_id")
    .eq("event_key", `message:${id}`)
    .single();
  expect(event).toMatchObject({ status: "done", message_id: inbound!.id });
  expect(event!.payload).not.toHaveProperty("text");
});

test("Meta's current payload shape works end to end, and its internal fields aren't kept", async () => {
  const id = wamid();
  const payload = currentMetaInboundText({
    id,
    from: SARAH,
    body: "When's my next lesson?",
    phoneNumberId: NUMBER_ID,
  });
  expect(await deliver(payload)).toEqual({
    status: 200,
    stored: 1,
    duplicates: 0,
  });
  await runWhatsAppWork(deps());

  const inbound = await messageFor(id);
  expect(inbound).toMatchObject({
    content_type: "text",
    body: "When's my next lesson?",
  });
  const { data: event } = await admin()
    .from("whatsapp_events")
    .select("status, sender, payload")
    .eq("event_key", `message:${id}`)
    .single();
  expect(event).toMatchObject({ status: "done", sender: SARAH });
  expect(Object.keys(event!.payload as object).sort()).toEqual([
    "content_type",
    "sender_user_id",
    "sender_wa_id",
    "type",
  ]);
  expect(transport.sent).toEqual([
    expect.objectContaining({ type: "text", to: "+447700900123" }),
  ]);

  // The same delivery again: nothing more.
  expect(await deliver(payload)).toEqual({
    status: 200,
    stored: 0,
    duplicates: 1,
  });
  await runWhatsAppWork(deps());
  expect(transport.sent).toHaveLength(1);
});

test("Meta retrying the same message changes nothing", async () => {
  const id = wamid();
  const payload = inboundText({
    id,
    from: SARAH,
    body: "When's my next lesson?",
    phoneNumberId: NUMBER_ID,
  });
  await deliver(payload);
  await runWhatsAppWork(deps());
  expect(transport.sent).toHaveLength(1);

  const again = await deliver(payload);
  expect(again).toEqual({ status: 200, stored: 0, duplicates: 1 });
  await runWhatsAppWork(deps());
  expect(transport.sent).toHaveLength(1);
  const { count } = await admin()
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("external_id", id);
  expect(count).toBe(1);

  // The customer sending the same words again is a new message.
  await deliver(
    inboundText({
      id: wamid(),
      from: SARAH,
      body: "When's my next lesson?",
      phoneNumberId: NUMBER_ID,
    }),
  );
  await runWhatsAppWork(deps());
  expect(transport.sent).toHaveLength(2);
});

test("statuses only move forward, and pricing lands on the usage row", async () => {
  const id = wamid();
  await deliver(
    inboundText({
      id,
      from: SARAH,
      body: "When's my next lesson?",
      phoneNumberId: NUMBER_ID,
    }),
  );
  await runWhatsAppWork(deps());
  const [reply] = await repliesTo((await messageFor(id))!.id);
  const providerId = (await delivery(reply.id))!.provider_message_id!;
  const t = (s: number) => new Date(Date.now() + s * 1000);

  await deliver(
    statusUpdate({
      id: providerId,
      status: "sent",
      at: t(1),
      category: "service",
      phoneNumberId: NUMBER_ID,
    }),
  );
  await deliver(
    statusUpdate({
      id: providerId,
      status: "read",
      at: t(3),
      category: "service",
      phoneNumberId: NUMBER_ID,
    }),
  );
  // Late, and repeated.
  await deliver(
    statusUpdate({
      id: providerId,
      status: "delivered",
      at: t(2),
      category: "service",
      phoneNumberId: NUMBER_ID,
    }),
  );
  await deliver(
    statusUpdate({
      id: providerId,
      status: "delivered",
      at: t(2),
      category: "service",
      phoneNumberId: NUMBER_ID,
    }),
  );
  // A failure after it was read changes nothing.
  await deliver(
    statusUpdate({
      id: providerId,
      status: "failed",
      at: t(4),
      errorCode: 131026,
      phoneNumberId: NUMBER_ID,
    }),
  );
  await runWhatsAppWork(deps());

  expect(await messageDelivery(reply.id)).toBe("read");
  expect(await delivery(reply.id)).toMatchObject({
    sent_at: expect.any(String),
    delivered_at: expect.any(String),
    read_at: expect.any(String),
  });
  expect(await openActions(reply.id)).toEqual([]);
  const { data: usage } = await admin()
    .from("usage_events")
    .select("billable, message_category, metadata")
    .eq("external_reference", providerId)
    .single();
  expect(usage).toMatchObject({
    billable: false,
    message_category: "service",
    metadata: expect.objectContaining({
      pricing_type: "free_customer_service",
      pricing_model: "PMP",
    }),
  });
});

test("a message WhatsApp then fails is marked not sent, and the owner is told", async () => {
  const id = wamid();
  await deliver(
    inboundText({
      id,
      from: SARAH,
      body: "When's my next lesson?",
      phoneNumberId: NUMBER_ID,
    }),
  );
  await runWhatsAppWork(deps());
  const [reply] = await repliesTo((await messageFor(id))!.id);
  const providerId = (await delivery(reply.id))!.provider_message_id!;

  await deliver(
    statusUpdate({
      id: providerId,
      status: "failed",
      errorCode: 131026,
      phoneNumberId: NUMBER_ID,
    }),
  );
  await runWhatsAppWork(deps());
  expect(await messageDelivery(reply.id)).toBe("failed");
  expect(await openActions(reply.id)).toEqual([
    expect.objectContaining({
      kind: "failure",
      understood: {
        reason: "message_not_sent",
        purpose: "reply",
        cause: "provider_failed",
      },
    }),
  ]);
  const { data: activity } = await admin()
    .from("activity_events")
    .select("kind, details")
    .eq("message_id", reply.id)
    .eq("kind", "message_not_sent");
  expect(activity).toHaveLength(1);
});

test("B: availability gets up to three real times, and nothing changes", async () => {
  const { count: before } = await admin()
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId);
  await deliver(
    inboundText({
      id: wamid(),
      from: SARAH,
      body: "Anything after 4 Friday?",
      phoneNumberId: NUMBER_ID,
    }),
  );
  await runWhatsAppWork(deps());
  expect(transport.sent).toHaveLength(1);
  const body = (transport.sent[0] as { body: string }).body;
  const times = body.match(/\d\d:\d\d/g) ?? [];
  expect(times.length).toBeLessThanOrEqual(3);
  for (const time of times) expect(time >= "16:00").toBe(true);
  const { count: after } = await admin()
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId);
  expect(after).toBe(before);
});

test("C: a reschedule waits for the owner; the approved confirmation goes on WhatsApp", async () => {
  const reading = new StaticMessageInterpreter(
    interpretation({
      intent: "reschedule_request",
      referenced_booking: {
        kind: "next",
        date: null,
        time: null,
        service: null,
      },
      requested_date: {
        kind: "weekday",
        weekday: "friday",
        week: null,
        day: null,
        month: null,
      },
      requested_time: { constraint: "after", time: "16:00" },
    }),
  );
  const id = wamid();
  await deliver(
    inboundText({
      id,
      from: SARAH,
      body: "Can we move my next lesson to Friday after 4?",
      phoneNumberId: NUMBER_ID,
    }),
    deps(reading),
  );
  await runWhatsAppWork(deps(reading));
  expect(transport.sent).toEqual([]);
  const [request] = await openActions((await messageFor(id))!.id);
  expect(request.kind).toBe("reschedule_request");
  const { data: bookingBefore } = await admin()
    .from("bookings")
    .select("starts_at")
    .eq("id", request.booking_id!)
    .single();

  const owner = await ownerClient(email);
  const approve = () =>
    owner.rpc("resolve_reschedule_request", {
      p_action_id: request.id,
      p_decision: "approve",
      p_starts_at: request.proposed_starts_at!,
      p_reply_body: "Hi Sarah, that’s done. See you then!",
    });
  expect((await approve()).error).toBeNull();
  // Clicking twice sends nothing twice.
  expect((await approve()).error?.hint).toBe("already_resolved");

  const { data: bookingAfter } = await admin()
    .from("bookings")
    .select("starts_at")
    .eq("id", request.booking_id!)
    .single();
  expect(bookingAfter!.starts_at).not.toBe(bookingBefore!.starts_at);

  await runWhatsAppWork(deps());
  await runWhatsAppWork(deps());
  expect(transport.sent).toEqual([
    {
      type: "text",
      to: "+447700900123",
      body: "Hi Sarah, that’s done. See you then!",
    },
  ]);
});

test("D: a cancellation is acknowledged on WhatsApp and waits for the owner", async () => {
  const reading = new StaticMessageInterpreter(
    interpretation({
      intent: "cancellation_request",
      referenced_booking: {
        kind: "next",
        date: null,
        time: null,
        service: null,
      },
      cancellation_scope: "single",
    }),
  );
  const id = wamid();
  await deliver(
    inboundText({
      id,
      from: SARAH,
      body: "Need to cancel my next one sorry",
      phoneNumberId: NUMBER_ID,
    }),
    deps(reading),
  );
  await runWhatsAppWork(deps(reading));
  expect(transport.sent).toEqual([
    {
      type: "text",
      to: "+447700900123",
      body: "I’ve got your cancellation request. I’ll confirm it shortly.",
    },
  ]);
  const [request] = await openActions((await messageFor(id))!.id);
  expect(request.kind).toBe("cancellation_request");
  const { data: booking } = await admin()
    .from("bookings")
    .select("status")
    .eq("id", request.booking_id!)
    .single();
  expect(booking!.status).toBe("confirmed");
});

test("E: an unknown number asking about a customer gets nothing back", async () => {
  const id = wamid();
  await deliver(
    inboundText({
      id,
      from: UNKNOWN,
      body: "When is Sarah booked?",
      phoneNumberId: NUMBER_ID,
    }),
  );
  await runWhatsAppWork(deps());
  expect(transport.sent).toEqual([]);
  const message = await messageFor(id);
  expect(await openActions(message!.id)).toEqual([
    expect.objectContaining({
      kind: "reply_needed",
      understood: expect.objectContaining({ reason: "identity_unknown" }),
    }),
  ]);
});

test("a voice note goes to the owner without asking the model", async () => {
  let calls = 0;
  const counting: MessageInterpreter = {
    name: "fixture",
    model: null,
    interpret: async (request) => {
      calls++;
      return fixture().interpret(request);
    },
  };
  const id = wamid();
  await deliver(
    inboundOfType({
      id,
      from: SARAH,
      type: "audio",
      part: { id: "media-1", voice: true },
      phoneNumberId: NUMBER_ID,
    }),
    deps(counting),
  );
  await runWhatsAppWork(deps(counting));
  expect(calls).toBe(0);
  expect(transport.sent).toEqual([]);
  const message = await messageFor(id);
  expect(message).toMatchObject({
    content_type: "audio",
    body: "Voice message",
  });
  expect(await openActions(message!.id)).toEqual([
    expect.objectContaining({
      kind: "reply_needed",
      understood: expect.objectContaining({
        reason: "unsupported_content",
        content_type: "audio",
      }),
    }),
  ]);

  // A reaction is recorded and left alone.
  const reaction = wamid();
  await deliver(
    inboundOfType({
      id: reaction,
      from: SARAH,
      type: "reaction",
      part: { emoji: "👍" },
      phoneNumberId: NUMBER_ID,
    }),
  );
  await runWhatsAppWork(deps());
  expect(await messageFor(reaction)).toBeNull();
  const { data: event } = await admin()
    .from("whatsapp_events")
    .select("status")
    .eq("event_key", `message:${reaction}`)
    .single();
  expect(event!.status).toBe("ignored");
});

test("a message without a shared number reaches the owner, not the pipeline", async () => {
  const { count: before } = await admin()
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId);
  await deliver(
    inboundOfType({
      id: wamid(),
      from: null,
      userId: "GB.bsuid-1",
      type: "text",
      part: { body: "hi" },
      phoneNumberId: NUMBER_ID,
    }),
  );
  await runWhatsAppWork(deps());
  const { count: after } = await admin()
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId);
  expect(after).toBe(before);
  const { data: notes } = await admin()
    .from("pending_actions")
    .select("understood")
    .eq("business_id", businessId)
    .eq("kind", "failure")
    .contains("understood", { reason: "number_not_shared" });
  expect(notes).toHaveLength(1);
});

test("events for a number no business has are kept aside, never routed", async () => {
  const id = wamid();
  await deliver(
    inboundText({
      id,
      from: SARAH,
      body: "When's my next lesson?",
      phoneNumberId: "799999999999",
    }),
  );
  await runWhatsAppWork(deps());
  const { data: event } = await admin()
    .from("whatsapp_events")
    .select("status, business_id, error_category")
    .eq("event_key", `message:${id}`)
    .single();
  expect(event).toEqual({
    status: "unroutable",
    business_id: null,
    error_category: "unknown_number",
  });
  const { count } = await admin()
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("external_id", id);
  expect(count).toBe(0);
  expect(transport.sent).toEqual([]);
});

test("a spoofed webhook is refused before anything is stored", async () => {
  const body = JSON.stringify(
    inboundText({
      id: wamid(),
      from: SARAH,
      body: "hi",
      phoneNumberId: NUMBER_ID,
    }),
  );
  const result = await ingestWebhook(deps(), {
    rawBody: new TextEncoder().encode(body),
    signature: signBody(body, "not-the-secret"),
    appSecret: SECRET,
  });
  expect(result).toEqual({ status: 401, reason: "bad_signature" });
});

test("outside the 24-hour window: a reply is blocked and the owner told", async () => {
  const inbound = wamid();
  await deliver(
    inboundText({
      id: inbound,
      from: OMAR,
      body: "Cheers, see you then",
      phoneNumberId: NUMBER_ID,
    }),
  );
  await runWhatsAppWork(deps());
  await ageInbound(inbound, 30);

  // The owner replies to Omar a day and a half later.
  const message = await messageFor(inbound);
  const { data: action } = await admin()
    .from("pending_actions")
    .insert({
      business_id: businessId,
      kind: "reply_needed",
      conversation_id: message!.conversation_id,
      understood: { reason: "business_question" },
    })
    .select("id")
    .single();
  const owner = await ownerClient(email);
  expect(
    (
      await owner.rpc("reply_to_pending_action", {
        p_action_id: action!.id,
        p_body: "Sorry for the slow reply!",
      })
    ).error,
  ).toBeNull();
  await runWhatsAppWork(deps());
  expect(transport.sent).toEqual([]);
  const { data: reply } = await admin()
    .from("messages")
    .select("id, delivery")
    .eq("conversation_id", message!.conversation_id)
    .eq("author", "owner")
    .single();
  expect(reply!.delivery).toBe("blocked");
  expect(await openActions(reply!.id)).toEqual([
    expect.objectContaining({
      kind: "failure",
      understood: {
        reason: "message_not_sent",
        purpose: "owner_reply",
        cause: "template_required",
      },
    }),
  ]);
});

test("reminders: text in the window, a template outside it, and never a pretend send", async () => {
  // Aisha messaged 30 hours ago, Sarah just now (earlier tests); Chloe never.
  const aisha = wamid();
  await deliver(
    inboundText({
      id: aisha,
      from: AISHA,
      body: "Cheers, see you then",
      phoneNumberId: NUMBER_ID,
    }),
  );
  await runWhatsAppWork(deps());
  await ageInbound(aisha, 30);

  async function dueReminderFor(name: string) {
    const { data: booking } = await admin()
      .from("bookings")
      .select("id, customer:customers!inner ( full_name )")
      .eq("business_id", businessId)
      .eq("customer.full_name", name)
      .eq("status", "confirmed")
      .gt("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(1)
      .single();
    await admin().from("reminders").delete().eq("booking_id", booking!.id);
    const { data: reminder } = await admin()
      .from("reminders")
      .insert({
        business_id: businessId,
        booking_id: booking!.id,
        send_at: new Date(Date.now() - 60e3).toISOString(),
      })
      .select("id")
      .single();
    return reminder!.id;
  }
  const reminderState = async (id: string) =>
    (
      await admin()
        .from("reminders")
        .select("status, message_id")
        .eq("id", id)
        .single()
    ).data!;

  // C: window closed, no approved template: not sent, and it says why.
  const aishaReminder = await dueReminderFor("Aisha Begum");
  // Only this reminder is due in this business.
  await admin()
    .from("reminders")
    .update({ status: "cancelled" })
    .eq("business_id", businessId)
    .eq("status", "scheduled")
    .neq("id", aishaReminder);
  await runWhatsAppWork(deps());
  expect(transport.sent).toEqual([]);
  expect(await reminderState(aishaReminder)).toMatchObject({
    status: "not_sent",
  });
  const { data: notSent } = await admin()
    .from("activity_events")
    .select("details")
    .eq("business_id", businessId)
    .eq("kind", "reminder_not_sent")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .single();
  expect(notSent!.details).toEqual({ reason: "template_required" });

  // B: window closed, approved template: the template goes, filled in.
  const { error: templateError } = await admin()
    .from("whatsapp_templates")
    .insert({
      business_id: businessId,
      connection_id: connectionId,
      purpose: "appointment_reminder",
      name: "appointment_reminder",
      language: "en_GB",
      parameters: ["customer_first_name", "when"],
      provider_status: "APPROVED",
    });
  expect(templateError).toBeNull();
  const aishaAgain = await dueReminderFor("Aisha Begum");
  await runWhatsAppWork(deps());
  expect(transport.sent).toEqual([
    expect.objectContaining({
      type: "template",
      to: "+447700900345",
      name: "appointment_reminder",
      language: "en_GB",
      parameters: [
        "Aisha",
        expect.stringMatching(/^\w+day \d+ \w+ at \d\d:\d\d$/),
      ],
    }),
  ]);
  expect(await reminderState(aishaAgain)).toMatchObject({ status: "sent" });

  // A: window open: plain text.
  transport = new FakeMessagingTransport();
  const sarahReminder = await dueReminderFor("Sarah Khan");
  await runWhatsAppWork(deps());
  expect(transport.sent).toEqual([
    expect.objectContaining({
      type: "text",
      to: "+447700900123",
      body: expect.stringMatching(/^Hi Sarah, just a reminder:/),
    }),
  ]);
  expect(await reminderState(sarahReminder)).toMatchObject({ status: "sent" });

  // A simulator conversation, while connected: recorded, and it says so.
  transport = new FakeMessagingTransport();
  await processInboundMessage(
    { db: admin(), interpreter: fixture() },
    {
      businessId,
      from: "+447700900234",
      body: "Cheers, see you then",
      externalId: `sim-${Date.now()}`,
      source: "simulator",
    },
  );
  const tom = await dueReminderFor("Tom Reid");
  await runWhatsAppWork(deps());
  expect(transport.sent).toEqual([]);
  expect(await reminderState(tom)).toMatchObject({ status: "not_sent" });
  const { data: simulated } = await admin()
    .from("activity_events")
    .select("details")
    .eq("business_id", businessId)
    .eq("kind", "reminder_not_sent")
    .order("occurred_at", { ascending: false })
    .order("seq", { ascending: false })
    .limit(1)
    .single();
  expect(simulated!.details).toEqual({ reason: "simulated" });

  // Never messaged on WhatsApp: not sent.
  transport = new FakeMessagingTransport();
  const chloe = await dueReminderFor("Chloe Evans");
  await runWhatsAppWork(deps());
  expect(transport.sent).toEqual([]);
  expect(await reminderState(chloe)).toMatchObject({ status: "not_sent" });
});

test("a temporary failure is retried with backoff; a refusal isn't", async () => {
  transport = new FakeMessagingTransport([
    { ok: false, category: "transient", code: 130429 },
  ]);
  const id = wamid();
  await deliver(
    inboundText({
      id,
      from: SARAH,
      body: "When's my next lesson?",
      phoneNumberId: NUMBER_ID,
    }),
  );
  const first = await runWhatsAppWork(deps());
  expect(first.sends).toMatchObject({ retried: 1, throttled: true });
  const [reply] = await repliesTo((await messageFor(id))!.id);
  expect(await delivery(reply.id)).toMatchObject({
    dispatch: "queued",
    attempts: 1,
    error_category: "transient",
  });
  expect(await messageDelivery(reply.id)).toBe("queued");

  // Not before its time.
  await runWhatsAppWork(deps());
  expect(transport.sent).toHaveLength(1);
  await admin()
    .from("message_deliveries")
    .update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() })
    .eq("message_id", reply.id);
  await runWhatsAppWork(deps());
  expect(transport.sent).toHaveLength(2);
  expect(await delivery(reply.id)).toMatchObject({
    dispatch: "done",
    attempts: 2,
  });
  expect(await messageDelivery(reply.id)).toBe("accepted");

  // Undeliverable: failed at once, never retried.
  transport = new FakeMessagingTransport([
    { ok: false, category: "recipient_unavailable", code: 131026 },
  ]);
  const second = wamid();
  await deliver(
    inboundText({
      id: second,
      from: SARAH,
      body: "When's my next lesson?",
      phoneNumberId: NUMBER_ID,
    }),
  );
  await runWhatsAppWork(deps());
  await runWhatsAppWork(deps());
  expect(transport.sent).toHaveLength(1);
  const [refused] = await repliesTo((await messageFor(second))!.id);
  expect(await messageDelivery(refused.id)).toBe("failed");
  expect(await delivery(refused.id)).toMatchObject({
    dispatch: "done",
    error_category: "recipient_unavailable",
    error_code: 131026,
  });
});

test("revoked credentials stop sending and flag the connection", async () => {
  transport = new FakeMessagingTransport([
    { ok: false, category: "connection", code: 190 } as SendResult,
  ]);
  const id = wamid();
  await deliver(
    inboundText({
      id,
      from: SARAH,
      body: "When's my next lesson?",
      phoneNumberId: NUMBER_ID,
    }),
  );
  await runWhatsAppWork(deps());
  const { data: connection } = await admin()
    .from("whatsapp_connections")
    .select("status, last_error_category")
    .eq("id", connectionId)
    .single();
  expect(connection).toEqual({
    status: "needs_attention",
    last_error_category: "provider_refused",
  });
  const [reply] = await repliesTo((await messageFor(id))!.id);
  expect(await messageDelivery(reply.id)).toBe("blocked");

  // Another message: stored and answered by the pipeline, but not sent.
  const next = wamid();
  await deliver(
    inboundText({
      id: next,
      from: SARAH,
      body: "When's my next lesson?",
      phoneNumberId: NUMBER_ID,
    }),
  );
  await runWhatsAppWork(deps());
  expect(transport.sent).toHaveLength(1);
  const [queued] = await repliesTo((await messageFor(next))!.id);
  expect(await messageDelivery(queued.id)).toBe("blocked");

  await admin()
    .from("whatsapp_connections")
    .update({ status: "connected", last_error_category: null })
    .eq("id", connectionId);
});

test("a send that stopped mid-way is reported, never repeated", async () => {
  // A message is queued, and a worker claims it and dies before WhatsApp answers.
  const id = wamid();
  await deliver(
    inboundText({
      id,
      from: SARAH,
      body: "When's my next lesson?",
      phoneNumberId: NUMBER_ID,
    }),
  );
  const noSends = deps();
  await runWhatsAppWork(noSends, { sends: 0 });
  const [reply] = await repliesTo((await messageFor(id))!.id);
  const { data: claimed } = await admin().rpc("claim_outbound_delivery");
  expect((claimed as { message_id: string }).message_id).toBe(reply.id);
  await admin()
    .from("message_deliveries")
    .update({ claimed_at: new Date(Date.now() - 10 * 60e3).toISOString() })
    .eq("message_id", reply.id);

  const summary = await runWhatsAppWork(deps());
  expect(summary.recovered).toBe(1);
  expect(transport.sent).toEqual([]);
  expect(await messageDelivery(reply.id)).toBe("failed");
  expect(await openActions(reply.id)).toEqual([
    expect.objectContaining({
      understood: {
        reason: "message_not_sent",
        purpose: "reply",
        cause: "outcome_unknown",
      },
    }),
  ]);
});

test("a webhook event abandoned mid-way is processed once, later", async () => {
  const id = wamid();
  await deliver(
    inboundText({
      id,
      from: SARAH,
      body: "When's my next lesson?",
      phoneNumberId: NUMBER_ID,
    }),
  );
  const { data: claimed } = await admin().rpc("claim_whatsapp_event", {});
  expect((claimed as { event_key: string }[])[0].event_key).toBe(
    `message:${id}`,
  );
  // The worker dies. Within the lease nobody else takes it…
  await runWhatsAppWork(deps());
  expect(await messageFor(id)).toBeNull();
  // …after it, the next worker does, once.
  await admin()
    .from("whatsapp_events")
    .update({ claimed_at: new Date(Date.now() - 10 * 60e3).toISOString() })
    .eq("event_key", `message:${id}`);
  await runWhatsAppWork(deps());
  await runWhatsAppWork(deps());
  expect(await messageFor(id)).not.toBeNull();
  expect(transport.sent).toHaveLength(1);
});

test("workers racing each other send each message once, in order per customer", async () => {
  const first = wamid();
  const second = wamid();
  const now = Date.now();
  // Arrive in one webhook, newest first.
  await deliver({
    object: "whatsapp_business_account",
    entry: [
      ...inboundText({
        id: second,
        from: SARAH,
        body: "Anything after 4 Friday?",
        at: new Date(now),
        phoneNumberId: NUMBER_ID,
      }).entry,
      ...inboundText({
        id: first,
        from: SARAH,
        body: "When's my next lesson?",
        at: new Date(now - 5000),
        phoneNumberId: NUMBER_ID,
      }).entry,
    ],
  });
  await Promise.all([
    runWhatsAppWork(deps()),
    runWhatsAppWork(deps()),
    runWhatsAppWork(deps()),
  ]);
  await runWhatsAppWork(deps());
  expect(transport.sent).toHaveLength(2);
  const a = await messageFor(first);
  const b = await messageFor(second);
  const { data: runs } = await admin()
    .from("message_processing_runs")
    .select("message_id, completed_at")
    .in("message_id", [a!.id, b!.id]);
  const done = new Map(runs!.map((r) => [r.message_id, r.completed_at!]));
  expect(done.get(a!.id)! <= done.get(b!.id)!).toBe(true);
});

test("disconnecting stops routing and sending, and keeps history", async () => {
  const owner = await ownerClient(email);
  const { count: before } = await admin()
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId);

  // Owners can't reconnect by editing the row; they can disconnect.
  const sneaky = await owner
    .from("whatsapp_connections")
    .update({ status: "connected" })
    .eq("id", connectionId);
  expect(sneaky.error?.hint).toBe("not_allowed");
  expect((await owner.rpc("disconnect_whatsapp")).error).toBeNull();

  const id = wamid();
  await deliver(
    inboundText({
      id,
      from: SARAH,
      body: "When's my next lesson?",
      phoneNumberId: NUMBER_ID,
    }),
  );
  await runWhatsAppWork(deps());
  expect(await messageFor(id)).toBeNull();
  const { data: event } = await admin()
    .from("whatsapp_events")
    .select("status")
    .eq("event_key", `message:${id}`)
    .single();
  expect(event!.status).toBe("ignored");
  expect(transport.sent).toEqual([]);
  const { count: after } = await admin()
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId);
  expect(after).toBe(before);

  await admin()
    .from("whatsapp_connections")
    .update({ status: "connected", disconnected_at: null })
    .eq("id", connectionId);
});

test("channel internals stay with the server, and each business sees only its own", async () => {
  const owner = await ownerClient(email);
  const own = await owner
    .from("whatsapp_connections")
    .select("status, display_phone_number, verified_name, last_inbound_at")
    .eq("id", connectionId)
    .single();
  expect(own.error).toBeNull();
  expect(own.data!.display_phone_number).toBe("+447700900000");

  const ids = await owner
    .from("whatsapp_connections")
    .select("phone_number_id, waba_id")
    .eq("id", connectionId);
  expect(ids.error?.code).toBe("42501");
  for (const table of [
    "whatsapp_events",
    "message_deliveries",
    "whatsapp_templates",
  ] as const) {
    const { data, error } = await owner.from(table).select("*").limit(1);
    expect(error?.code === "42501" || (data ?? []).length === 0, table).toBe(
      true,
    );
  }
  for (const fn of [
    "claim_whatsapp_event",
    "claim_outbound_delivery",
    "recover_stale_deliveries",
  ] as const) {
    const { error } = await owner.rpc(fn, {});
    expect(error?.code, fn).toBe("42501");
  }

  const other = await demoOwner(otherEmail);
  const theirs = await other.client
    .from("whatsapp_connections")
    .select("status")
    .eq("id", connectionId);
  expect(theirs.data).toEqual([]);
  // Another business's number routes only to that business.
  const { data: otherConnection } = await admin()
    .from("whatsapp_connections")
    .insert({
      business_id: other.businessId,
      mode: "developer",
      status: "connected",
      phone_number_id: OTHER_NUMBER_ID,
    })
    .select("id")
    .single();
  const id = wamid();
  await deliver(
    inboundText({
      id,
      from: SARAH,
      body: "When's my next lesson?",
      phoneNumberId: OTHER_NUMBER_ID,
    }),
  );
  await runWhatsAppWork(deps());
  const { data: message } = await admin()
    .from("messages")
    .select("business_id")
    .eq("external_id", id)
    .single();
  expect(message!.business_id).toBe(other.businessId);
  await admin()
    .from("whatsapp_connections")
    .delete()
    .eq("id", otherConnection!.id);
});
