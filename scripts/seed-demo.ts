// Demo data for local development: a driving instructor's business, built
// around "today" so the schedule is always current.
//
//   pnpm db:seed                               uses DEMO_OWNER_EMAIL
//   pnpm db:seed you@example.com               any email
//   pnpm db:seed you@example.com --flexible    flexible hours instead of
//                                              a weekly pattern
//
// It signs up the email if needed and (re)creates that account's business
// from scratch. It uses the secret key, which bypasses row level security,
// so it only runs against a local Supabase unless --allow-remote is passed.
// Nothing in the app depends on it and no policy is loosened for it.
//
// The story (see src/components/reschedule-demo/scenario.ts for the
// marketing version): Sarah has a lesson on the next weekday at 16:00 and
// asks to move it to three weekdays later, "after 4". That day Omar has
// 15:30–16:30 plus 15 minutes' travel, so the first free hour is 17:00.
// Pingflow proposes it and the request waits in Attention.

import { createClient } from "@supabase/supabase-js";
import {
  availableSlots,
  checkSlot,
  type ScheduleContext,
} from "@/domain/availability/engine";
import { formatDate, formatTime } from "@/domain/time/format";
import {
  addDays,
  addMinutes,
  type ClockTime,
  type DateKey,
  dateKeyOf,
  DEFAULT_TIME_ZONE,
  isoWeekday,
  startOfWeek,
  type Weekday,
  zonedInstant,
} from "@/domain/time/zoned";
import type { Database } from "@/lib/supabase/database.types";

const tz = DEFAULT_TIME_ZONE;
const args = process.argv.slice(2);
const allowRemote = args.includes("--allow-remote");
const scheduleMode = args.includes("--flexible") ? "flexible" : "regular";
const email = (
  args.find((a) => !a.startsWith("--")) ??
  process.env.DEMO_OWNER_EMAIL ??
  ""
)
  .trim()
  .toLowerCase();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

if (!url || !secretKey) {
  fail("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.");
}
if (!email || !email.includes("@")) {
  fail("Pass an email (pnpm db:seed you@example.com) or set DEMO_OWNER_EMAIL.");
}
const host = new URL(url).hostname;
if (!["127.0.0.1", "localhost"].includes(host) && !allowRemote) {
  fail(
    `Refusing to seed ${host}: the seed replaces that account's business. Pass --allow-remote if you mean it.`,
  );
}

const db = createClient<Database>(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function must<T>(
  promise: PromiseLike<{ data: T; error: { message: string } | null }>,
  what: string,
): Promise<NonNullable<T>> {
  const { data, error } = await promise;
  if (error) fail(`${what}: ${error.message}`);
  if (data === null || data === undefined) fail(`${what}: no data`);
  return data as NonNullable<T>;
}

async function ownerId(): Promise<string> {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) fail(`Listing users: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  const { data, error } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error || !data.user) fail(`Creating ${email}: ${error?.message}`);
  return data.user.id;
}

// --- Dates, relative to today in London ------------------------------------

const now = new Date();
const today = dateKeyOf(now, tz);
const isWeekday = (d: DateKey) => isoWeekday(d) <= 5;
const nextWeekday = (d: DateKey) => {
  let next = addDays(d, 1);
  while (!isWeekday(next)) next = addDays(next, 1);
  return next;
};

const sarahDay = nextWeekday(today);
let requestedDay = sarahDay;
for (let i = 0; i < 3; i++) requestedDay = nextWeekday(requestedDay);

const firstDay = startOfWeek(today);
const horizonDays = 21;
const dates = Array.from({ length: horizonDays }, (_, i) =>
  addDays(firstDay, i),
);

// --- Business shape ---------------------------------------------------------

const workingHours: { weekday: Weekday; start: ClockTime; end: ClockTime }[] = [
  { weekday: 1, start: "09:00", end: "19:00" },
  { weekday: 2, start: "09:00", end: "19:00" },
  { weekday: 3, start: "09:00", end: "19:00" },
  { weekday: 4, start: "09:00", end: "19:00" },
  { weekday: 5, start: "09:00", end: "19:00" },
  { weekday: 6, start: "09:00", end: "13:00" },
];

type Person = {
  key: string;
  name: string;
  phone: string;
  contactName?: string;
  relationship?: Database["public"]["Enums"]["contact_relationship"];
  notes?: string;
};

const people: Person[] = [
  {
    key: "sarah",
    name: "Sarah Khan",
    phone: "+447700900123",
    notes: "Test booked for November. Prefers late afternoons.",
  },
  { key: "omar", name: "Omar Ali", phone: "+447700900456" },
  { key: "priya", name: "Priya Shah", phone: "+447700900789" },
  { key: "tom", name: "Tom Reid", phone: "+447700900234" },
  {
    key: "leo",
    name: "Leo Marsh",
    phone: "+447700900567",
    contactName: "Dana Marsh",
    relationship: "parent",
    notes: "Dana (mum) arranges Leo’s lessons. Pick up from school.",
  },
  { key: "aisha", name: "Aisha Begum", phone: "+447700900345" },
  { key: "jake", name: "Jake Doyle", phone: "+447700900678" },
  { key: "chloe", name: "Chloe Evans", phone: "+447700900890" },
];

const sarahWeekday = isoWeekday(sarahDay);
const requestedWeekday = isoWeekday(requestedDay);
// Chloe's evening lesson goes on a weekday that keeps the requested day's
// evening free and doesn't crowd Sarah's.
const chloeWeekday = ([1, 2, 3, 4] as Weekday[]).find(
  (w) => w !== requestedWeekday && w !== sarahWeekday,
)!;

type SeriesPlan = {
  person: string;
  service: "lesson" | "long";
  weekday: Weekday;
  start: ClockTime;
};

const seriesPlans: SeriesPlan[] = [
  { person: "sarah", service: "lesson", weekday: sarahWeekday, start: "16:00" },
  {
    person: "omar",
    service: "lesson",
    weekday: requestedWeekday,
    start: "15:30",
  },
  { person: "priya", service: "lesson", weekday: 1, start: "10:00" },
  { person: "priya", service: "lesson", weekday: 4, start: "10:00" },
  { person: "tom", service: "long", weekday: 2, start: "09:00" },
  { person: "leo", service: "lesson", weekday: 3, start: "13:30" },
  { person: "aisha", service: "lesson", weekday: 5, start: "11:30" },
  { person: "jake", service: "long", weekday: 6, start: "09:30" },
  { person: "chloe", service: "lesson", weekday: chloeWeekday, start: "18:00" },
];

async function seed() {
  const owner = await ownerId();

  // Start clean: removing the business removes everything under it.
  await must(
    db.from("businesses").delete().eq("owner_id", owner).select("id"),
    "Removing the old demo",
  );

  const business = await must(
    db
      .from("businesses")
      .insert({
        owner_id: owner,
        name: "Demo driving school",
        business_type: "driving_instructor",
        timezone: tz,
        schedule_mode: scheduleMode,
        onboarding_completed_at: now.toISOString(),
      })
      .select("id")
      .single(),
    "Creating the business",
  );
  const businessId = business.id;

  const services = await must(
    db
      .from("services")
      .insert([
        {
          business_id: businessId,
          name: "Driving lesson",
          duration_minutes: 60,
          buffer_minutes: 15,
          position: 0,
        },
        {
          business_id: businessId,
          name: "Two-hour lesson",
          duration_minutes: 120,
          buffer_minutes: 15,
          position: 1,
        },
      ])
      .select("id, name, duration_minutes, buffer_minutes"),
    "Adding services",
  );
  const serviceByKey = {
    lesson: services.find((s) => s.name === "Driving lesson")!,
    long: services.find((s) => s.name === "Two-hour lesson")!,
  };

  await must(
    db
      .from("working_hours")
      .insert(
        workingHours.map((h) => ({
          business_id: businessId,
          weekday: h.weekday,
          start_time: h.start,
          end_time: h.end,
        })),
      )
      .select("id"),
    "Adding working hours",
  );

  await must(
    db
      .from("automation_settings")
      .insert({ business_id: businessId })
      .select("business_id"),
    "Adding automation settings",
  );

  // People: a contact messages, a customer takes the lessons.
  const customerIds = new Map<string, string>();
  const contactIds = new Map<string, string>();
  for (const p of people) {
    const customer = await must(
      db
        .from("customers")
        .insert({ business_id: businessId, full_name: p.name, notes: p.notes })
        .select("id")
        .single(),
      `Adding ${p.name}`,
    );
    const contact = await must(
      db
        .from("contacts")
        .insert({
          business_id: businessId,
          phone_e164: p.phone,
          display_name: p.contactName ?? p.name,
        })
        .select("id")
        .single(),
      `Adding ${p.name}’s contact`,
    );
    await must(
      db
        .from("customer_contacts")
        .insert({
          business_id: businessId,
          customer_id: customer.id,
          contact_id: contact.id,
          relationship: p.relationship ?? "self",
        })
        .select("customer_id"),
      `Linking ${p.name}`,
    );
    customerIds.set(p.key, customer.id);
    contactIds.set(p.key, contact.id);
  }

  // Weekly series, materialised as bookings across three weeks. Each one is
  // checked by the availability engine, exactly as the app would.
  const ctx: ScheduleContext = {
    timeZone: tz,
    mode: scheduleMode,
    workingHours,
    bookings: [],
    blocks: [],
  };
  const bookingRows: Database["public"]["Tables"]["bookings"]["Insert"][] = [];
  for (const plan of seriesPlans) {
    const service = serviceByKey[plan.service];
    const series = await must(
      db
        .from("booking_series")
        .insert({
          business_id: businessId,
          customer_id: customerIds.get(plan.person)!,
          service_id: service.id,
          weekday: plan.weekday,
          start_time: plan.start,
          starts_on: firstDay,
        })
        .select("id")
        .single(),
      "Adding a weekly series",
    );
    for (const date of dates.filter((d) => isoWeekday(d) === plan.weekday)) {
      const startsAt = zonedInstant(date, plan.start, tz);
      const check = checkSlot(ctx, startsAt, {
        durationMinutes: service.duration_minutes,
        bufferMinutes: service.buffer_minutes,
      });
      if (!check.ok) {
        fail(
          `Demo schedule clash on ${date} ${plan.start}: ${check.problem.kind}`,
        );
      }
      const endsAt = addMinutes(startsAt, service.duration_minutes);
      const id = crypto.randomUUID();
      ctx.bookings.push({
        id,
        startsAt,
        endsAt,
        bufferMinutes: service.buffer_minutes,
      });
      bookingRows.push({
        id,
        business_id: businessId,
        customer_id: customerIds.get(plan.person)!,
        service_id: service.id,
        series_id: series.id,
        occurrence_starts_at: startsAt.toISOString(),
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        buffer_minutes: service.buffer_minutes,
      });
    }
  }
  await must(db.from("bookings").insert(bookingRows).select("id"), "Booking");

  // One block of time off this week, on a day that isn't part of the story.
  const blockDay = dates.slice(0, 7).find(
    (d) =>
      isWeekday(d) &&
      d > today &&
      d !== sarahDay &&
      d !== requestedDay &&
      !ctx.bookings.some((b) => {
        const s = zonedInstant(d, "12:00", tz);
        const e = zonedInstant(d, "13:30", tz);
        return b.startsAt < e && s < b.endsAt;
      }),
  );
  if (blockDay) {
    await must(
      db
        .from("schedule_blocks")
        .insert({
          business_id: businessId,
          starts_at: zonedInstant(blockDay, "12:00", tz).toISOString(),
          ends_at: zonedInstant(blockDay, "13:30", tz).toISOString(),
          label: "Car service",
        })
        .select("id"),
      "Blocking time",
    );
  }

  // Reminders a day before every upcoming booking.
  const reminders = bookingRows
    .map((b) => ({
      booking_id: b.id!,
      send_at: addMinutes(new Date(b.starts_at), -1440),
    }))
    .filter((r) => r.send_at > now)
    .map((r) => ({
      business_id: businessId,
      booking_id: r.booking_id,
      send_at: r.send_at.toISOString(),
    }));
  if (reminders.length) {
    await must(
      db.from("reminders").insert(reminders).select("id"),
      "Scheduling reminders",
    );
  }

  // Sarah's request.
  const sarahBooking = bookingRows.find(
    (b) =>
      b.customer_id === customerIds.get("sarah") &&
      dateKeyOf(new Date(b.starts_at), tz) === sarahDay,
  )!;
  const lessonStarts = new Date(sarahBooking.starts_at);
  const receivedAt = addMinutes(now, -18);
  receivedAt.setSeconds(0, 0);

  const lessonRef =
    sarahDay === addDays(today, 1)
      ? "tomorrow’s lesson"
      : `my ${formatDate(sarahDay, "weekday")} lesson`;
  const body = `Hi! Something’s come up. Can we move ${lessonRef} to ${formatDate(requestedDay, "weekday")} after 4?`;

  const conversation = await must(
    db
      .from("conversations")
      .insert({
        business_id: businessId,
        contact_id: contactIds.get("sarah")!,
        last_message_at: receivedAt.toISOString(),
      })
      .select("id")
      .single(),
    "Opening Sarah’s conversation",
  );
  const message = await must(
    db
      .from("messages")
      .insert({
        business_id: businessId,
        conversation_id: conversation.id,
        direction: "inbound",
        author: "contact",
        body,
        delivery: "received",
        sent_at: receivedAt.toISOString(),
      })
      .select("id")
      .single(),
    "Recording Sarah’s message",
  );

  const lesson = serviceByKey.lesson;
  const proposal = availableSlots(
    ctx,
    requestedDay,
    {
      durationMinutes: lesson.duration_minutes,
      bufferMinutes: lesson.buffer_minutes,
      ignoreBookingId: sarahBooking.id,
    },
    { notBefore: "16:00", now },
  )[0];
  if (!proposal) fail("No free time for Sarah’s request: check the plan.");

  const understood = {
    intent: "reschedule",
    preferred_date: requestedDay,
    earliest_time: "16:00",
    booking_starts_at: lessonStarts.toISOString(),
  };
  const action = await must(
    db
      .from("pending_actions")
      .insert({
        business_id: businessId,
        kind: "reschedule_request",
        conversation_id: conversation.id,
        customer_id: customerIds.get("sarah")!,
        booking_id: sarahBooking.id!,
        source_message_id: message.id,
        understood,
        proposed_starts_at: proposal.startsAt.toISOString(),
        proposed_ends_at: proposal.endsAt.toISOString(),
        created_at: receivedAt.toISOString(),
      })
      .select("id")
      .single(),
    "Adding Sarah’s request",
  );

  const step = (seconds: number) =>
    new Date(receivedAt.getTime() + seconds * 1000).toISOString();
  await must(
    db
      .from("activity_events")
      .insert([
        {
          business_id: businessId,
          occurred_at: step(0),
          kind: "message_received",
          actor: "contact",
          customer_id: customerIds.get("sarah")!,
          message_id: message.id,
          details: {},
        },
        {
          business_id: businessId,
          occurred_at: step(2),
          kind: "request_understood",
          actor: "pingflow",
          customer_id: customerIds.get("sarah")!,
          booking_id: sarahBooking.id!,
          pending_action_id: action.id,
          details: understood,
        },
        {
          business_id: businessId,
          occurred_at: step(3),
          kind: "time_proposed",
          actor: "pingflow",
          customer_id: customerIds.get("sarah")!,
          booking_id: sarahBooking.id!,
          pending_action_id: action.id,
          details: {
            starts_at: proposal.startsAt.toISOString(),
            ends_at: proposal.endsAt.toISOString(),
          },
        },
        {
          business_id: businessId,
          occurred_at: step(4),
          kind: "approval_requested",
          actor: "pingflow",
          customer_id: customerIds.get("sarah")!,
          booking_id: sarahBooking.id!,
          pending_action_id: action.id,
          details: {},
        },
      ])
      .select("id"),
    "Recording activity",
  );

  console.log(`
  Demo ready for ${email} (${scheduleMode} hours)
    Sarah's lesson   ${formatDate(sarahDay)} 16:00
    She asked for    ${formatDate(requestedDay)} after 16:00
    Proposed         ${formatDate(requestedDay)} ${formatTime(proposal.startsAt, tz)}
    Bookings         ${bookingRows.length} across ${horizonDays} days from ${formatDate(firstDay)}
  Sign in at /sign-in with that email.
`);
}

seed().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
