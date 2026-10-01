// The shape the availability endpoint returns, shared with the pickers that
// call it. Times are pre-formatted in the business's time zone.

export type AvailableSlot = { startsAt: string; time: string };

export type AvailableDay = {
  date: string;
  label: string;
  relativeLabel: string;
  slots: AvailableSlot[];
};

export type AvailabilityResponse = {
  days: AvailableDay[];
  /** What the times were computed for, e.g. "1 hour, with 15 min travel after". */
  fitFor: string;
};
