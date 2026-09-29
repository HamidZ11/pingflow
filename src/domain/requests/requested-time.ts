import {
  describeTimeReference,
  inWindow,
  resolveTimeWindow,
} from "@/domain/messages/dates";
import {
  type TimeConstraint,
  timeConstraints,
} from "@/domain/messages/interpretation";
import { formatDate, formatRelativeDate } from "@/domain/time/format";
import {
  type ClockTime,
  type DateKey,
  isClockTime,
  isDateKey,
} from "@/domain/time/zoned";

// The day and time a customer asked for, as stored with a request, and how
// it reads on a card, in a reply and in the activity log.

export type RequestedTime = {
  /** The day they asked for. */
  preferredDate: DateKey;
  /** "after 4" → "16:00". Null when they didn't say. */
  earliestTime: ClockTime | null;
  /** How they put the time: "after", "around", "morning"… */
  timeConstraint: TimeConstraint | null;
  /** The time they named, if any. */
  time: ClockTime | null;
};

export function readRequestedTime(value: unknown): RequestedTime | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!isDateKey(v.preferred_date)) return null;
  const earliestTime = isClockTime(v.earliest_time) ? v.earliest_time : null;
  const constraint = (timeConstraints as readonly unknown[]).includes(
    v.time_constraint,
  )
    ? (v.time_constraint as TimeConstraint)
    : null;
  return {
    preferredDate: v.preferred_date,
    earliestTime,
    // Requests stored before constraints were recorded only had "after".
    timeConstraint: constraint ?? (earliestTime ? "after" : null),
    time: isClockTime(v.time) ? v.time : earliestTime,
  };
}

/** "after 16:00", "around 15:00", "afternoon", or null for any time. */
function timePhrase(requested: RequestedTime): string | null {
  if (requested.earliestTime) return `after ${requested.earliestTime}`;
  return describeTimeReference(
    requested.timeConstraint
      ? { constraint: requested.timeConstraint, time: requested.time }
      : null,
  );
}

const buckets = new Set(["morning", "afternoon", "evening"]);

/**
 * "Friday after 16:00", "Tomorrow afternoon", "Mon 12 Oct at 09:30". Inside
 * a sentence, "Tomorrow" becomes "tomorrow".
 */
export function describeRequestedTime(
  requested: RequestedTime,
  today: DateKey,
  { inSentence = false } = {},
): string {
  let day = formatRelativeDate(requested.preferredDate, today);
  if (inSentence && ["Today", "Tomorrow", "Yesterday"].includes(day)) {
    day = day.toLowerCase();
  }
  const phrase = timePhrase(requested);
  if (!phrase) return day;
  if (buckets.has(phrase) && /\d/.test(day)) return `${day}, ${phrase}`;
  return `${day} ${phrase}`;
}

/** "Friday 2 October, after 16:00", for the full context. */
export function describeRequestedTimeLong(requested: RequestedTime): string {
  const day = formatDate(requested.preferredDate, "long");
  const phrase = timePhrase(requested);
  if (!phrase) return day;
  return buckets.has(phrase) ? `${day}, in the ${phrase}` : `${day}, ${phrase}`;
}

/**
 * Why Pingflow proposed this time, in a sentence for the card. `lengthMinutes`
 * decides whether it's an "hour" or a "slot".
 */
export function describeProposalReason(
  requested: RequestedTime,
  proposedTime: ClockTime,
  lengthMinutes: number,
): string {
  const unit = lengthMinutes === 60 ? "hour" : "slot";
  if (requested.earliestTime) {
    return `It’s the first free ${unit} after ${requested.earliestTime}, allowing travel time.`;
  }
  const constraint = requested.timeConstraint;
  const window = constraint
    ? resolveTimeWindow({ constraint, time: requested.time })
    : {};
  const phrase = timePhrase(requested);
  if (window && phrase && !inWindow(proposedTime, window)) {
    return `Nothing was free ${buckets.has(phrase) ? `in the ${phrase}` : phrase}, so it’s the nearest free ${unit}.`;
  }
  switch (constraint) {
    case "exact":
    case "same_time":
      return "It’s the time they asked for.";
    case "around":
      return `It’s the nearest free ${unit} to ${requested.time}, allowing travel time.`;
    case "before":
      return `It’s the first free ${unit} before ${requested.time}, allowing travel time.`;
    case "morning":
    case "afternoon":
    case "evening":
      return `It’s the first free ${unit} in the ${constraint}, allowing travel time.`;
    default:
      return `It’s the first free ${unit} that day, allowing travel time.`;
  }
}
