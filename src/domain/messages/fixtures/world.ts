import type {
  BusyBooking,
  ScheduleContext,
} from "@/domain/availability/engine";
import type { CustomerBooking } from "@/domain/messages/booking-reference";
import type { LinkedCustomer } from "@/domain/messages/identity";
import type { Service } from "@/domain/messages/policy";
import { addMinutes, type DateKey, zonedInstant } from "@/domain/time/zoned";

// A small, fixed world for tests and evaluations: a driving instructor
// (like the demo) and a dog groomer, at 14:12 on Monday 28 September 2026 in
// London. Pure data, so the policy can be checked without a database.

export const TZ = "Europe/London";
export const TODAY: DateKey = "2026-09-28";
export const NOW = zonedInstant(TODAY, "14:12", TZ);

const at = (date: DateKey, time: string) => zonedInstant(date, time, TZ);

export type WorldName = "driving" | "groomer";
export type Sender = "sarah" | "omar" | "parent" | "unknown" | "bella";

type World = {
  services: Service[];
  schedule: ScheduleContext;
  bookings: (CustomerBooking & { customerId: string })[];
  people: Record<string, LinkedCustomer>;
  links: Partial<Record<Sender, string[]>>;
  phones: Partial<Record<Sender, string>>;
};

function world(
  services: Service[],
  hours: ScheduleContext["workingHours"],
  bookings: {
    id: string;
    customerId: string;
    date: DateKey;
    time: string;
    service: Service;
  }[],
  people: Record<string, LinkedCustomer>,
  links: World["links"],
  phones: World["phones"],
): World {
  const full = bookings.map((b) => {
    const startsAt = at(b.date, b.time);
    return {
      id: b.id,
      customerId: b.customerId,
      startsAt,
      endsAt: addMinutes(startsAt, b.service.durationMinutes),
      bufferMinutes: b.service.bufferMinutes,
      serviceId: b.service.id,
      serviceName: b.service.name,
      seriesId: null,
    };
  });
  const busy: BusyBooking[] = full.map((b) => ({
    id: b.id,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    bufferMinutes: b.bufferMinutes,
  }));
  return {
    services,
    schedule: {
      timeZone: TZ,
      mode: "regular",
      workingHours: hours,
      bookings: busy,
      blocks: [],
    },
    bookings: full,
    people,
    links,
    phones,
  };
}

const lesson: Service = {
  id: "svc-lesson",
  name: "Driving lesson",
  durationMinutes: 60,
  bufferMinutes: 15,
};
const long: Service = {
  id: "svc-long",
  name: "Two-hour lesson",
  durationMinutes: 120,
  bufferMinutes: 15,
};
const groom: Service = {
  id: "svc-groom",
  name: "Full groom",
  durationMinutes: 120,
  bufferMinutes: 15,
};
const wash: Service = {
  id: "svc-wash",
  name: "Wash & tidy",
  durationMinutes: 60,
  bufferMinutes: 15,
};

const weekdays = [1, 2, 3, 4, 5] as const;

export const worlds: Record<WorldName, World> = {
  driving: world(
    [lesson, long],
    [
      ...weekdays.map((weekday) => ({ weekday, start: "09:00", end: "19:00" })),
      { weekday: 6 as const, start: "09:00", end: "13:00" },
    ],
    [
      // Sarah: tomorrow 16:00 and next Tuesday.
      {
        id: "b-sarah-1",
        customerId: "c-sarah",
        date: "2026-09-29",
        time: "16:00",
        service: lesson,
      },
      {
        id: "b-sarah-2",
        customerId: "c-sarah",
        date: "2026-10-06",
        time: "16:00",
        service: lesson,
      },
      // Omar: Friday 15:30 (with travel to 16:45), so 17:00 is Friday's first
      // free hour after 16:00.
      {
        id: "b-omar-1",
        customerId: "c-omar",
        date: "2026-10-02",
        time: "15:30",
        service: lesson,
      },
      {
        id: "b-tom-1",
        customerId: "c-tom",
        date: "2026-09-29",
        time: "09:00",
        service: long,
      },
      {
        id: "b-priya-1",
        customerId: "c-priya",
        date: "2026-10-01",
        time: "10:00",
        service: lesson,
      },
      {
        id: "b-leo-1",
        customerId: "c-leo",
        date: "2026-09-30",
        time: "13:30",
        service: lesson,
      },
      {
        id: "b-adam-1",
        customerId: "c-adam",
        date: "2026-10-01",
        time: "17:00",
        service: lesson,
      },
      {
        id: "b-aisha-1",
        customerId: "c-aisha",
        date: "2026-10-02",
        time: "11:30",
        service: lesson,
      },
    ],
    {
      sarah: { id: "c-sarah", fullName: "Sarah Khan", relationship: "self" },
      omar: { id: "c-omar", fullName: "Omar Ali", relationship: "self" },
      leo: { id: "c-leo", fullName: "Leo Marsh", relationship: "parent" },
      adam: { id: "c-adam", fullName: "Adam Marsh", relationship: "parent" },
    },
    { sarah: ["sarah"], omar: ["omar"], parent: ["leo", "adam"], unknown: [] },
    {
      sarah: "+447700900123",
      omar: "+447700900456",
      parent: "+447700900567",
      unknown: "+447700900111",
    },
  ),
  groomer: world(
    [groom, wash],
    [
      ...weekdays.map((weekday) => ({ weekday, start: "09:00", end: "17:00" })),
      { weekday: 6 as const, start: "09:00", end: "13:00" },
    ],
    [
      {
        id: "b-bella-1",
        customerId: "c-bella",
        date: "2026-10-01",
        time: "10:00",
        service: groom,
      },
    ],
    { bella: { id: "c-bella", fullName: "Bella Jones", relationship: "self" } },
    { bella: ["bella"], unknown: [] },
    { bella: "+447700900222", unknown: "+447700900111" },
  ),
};

/** The customers a sender's number is linked to. */
export function linkedCustomers(name: WorldName, sender: Sender) {
  const w = worlds[name];
  return (w.links[sender] ?? []).map((key) => w.people[key]);
}

/** A customer's upcoming bookings, soonest first. */
export function upcomingFor(name: WorldName, customerId: string) {
  return worlds[name].bookings
    .filter((b) => b.customerId === customerId && b.startsAt > NOW)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
