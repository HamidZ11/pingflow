// Everything Pingflow assumes about a line of work, in one place: its label,
// the services it starts people off with, and the example wording used in
// the service fields. Components read from here; they never hard-code
// trade-specific words.
//
// The services are starting suggestions, not templates: owners rename,
// remove and add to them freely.

export type ServiceDraft = {
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
};

type Config = {
  value: string;
  label: string;
  /** One to three sensible starting services. */
  services: readonly ServiceDraft[];
  /** Example text in an empty service name field. */
  servicePlaceholder: string;
  /** What "time after" means for this kind of work. */
  bufferHint: string;
};

const genericBufferHint =
  "“Time after” is kept free for travel or setting up before the next booking.";

export const businessTypes = [
  {
    value: "driving_instructor",
    label: "Driving instructor",
    services: [
      { name: "1 hour lesson", durationMinutes: 60, bufferMinutes: 15 },
      { name: "90 minute lesson", durationMinutes: 90, bufferMinutes: 15 },
      { name: "2 hour lesson", durationMinutes: 120, bufferMinutes: 15 },
    ],
    servicePlaceholder: "e.g. Refresher lesson",
    bufferHint: "“Time after” covers getting to your next pupil.",
  },
  {
    value: "tutor",
    label: "Tutor",
    services: [
      { name: "1 hour tutoring", durationMinutes: 60, bufferMinutes: 0 },
      { name: "90 minute tutoring", durationMinutes: 90, bufferMinutes: 0 },
    ],
    servicePlaceholder: "e.g. GCSE Maths",
    bufferHint:
      "“Time after” leaves a gap before your next student, if you need one.",
  },
  {
    value: "personal_trainer",
    label: "Personal trainer",
    services: [
      { name: "1 hour session", durationMinutes: 60, bufferMinutes: 15 },
      { name: "30 minute session", durationMinutes: 30, bufferMinutes: 15 },
    ],
    servicePlaceholder: "e.g. Strength session",
    bufferHint:
      "“Time after” covers resetting or travelling to your next client.",
  },
  {
    value: "cleaner",
    label: "Cleaner",
    services: [
      { name: "Standard clean", durationMinutes: 120, bufferMinutes: 30 },
      { name: "Deep clean", durationMinutes: 180, bufferMinutes: 30 },
    ],
    servicePlaceholder: "e.g. End of tenancy clean",
    bufferHint: "“Time after” covers travel to the next home.",
  },
  {
    value: "beauty",
    label: "Beauty",
    services: [{ name: "Appointment", durationMinutes: 60, bufferMinutes: 15 }],
    servicePlaceholder: "e.g. Gel manicure",
    bufferHint: "“Time after” covers tidying up before your next client.",
  },
  {
    value: "dog_groomer",
    label: "Dog groomer",
    services: [
      { name: "Full groom", durationMinutes: 120, bufferMinutes: 15 },
      { name: "Wash & tidy", durationMinutes: 60, bufferMinutes: 15 },
    ],
    servicePlaceholder: "e.g. Nail trim",
    bufferHint: "“Time after” covers cleaning up before the next dog.",
  },
  {
    value: "photographer",
    label: "Photographer",
    services: [
      { name: "Photo session", durationMinutes: 60, bufferMinutes: 30 },
    ],
    servicePlaceholder: "e.g. Family shoot",
    bufferHint: "“Time after” covers packing up and travelling on.",
  },
  {
    value: "other",
    label: "Something else",
    services: [{ name: "Appointment", durationMinutes: 60, bufferMinutes: 0 }],
    servicePlaceholder: "e.g. Standard appointment",
    bufferHint: genericBufferHint,
  },
] as const satisfies readonly Config[];

export type BusinessType = (typeof businessTypes)[number]["value"];

export function isBusinessType(value: unknown): value is BusinessType {
  return businessTypes.some((t) => t.value === value);
}

function configFor(type: string | null | undefined) {
  return businessTypes.find((t) => t.value === type);
}

export function businessTypeLabel(type: string): string {
  return configFor(type)?.label ?? "Business";
}

/** Fresh copies of a trade's starting services. */
export function suggestedServicesFor(type: BusinessType): ServiceDraft[] {
  return configFor(type)!.services.map((s) => ({ ...s }));
}

/** Example text for an empty service name; generic when the trade is unknown. */
export function servicePlaceholderFor(type: string | null | undefined): string {
  return configFor(type)?.servicePlaceholder ?? "e.g. Standard appointment";
}

export function bufferHintFor(type: string | null | undefined): string {
  return configFor(type)?.bufferHint ?? genericBufferHint;
}

function sameServices(a: readonly ServiceDraft[], b: readonly ServiceDraft[]) {
  return (
    a.length === b.length &&
    a.every(
      (s, i) =>
        s.name.trim() === b[i].name.trim() &&
        s.durationMinutes === b[i].durationMinutes &&
        s.bufferMinutes === b[i].bufferMinutes,
    )
  );
}

/**
 * The services to show after the owner picks (or changes) their line of
 * work. Suggestions are replaced only while the list is untouched: empty, or
 * exactly the suggestions for the trade picked before. Once the owner has
 * renamed, removed, added or retimed anything, the list is theirs and stays.
 */
export function servicesAfterChoosingType(
  current: readonly ServiceDraft[],
  previousType: BusinessType | null,
  nextType: BusinessType,
): { replaced: true; services: ServiceDraft[] } | { replaced: false } {
  const untouched =
    current.length === 0 ||
    (previousType !== null &&
      sameServices(current, suggestedServicesFor(previousType)));
  return untouched
    ? { replaced: true, services: suggestedServicesFor(nextType) }
    : { replaced: false };
}
