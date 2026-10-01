import type { SlotProblem } from "@/domain/availability/engine";

/** Why a time can't be used, in the owner's words. */
export function explainSlotProblem(problem: SlotProblem): string {
  switch (problem.kind) {
    case "in_past":
      return "That time has already passed.";
    case "outside_hours":
      return "That’s outside your working hours.";
    case "overlaps_booking":
      return "That time overlaps another booking.";
    case "blocked":
      return "That time is blocked in your schedule.";
    case "inside_buffer":
      return "That doesn’t leave enough travel time around another booking.";
  }
}
