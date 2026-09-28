import type { ClockTime, Weekday } from "@/domain/time/zoned";

const plural = [
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
  "Sundays",
];

/** "Weekly on Tuesdays at 16:00", "Every 2 weeks on Fridays at 09:30" */
export function describeSeries(series: {
  weekday: Weekday;
  startTime: ClockTime;
  intervalWeeks: number;
}): string {
  const cadence =
    series.intervalWeeks === 1
      ? "Weekly"
      : `Every ${series.intervalWeeks} weeks`;
  return `${cadence} on ${plural[series.weekday - 1]} at ${series.startTime.slice(0, 5)}`;
}
