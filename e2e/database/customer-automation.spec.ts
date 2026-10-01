import { expect, test } from "@playwright/test";
import { availableSlots } from "../../src/domain/availability/engine";
import {
  type Interpretation,
  interpretation,
} from "../../src/domain/messages/interpretation";
import {
  bookingConfirmation,
  cancellationConfirmation,
  rescheduleConfirmation,
} from "../../src/domain/messages/templates";
import {
  addDays,
  addMinutes,
  clockTimeOf,
  type DateKey,
  dateKeyOf,
} from "../../src/domain/time/zoned";
import {
  type PipelineDeps,
  processInboundMessage,
} from "../../src/features/messages/pipeline";
import { loadScheduleContext } from "../../src/features/schedule/load-schedule";
import {
  StaticMessageInterpreter,
  UnavailableMessageInterpreter,
} from "../../src/lib/ai/fixture-interpreter";
import type { MessageInterpreter } from "../../src/lib/ai/interpreter";
import { adminClient, type Db, demoOwner, hasKeys, ownerClient } from "./db";

// The customer automation loop against the real database: requests are
// raised by the pipeline, answered by the owner through the same database
// functions the app uses, and must never act on a stale picture. Fixed
// readings (no model) and a customer of our own, Nina, whose bookings are
// placed in times that are really free, so nothing here depends on the
// date it runs.

test.describe.configure({ mode: "serial" });
test.skip(!hasKeys, "Needs the Supabase keys in .env.local");

const email = "db-automation@pingflow.test";
const otherEmail = "db-automation-other@pingflow.test";
const NINA = "+447700900321";
const UNKNOWN = "+447700900111";
const DANA = "+447700900567";
const TZ = "Europe/London";

let businessId = "";
let otherBusinessId = "";
/** Signed in as the owner once: sign-in links replace each other. */
let owner: Db;
let ninaId = "";
let omarId = "";
let lessonId = "";
let seq = 0;
const nextId = () => `auto-${Date.now()}-${++seq}`;
const admin = () => adminClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reads(
  i: Partial<Interpretation> & Pick<Interpretation, "intent">,
): MessageInterpreter {
  return new StaticMessageInterpreter(interpretation(i));
}

function send(
  body: string,
  interpreter: MessageInterpreter,
  options: { from?: string; externalId?: string; business?: string } = {},
) {
  const deps: PipelineDeps = { db: admin(), interpreter };
  return processInboundMessage(deps, {
    businessId: options.business ?? businessId,
    from: options.from ?? NINA,
    body,
    externalId: options.externalId ?? nextId(),
    source: "simulator",
  });
}

const cal = (date: DateKey) => ({
  kind: "calendar_date" as const,
  weekday: null,
  week: null,
  day: Number(date.slice(8, 10)),
  month: Number(date.slice(5, 7)),
});
const exact = (time: string) => ({ constraint: "exact" as const, time });
const onDate = (date: DateKey, time: string | null = null) => ({
  kind: "on_date" as const,
  date: cal(date),
  time,
  service: null,
});

/** Free one-hour lesson starts, from `fromDays` days ahead. */
async function freeSlots(fromDays = 2, days = 12) {
  const today = dateKeyOf(new Date(), TZ);
  const context = await loadScheduleContext(
    admin(),
    { id: businessId, timeZone: TZ, scheduleMode: "regular" },
    today,
    fromDays + days + 1,
  );
  const found: { date: DateKey; time: string; startsAt: Date }[] = [];
  for (let d = fromDays; d < fromDays + days; d++) {
    const date = addDays(today, d);
    for (const s of availableSlots(
      context,
      date,
      { durationMinutes: 60, bufferMinutes: 15 },
      { now: new Date() },
    )) {
      found.push({
        date,
        time: clockTimeOf(s.startsAt, TZ),
        startsAt: s.startsAt,
      });
    }
  }
  return found;
}

/** A free slot, and another on the same day at least two hours later. */
async function freePair(fromDays = 2) {
  const slots = await freeSlots(fromDays);
  for (const a of slots) {
    const b = slots.find(
      (s) =>
        s.date === a.date &&
        s.startsAt.getTime() - a.startsAt.getTime() >= 2 * 3600e3,
    );
    if (b) return [a, b] as const;
  }
  throw new Error("No free pair of slots");
}

async function book(customerId: string, startsAt: Date) {
  const { data, error } = await admin()
    .from("bookings")
    .insert({
      business_id: businessId,
      customer_id: customerId,
      service_id: lessonId,
      starts_at: startsAt.toISOString(),
      ends_at: addMinutes(startsAt, 60).toISOString(),
      buffer_minutes: 15,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function openRequests(kind?: string) {
  let q = admin()
    .from("pending_actions")
    .select(
      "id, kind, status, booking_id, understood, proposed_starts_at, resolution",
    )
    .eq("business_id", businessId)
    .eq("customer_id", ninaId)
    .eq("status", "open");
  if (kind) q = q.eq("kind", kind as never);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

async function request(id: string) {
  const { data, error } = await admin()
    .from("pending_actions")
    .select("id, kind, status, booking_id, resolution")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

/** Nina's bookings still on: earlier tests' are cancelled before each test. */
async function ninasBookings() {
  const { data, error } = await admin()
    .from("bookings")
    .select("id, starts_at, status")
    .eq("business_id", businessId)
    .eq("customer_id", ninaId)
    .or(`status.eq.confirmed,updated_at.gte.${testStarted}`)
    .order("starts_at");
  if (error) throw error;
  return data;
}

async function outbound(since: string) {
  const { data, error } = await admin()
    .from("messages")
    .select("body, author")
    .eq("business_id", businessId)
    .eq("direction", "outbound")
    .gte("sent_at", since)
    .order("sent_at");
  if (error) throw error;
  return data;
}

async function activityFor(actionId: string) {
  const { data, error } = await admin()
    .from("activity_events")
    .select("kind, actor, details")
    .eq("pending_action_id", actionId)
    .order("occurred_at");
  if (error) throw error;
  return data;
}

const reminderAt = (startsAt: Date) =>
  addMinutes(startsAt, -1440) > new Date() ? addMinutes(startsAt, -1440) : null;

/** The owner's approval, as the Attention action sends it. */
async function approve(
  kind: "reschedule" | "booking",
  actionId: string,
  startsAt: Date,
) {
  const body =
    kind === "reschedule"
      ? rescheduleConfirmation({
          customerName: "Nina Patel",
          serviceName: "Driving lesson",
          startsAt,
          timeZone: TZ,
        })
      : bookingConfirmation({
          customerName: "Nina Patel",
          serviceName: "Driving lesson",
          startsAt,
          timeZone: TZ,
        });
  return owner.rpc(
    kind === "reschedule"
      ? "resolve_reschedule_request"
      : "resolve_booking_request",
    {
      p_action_id: actionId,
      p_decision: "approve",
      p_starts_at: startsAt.toISOString(),
      p_reply_body: body,
      p_reminder_send_at: reminderAt(startsAt)?.toISOString(),
    },
  );
}

async function approveCancellation(actionId: string, startsAt: Date) {
  return owner.rpc("resolve_cancellation_request", {
    p_action_id: actionId,
    p_decision: "approve",
    p_reply_body: cancellationConfirmation({
      customerName: "Nina Patel",
      serviceName: "Driving lesson",
      startsAt,
      timeZone: TZ,
    }),
  });
}

// ---------------------------------------------------------------------------
// Setup: a fresh demo business with Nina, and a second business
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  const signedIn = await demoOwner(email);
  businessId = signedIn.businessId;
  owner = signedIn.client;
  otherBusinessId = (await demoOwner(otherEmail)).businessId;
  const db = admin();
  const { data: nina } = await db
    .from("customers")
    .insert({ business_id: businessId, full_name: "Nina Patel" })
    .select("id")
    .single();
  ninaId = nina!.id;
  const { data: contact } = await db
    .from("contacts")
    .insert({ business_id: businessId, phone_e164: NINA })
    .select("id")
    .single();
  await db.from("customer_contacts").insert({
    business_id: businessId,
    customer_id: ninaId,
    contact_id: contact!.id,
    relationship: "self",
  });
  const { data: omar } = await db
    .from("customers")
    .select("id")
    .eq("business_id", businessId)
    .eq("full_name", "Omar Ali")
    .single();
  omarId = omar!.id;
  const { data: lesson } = await db
    .from("services")
    .select("id")
    .eq("business_id", businessId)
    .eq("name", "Driving lesson")
    .single();
  lessonId = lesson!.id;
});

// Each test starts from a quiet conversation: no open question, nothing of
// Nina's waiting, and none of her bookings left over.
let testStarted = "";

test.beforeEach(async () => {
  const db = admin();
  await db
    .from("pending_actions")
    .update({
      status: "dismissed",
      resolved_at: new Date().toISOString(),
      resolution: { reason: "test_reset" },
    })
    .eq("business_id", businessId)
    .eq("customer_id", ninaId)
    .eq("status", "open");
  await db
    .from("conversations")
    .update({ clarification: null, automation_paused_at: null })
    .eq("business_id", businessId);
  await db
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("customer_id", ninaId)
    .eq("status", "confirmed");
  testStarted = new Date().toISOString();
});

// ---------------------------------------------------------------------------
// New bookings
// ---------------------------------------------------------------------------

test("a new booking waits for the owner, then is made once and confirmed", async () => {
  const [slot] = await freeSlots();
  const since = new Date().toISOString();
  const externalId = nextId();
  const asking = reads({
    intent: "new_booking_request",
    requested_date: cal(slot.date),
    requested_time: exact(slot.time),
    service_reference: "driving lesson",
  });
  const report = await send("Can I book a lesson?", asking, { externalId });
  expect(report.decision?.outcome).toBe("create_approval");
  // Nothing is booked yet, and Nina hears nothing automatic.
  expect(await ninasBookings()).toEqual([]);
  expect(await outbound(since)).toEqual([]);
  const [req] = await openRequests("booking_request");
  expect(new Date(req.proposed_starts_at!).getTime()).toBe(
    slot.startsAt.getTime(),
  );

  // The same message delivered again changes nothing.
  const again = await send("Can I book a lesson?", asking, { externalId });
  expect(again.duplicate).toBe(true);
  expect(await openRequests("booking_request")).toHaveLength(1);

  // Approved: booked, confirmed and reminded, once.
  const [first, second] = await Promise.all([
    approve("booking", req.id, slot.startsAt),
    approve("booking", req.id, slot.startsAt),
  ]);
  const errors = [first.error, second.error].filter(Boolean);
  expect(errors.map((e) => e!.hint)).toEqual(["already_resolved"]);
  const bookings = await ninasBookings();
  expect(bookings.filter((b) => b.status === "confirmed")).toHaveLength(1);
  expect(new Date(bookings[0].starts_at).getTime()).toBe(
    slot.startsAt.getTime(),
  );
  const sent = await outbound(since);
  expect(sent).toEqual([
    {
      body: expect.stringMatching(/^Hi Nina, that’s booked\./),
      author: "pingflow",
    },
  ]);
  expect((await activityFor(req.id)).map((a) => a.kind)).toEqual(
    expect.arrayContaining([
      "request_understood",
      "approval_requested",
      "owner_approved",
      "booking_created",
      "confirmation_sent",
    ]),
  );
  const { data: reminders } = await admin()
    .from("reminders")
    .select("status")
    .eq("booking_id", bookings[0].id);
  expect(reminders).toEqual(
    reminderAt(slot.startsAt) ? [{ status: "scheduled" }] : [],
  );
});

test("a broad request proposes a real free time in that part of the day", async () => {
  const [slot] = await freeSlots();
  const report = await send(
    "Can I have a lesson that afternoon?",
    reads({
      intent: "new_booking_request",
      requested_date: cal(slot.date),
      requested_time: { constraint: "afternoon", time: null },
      service_reference: "driving lesson",
    }),
  );
  expect(report.decision?.outcome).toBe("create_approval");
  const [req] = await openRequests("booking_request");
  if (req.proposed_starts_at) {
    const time = clockTimeOf(new Date(req.proposed_starts_at), TZ);
    expect(time >= "12:00" && time < "17:00").toBe(true);
    const free = await freeSlots(0, 20);
    expect(
      free.some(
        (s) =>
          s.startsAt.getTime() === new Date(req.proposed_starts_at!).getTime(),
      ),
    ).toBe(true);
  }
});

test("with more than one service and none named, Nina is asked which, once", async () => {
  const [slot] = await freeSlots();
  const report = await send(
    "Can I book in?",
    reads({
      intent: "new_booking_request",
      requested_date: cal(slot.date),
      requested_time: exact(slot.time),
    }),
  );
  expect(report.decision?.outcome).toBe("request_clarification");
  expect(report.decision?.reply?.body).toBe(
    "Which would you like: Driving lesson or Two-hour lesson?",
  );
  expect(await openRequests()).toEqual([]);
});

test("a taken time is never proposed: the nearest free one is", async () => {
  const [taken] = await freeSlots(3);
  await book(omarId, taken.startsAt);
  const report = await send(
    "Can I have that time?",
    reads({
      intent: "new_booking_request",
      requested_date: cal(taken.date),
      requested_time: exact(taken.time),
      service_reference: "driving lesson",
    }),
  );
  expect(report.decision?.outcome).toBe("create_approval");
  const [req] = await openRequests("booking_request");
  expect(req.proposed_starts_at).not.toBeNull();
  expect(new Date(req.proposed_starts_at!).getTime()).not.toBe(
    taken.startsAt.getTime(),
  );
});

test("if the time is taken before the owner approves, nothing is booked or confirmed", async () => {
  const [slot] = await freeSlots(4);
  await send(
    "Can I book that?",
    reads({
      intent: "new_booking_request",
      requested_date: cal(slot.date),
      requested_time: exact(slot.time),
      service_reference: "driving lesson",
    }),
  );
  const [req] = await openRequests("booking_request");
  await book(omarId, slot.startsAt);
  const since = new Date().toISOString();

  const result = await approve("booking", req.id, slot.startsAt);
  expect(result.error?.hint).toBe("slot_unavailable");
  expect(await ninasBookings()).toEqual([]);
  expect(await outbound(since)).toEqual([]);
  expect((await request(req.id)).status).toBe("open");
});

test("a revised booking request replaces the older one, which stays on record", async () => {
  const [first, later] = await freePair(5);
  await send(
    "Can I book a driving lesson then?",
    reads({
      intent: "new_booking_request",
      requested_date: cal(first.date),
      requested_time: exact(first.time),
      service_reference: "driving lesson",
    }),
  );
  const [older] = await openRequests("booking_request");

  // "Actually could I do 6 instead?": only a time; the day and service
  // are the ones she already asked for.
  const report = await send(
    "Actually could I do later instead?",
    reads({
      intent: "new_booking_request",
      requested_time: exact(later.time),
    }),
  );
  expect(report.decision?.outcome).toBe("create_approval");
  const open = await openRequests("booking_request");
  expect(open).toHaveLength(1);
  expect(open[0].id).not.toBe(older.id);
  expect(open[0].understood).toMatchObject({
    preferred_date: first.date,
    service_id: lessonId,
  });
  expect(new Date(open[0].proposed_starts_at!).getTime()).toBe(
    later.startsAt.getTime(),
  );
  expect(await request(older.id)).toMatchObject({
    status: "dismissed",
    resolution: { reason: "superseded", superseded_by: open[0].id },
  });
  expect((await activityFor(older.id)).at(-1)).toMatchObject({
    kind: "request_closed",
    details: { reason: "superseded" },
  });
});

test("when the owner books Nina themselves, her waiting request closes", async () => {
  const [slot, other] = await freePair(6);
  await send(
    "Can I book a lesson?",
    reads({
      intent: "new_booking_request",
      requested_date: cal(slot.date),
      requested_time: exact(slot.time),
      service_reference: "driving lesson",
    }),
  );
  const [req] = await openRequests("booking_request");
  const { error } = await owner.rpc("create_booking", {
    p_customer_id: ninaId,
    p_service_id: lessonId,
    p_starts_at: other.startsAt.toISOString(),
  });
  expect(error).toBeNull();
  expect(await request(req.id)).toMatchObject({
    status: "dismissed",
    resolution: { reason: "booked_by_owner" },
  });
  // Approving it later can't book her twice.
  const late = await approve("booking", req.id, slot.startsAt);
  expect(late.error?.hint).toBe("already_resolved");
  expect(
    (await ninasBookings()).filter((b) => b.status === "confirmed"),
  ).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

test("a clear move waits, then moves the booking and its reminder once", async () => {
  const [current, target] = await freePair(3);
  const bookingId = await book(ninaId, current.startsAt);
  const since = new Date().toISOString();
  const report = await send(
    "Can I move it later that day?",
    reads({
      intent: "reschedule_request",
      referenced_booking: onDate(current.date),
      requested_date: cal(target.date),
      requested_time: exact(target.time),
    }),
  );
  expect(report.decision?.outcome).toBe("create_approval");
  const [req] = await openRequests("reschedule_request");
  expect(req.booking_id).toBe(bookingId);
  expect(await outbound(since)).toEqual([]);

  const [a, b] = await Promise.all([
    approve("reschedule", req.id, target.startsAt),
    approve("reschedule", req.id, target.startsAt),
  ]);
  expect([a.error, b.error].filter(Boolean).map((e) => e!.hint)).toEqual([
    "already_resolved",
  ]);
  const [moved] = await ninasBookings();
  expect(new Date(moved.starts_at).getTime()).toBe(target.startsAt.getTime());
  expect(await outbound(since)).toEqual([
    {
      body: expect.stringMatching(/^Hi Nina, that’s done\./),
      author: "pingflow",
    },
  ]);
  const { data: reminders } = await admin()
    .from("reminders")
    .select("status, send_at")
    .eq("booking_id", bookingId)
    .eq("status", "scheduled");
  expect(reminders!.length).toBeLessThanOrEqual(1);
});

test("a move with no new day asks once, then carries on from the answer", async () => {
  const [current, target] = await freePair(3);
  await book(ninaId, current.startsAt);
  const asked = await send(
    "Can I move my lesson?",
    reads({
      intent: "reschedule_request",
      referenced_booking: { ...onDate(current.date), kind: "on_date" },
      clarification_needed: true,
    }),
  );
  expect(asked.decision?.outcome).toBe("request_clarification");
  expect(asked.decision?.reply?.body).toBe("What day would suit you?");

  const answered = await send(
    "that day but later",
    reads({
      intent: "reschedule_request",
      referenced_booking: onDate(current.date),
      requested_date: cal(target.date),
      requested_time: exact(target.time),
    }),
  );
  expect(answered.decision?.outcome).toBe("create_approval");
  const { data: conversation } = await admin()
    .from("messages")
    .select("conversation:conversations ( clarification )")
    .eq("id", answered.messageId)
    .single();
  expect(
    (conversation as { conversation: { clarification: unknown } }).conversation
      .clarification,
  ).toBeNull();
});

test("two bookings the words could mean: Nina is asked which", async () => {
  const [a, b] = await freePair(4);
  await book(ninaId, a.startsAt);
  await book(ninaId, b.startsAt);
  const report = await send(
    "Can I cancel my lesson that day?",
    reads({
      intent: "cancellation_request",
      referenced_booking: onDate(a.date),
      cancellation_scope: "single",
    }),
  );
  expect(report.decision?.outcome).toBe("request_clarification");
  expect(report.decision?.reply?.body).toMatch(
    new RegExp(
      `^Which driving lesson do you mean: .*${a.time}.* or .*${b.time}`,
    ),
  );
  expect(await openRequests()).toEqual([]);
});

test("a move to a taken time proposes another, or none, never the taken one", async () => {
  const [current, taken] = await freePair(5);
  await book(ninaId, current.startsAt);
  await book(omarId, taken.startsAt);
  await send(
    "Can I move to that time?",
    reads({
      intent: "reschedule_request",
      referenced_booking: onDate(current.date),
      requested_date: cal(taken.date),
      requested_time: exact(taken.time),
    }),
  );
  const [req] = await openRequests("reschedule_request");
  expect(req.proposed_starts_at).toBeNull();
});

test("if the new time is taken before approval, the booking stays and nothing is confirmed", async () => {
  const [current, target] = await freePair(6);
  const bookingId = await book(ninaId, current.startsAt);
  await send(
    "Can I move it?",
    reads({
      intent: "reschedule_request",
      referenced_booking: onDate(current.date),
      requested_date: cal(target.date),
      requested_time: exact(target.time),
    }),
  );
  const [req] = await openRequests("reschedule_request");
  await book(omarId, target.startsAt);
  const since = new Date().toISOString();
  const result = await approve("reschedule", req.id, target.startsAt);
  expect(result.error?.hint).toBe("slot_unavailable");
  const [still] = await ninasBookings();
  expect(still.id).toBe(bookingId);
  expect(new Date(still.starts_at).getTime()).toBe(current.startsAt.getTime());
  expect(await outbound(since)).toEqual([]);
  expect((await request(req.id)).status).toBe("open");
});

test("the owner moving the booking first closes the request; it's never applied later", async () => {
  const [current, target] = await freePair(7);
  const [elsewhere] = await freeSlots(9);
  const bookingId = await book(ninaId, current.startsAt);
  await send(
    "Can I move it?",
    reads({
      intent: "reschedule_request",
      referenced_booking: onDate(current.date),
      requested_date: cal(target.date),
      requested_time: exact(target.time),
    }),
  );
  const [req] = await openRequests("reschedule_request");
  const moved = await owner.rpc("move_booking", {
    p_booking_id: bookingId,
    p_starts_at: elsewhere.startsAt.toISOString(),
  });
  expect(moved.error).toBeNull();
  expect(await request(req.id)).toMatchObject({
    status: "dismissed",
    resolution: { reason: "booking_moved" },
  });
  const late = await approve("reschedule", req.id, target.startsAt);
  expect(late.error?.hint).toBe("already_resolved");
  const [booking] = await ninasBookings();
  expect(new Date(booking.starts_at).getTime()).toBe(
    elsewhere.startsAt.getTime(),
  );
});

test("“Actually 6 would be better” revises the waiting move: same booking, same day", async () => {
  const [current] = await freeSlots(3);
  const [target, later] = await freePair(8);
  const bookingId = await book(ninaId, current.startsAt);
  await send(
    "Can we move it?",
    reads({
      intent: "reschedule_request",
      referenced_booking: onDate(current.date),
      requested_date: cal(target.date),
      requested_time: exact(target.time),
    }),
  );
  const [older] = await openRequests("reschedule_request");
  const externalId = nextId();
  const revised = reads({
    intent: "reschedule_request",
    requested_time: exact(later.time),
  });
  await send("Actually later would be better", revised, { externalId });
  // Delivered again: still just one.
  await send("Actually later would be better", revised, { externalId });

  const open = await openRequests("reschedule_request");
  expect(open).toHaveLength(1);
  expect(open[0]).toMatchObject({ booking_id: bookingId });
  expect(new Date(open[0].proposed_starts_at!).getTime()).toBe(
    later.startsAt.getTime(),
  );
  expect(await request(older.id)).toMatchObject({
    status: "dismissed",
    resolution: { reason: "superseded", superseded_by: open[0].id },
  });
});

test("approval rolls back completely when any part of it fails", async () => {
  const [current, target] = await freePair(4);
  const bookingId = await book(ninaId, current.startsAt);
  await send(
    "Can I move it?",
    reads({
      intent: "reschedule_request",
      referenced_booking: onDate(current.date),
      requested_date: cal(target.date),
      requested_time: exact(target.time),
    }),
  );
  const [req] = await openRequests("reschedule_request");
  const since = new Date().toISOString();
  // A reminder after the lesson is refused after the booking has moved:
  // the move, the reply and the request all roll back with it.
  const result = await owner.rpc("resolve_reschedule_request", {
    p_action_id: req.id,
    p_decision: "approve",
    p_starts_at: target.startsAt.toISOString(),
    p_reply_body: "Hi Nina, that’s done.",
    p_reminder_send_at: addMinutes(target.startsAt, 30).toISOString(),
  });
  expect(result.error?.hint).toBe("invalid_reminder");
  const [booking] = await ninasBookings();
  expect(booking.id).toBe(bookingId);
  expect(new Date(booking.starts_at).getTime()).toBe(
    current.startsAt.getTime(),
  );
  expect(await outbound(since)).toEqual([]);
  expect((await request(req.id)).status).toBe("open");
});

// ---------------------------------------------------------------------------
// Cancellations
// ---------------------------------------------------------------------------

test("a cancellation is acknowledged, waits, then cancels once with its reminder", async () => {
  const [slot] = await freeSlots(3);
  const bookingId = await book(ninaId, slot.startsAt);
  const send_at = addMinutes(slot.startsAt, -60).toISOString();
  await admin().from("reminders").insert({
    business_id: businessId,
    booking_id: bookingId,
    send_at,
  });
  const since = new Date().toISOString();
  const report = await send(
    "Cancel my next lesson",
    reads({
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
  expect(report.decision?.outcome).toBe("create_approval");
  expect(await outbound(since)).toEqual([
    {
      body: "I’ve got your cancellation request. I’ll confirm it shortly.",
      author: "pingflow",
    },
  ]);
  const [req] = await openRequests("cancellation_request");
  expect((await ninasBookings())[0].status).toBe("confirmed");

  const [a, b] = await Promise.all([
    approveCancellation(req.id, slot.startsAt),
    approveCancellation(req.id, slot.startsAt),
  ]);
  expect([a.error, b.error].filter(Boolean).map((e) => e!.hint)).toEqual([
    "already_resolved",
  ]);
  expect((await ninasBookings())[0].status).toBe("cancelled");
  const { data: reminders } = await admin()
    .from("reminders")
    .select("status")
    .eq("booking_id", bookingId);
  expect(reminders).toEqual([{ status: "cancelled" }]);
  const confirmations = (await outbound(since)).filter((m) =>
    m.body.startsWith("Hi Nina, that’s done."),
  );
  expect(confirmations).toHaveLength(1);
});

test("with more than one booking coming up, “cancel my lesson” asks which", async () => {
  const [a, b] = await freePair(3);
  await book(ninaId, a.startsAt);
  await book(ninaId, b.startsAt);
  const report = await send(
    "I need to cancel my lesson",
    reads({
      intent: "cancellation_request",
      referenced_booking: {
        kind: "unspecified",
        date: null,
        time: null,
        service: "lesson",
      },
      cancellation_scope: "single",
    }),
  );
  expect(report.decision?.outcome).toBe("request_clarification");
  expect(await openRequests()).toEqual([]);
});

test("cancelling a booking that's already cancelled finds nothing and goes to the owner", async () => {
  const [slot] = await freeSlots(3);
  const bookingId = await book(ninaId, slot.startsAt);
  await admin()
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", bookingId);
  const report = await send(
    "Can you cancel that one?",
    reads({
      intent: "cancellation_request",
      referenced_booking: onDate(slot.date),
      cancellation_scope: "single",
    }),
  );
  expect(report.decision).toMatchObject({
    outcome: "owner_reply_task",
    reason: "no_booking_found",
  });
  expect(await openRequests("cancellation_request")).toEqual([]);
});

test("the owner cancelling first closes the request; asking twice leaves one", async () => {
  const [slot] = await freeSlots(4);
  const bookingId = await book(ninaId, slot.startsAt);
  const cancel = reads({
    intent: "cancellation_request",
    referenced_booking: onDate(slot.date),
    cancellation_scope: "single",
  });
  await send("Can you cancel it?", cancel);
  await send("Sorry, just checking you got that: please cancel", cancel);
  const open = await openRequests("cancellation_request");
  expect(open).toHaveLength(1);

  expect(
    (await owner.rpc("cancel_booking", { p_booking_id: bookingId })).error,
  ).toBeNull();
  expect(await request(open[0].id)).toMatchObject({
    status: "dismissed",
    resolution: { reason: "booking_cancelled" },
  });
  const late = await approveCancellation(open[0].id, slot.startsAt);
  expect(late.error?.hint).toBe("already_resolved");
});

// ---------------------------------------------------------------------------
// One question, then the owner
// ---------------------------------------------------------------------------

test("still unclear after one question: Nina is told it's passed on, and it waits for the owner", async () => {
  const [slot] = await freeSlots(3);
  await book(ninaId, slot.startsAt);
  await send(
    "Can I move my lesson?",
    reads({
      intent: "reschedule_request",
      referenced_booking: onDate(slot.date),
      clarification_needed: true,
    }),
  );
  const since = new Date().toISOString();
  const report = await send(
    "not sure yet tbh",
    reads({ intent: "unclear", confidence: "low" }),
  );
  expect(report.decision).toMatchObject({
    outcome: "owner_reply_task",
    reason: "clarification_exhausted",
  });
  expect(await outbound(since)).toEqual([
    {
      body: "I still can’t tell which day you mean. I’ve passed this to the owner.",
      author: "pingflow",
    },
  ]);
  const { data: task } = await admin()
    .from("pending_actions")
    .select("kind, status, understood")
    .eq("source_message_id", report.messageId)
    .single();
  expect(task).toMatchObject({
    kind: "reply_needed",
    status: "open",
    understood: { reason: "clarification_exhausted" },
  });
});

// ---------------------------------------------------------------------------
// Who's asking
// ---------------------------------------------------------------------------

test("an unknown number learns nothing, and its booking request goes to the owner", async () => {
  const since = new Date().toISOString();
  const asked = await send(
    "When is Nina's lesson?",
    reads({ intent: "next_booking_query", person_reference: "Nina" }),
    { from: UNKNOWN },
  );
  expect(asked.decision?.outcome).toBe("privacy_hold");
  const wants = await send(
    "Can I book a lesson?",
    reads({ intent: "new_booking_request", service_reference: "lesson" }),
    { from: UNKNOWN },
  );
  expect(wants.decision).toMatchObject({
    outcome: "owner_reply_task",
    reason: "new_contact",
  });
  expect(await outbound(since)).toEqual([]);
});

test("a parent of two is asked which child once; still unclear, it's passed on", async () => {
  const asked = await send(
    "When's their next lesson?",
    reads({ intent: "next_booking_query" }),
    { from: DANA },
  );
  expect(asked.decision?.reply?.body).toBe("Is this about Adam or Leo?");
  const still = await send("the usual", reads({ intent: "unclear" }), {
    from: DANA,
  });
  expect(still.decision?.reply?.body).toBe(
    "I still can’t tell who this is about. I’ve passed this to the owner.",
  );
  // Nothing about either child's bookings was shared.
  expect(still.decision?.reply?.body).not.toMatch(/\d\d:\d\d/);
});

test("Nina's number means nothing to another business, and its owner can't answer her requests", async () => {
  const [slot] = await freeSlots(3);
  await send(
    "Can I book a lesson?",
    reads({
      intent: "new_booking_request",
      requested_date: cal(slot.date),
      requested_time: exact(slot.time),
      service_reference: "driving lesson",
    }),
  );
  const [req] = await openRequests("booking_request");

  const elsewhere = await send(
    "When's my next lesson?",
    reads({ intent: "next_booking_query" }),
    { business: otherBusinessId },
  );
  expect(elsewhere.decision?.outcome).toBe("privacy_hold");

  const stranger = await ownerClient(otherEmail);
  const tried = await stranger.rpc("resolve_booking_request", {
    p_action_id: req.id,
    p_decision: "approve",
    p_starts_at: slot.startsAt.toISOString(),
  });
  expect(tried.error?.hint).toBe("not_found");
  expect((await request(req.id)).status).toBe("open");
});

// ---------------------------------------------------------------------------
// When something fails
// ---------------------------------------------------------------------------

test("an interpreter failure keeps the message, invents nothing and tells the owner", async () => {
  const since = new Date().toISOString();
  const report = await send(
    "Can I move Friday to 5?",
    new UnavailableMessageInterpreter(),
  );
  expect(report.status).toBe("failed");
  expect(await outbound(since)).toEqual([]);
  // No request is guessed at; the owner gets the message to read.
  expect((await openRequests()).map((r) => [r.kind, r.understood])).toEqual([
    ["reply_needed", { reason: "interpreter_unavailable" }],
  ]);
  const { data: inbound } = await admin()
    .from("messages")
    .select("body")
    .eq("id", report.messageId)
    .single();
  expect(inbound!.body).toBe("Can I move Friday to 5?");
});
