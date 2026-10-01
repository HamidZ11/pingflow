import type { ScheduleContext } from "@/domain/availability/engine";
import type {
  OwnerBlock,
  OwnerBooking,
  OwnerCustomer,
  OwnerInput,
  OwnerPending,
} from "@/domain/owner/decide";
import type { OwnerCommand } from "@/domain/owner/command";
import { addMinutes, type DateKey, zonedInstant } from "@/domain/time/zoned";

// A fixed owner's-eye world for tests and evaluations: a driving
// instructor at 14:12 on Monday 28 September 2026, London. "two-sarahs"
// adds a second Sarah, for "which one?".

export const TZ = "Europe/London";
export const TODAY: DateKey = "2026-09-28";
export const NOW = zonedInstant(TODAY, "14:12", TZ);

export type OwnerWorldName = "driving" | "two-sarahs";

const at = (date: DateKey, time: string) => zonedInstant(date, time, TZ);

const customers: OwnerCustomer[] = [
  { id: "c-sarah", fullName: "Sarah Khan" },
  { id: "c-omar", fullName: "Omar Ali" },
  { id: "c-tom", fullName: "Tom Reid" },
  { id: "c-priya", fullName: "Priya Shah" },
  { id: "c-leo", fullName: "Leo Marsh" },
  { id: "c-aisha", fullName: "Aisha Begum" },
];

function booking(
  id: string,
  customer: OwnerCustomer,
  date: DateKey,
  time: string,
  minutes = 60,
  serviceName = "Driving lesson",
): OwnerBooking {
  const startsAt = at(date, time);
  return {
    id,
    customerId: customer.id,
    customerName: customer.fullName,
    serviceName,
    startsAt,
    endsAt: addMinutes(startsAt, minutes),
    bufferMinutes: 15,
  };
}

const [sarah, omar, tom, priya, leo, aisha] = customers;
const bookings: OwnerBooking[] = [
  booking("b-tom-1", tom, "2026-09-29", "09:00", 120, "Two-hour lesson"),
  booking("b-sarah-1", sarah, "2026-09-29", "16:00"),
  booking("b-leo-1", leo, "2026-09-30", "13:30"),
  booking("b-priya-1", priya, "2026-10-01", "10:00"),
  booking("b-aisha-1", aisha, "2026-10-02", "11:30"),
  booking("b-omar-1", omar, "2026-10-02", "15:30"),
  booking("b-priya-2", priya, "2026-10-05", "10:00"),
  booking("b-sarah-2", sarah, "2026-10-06", "16:00"),
];
const blocks: OwnerBlock[] = [
  {
    id: "k-lunch",
    startsAt: at("2026-09-30", "12:00"),
    endsAt: at("2026-09-30", "13:00"),
    label: "Lunch",
  },
];

const sarahAhmed: OwnerCustomer = { id: "c-sarah-2", fullName: "Sarah Ahmed" };

export function ownerWorld(name: OwnerWorldName = "driving") {
  const all =
    name === "two-sarahs" ? [...customers, sarahAhmed] : [...customers];
  const allBookings =
    name === "two-sarahs"
      ? [...bookings, booking("b-sarah2-1", sarahAhmed, "2026-10-01", "17:00")]
      : [...bookings];
  const schedule: ScheduleContext = {
    timeZone: TZ,
    mode: "regular",
    workingHours: [
      ...([1, 2, 3, 4, 5] as const).map((weekday) => ({
        weekday,
        start: "09:00",
        end: "19:00",
      })),
      { weekday: 6 as const, start: "09:00", end: "13:00" },
    ],
    bookings: allBookings.map((b) => ({
      id: b.id,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      bufferMinutes: b.bufferMinutes,
    })),
    blocks: blocks.map((b) => ({
      id: b.id,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
    })),
  };
  return { customers: all, bookings: allBookings, blocks, schedule };
}

export function ownerInputFor(
  command: OwnerCommand | null,
  options: { world?: OwnerWorldName; pending?: OwnerPending | null } = {},
): OwnerInput {
  const world = ownerWorld(options.world);
  return {
    messageId: "m-owner-1",
    now: NOW,
    today: TODAY,
    timeZone: TZ,
    command,
    pending: options.pending ?? null,
    customers: world.customers,
    bookings: world.bookings,
    blocks: world.blocks,
    schedule: world.schedule,
    reminders: { enabled: true, leadMinutes: 1440 },
  };
}
