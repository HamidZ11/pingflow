// Turns database errors into sentences an owner can act on. The functions in
// the migrations raise P0001 with a machine-readable hint (and sometimes a
// detail, such as a service name); overlapping bookings that slip past the
// slot guard raise the exclusion constraint's 23P01.

type DbError = {
  code?: string;
  hint?: string | null;
  details?: string | null;
  message?: string;
};

const byHint: Record<string, string> = {
  already_resolved: "This request has already been handled.",
  booking_inactive: "That booking has been cancelled or no longer exists.",
  not_found: "That item no longer exists. It may have been removed.",
  missing_time: "Choose a time first.",
  invalid_reminder: "The reminder would go out after the appointment.",
  already_set_up: "Your business is already set up.",
  invalid_services: "Keep at least one service.",
  invalid_hours: "Check your working hours.",
  no_business: "Finish setting up your business first.",
  no_conversation: "There is no conversation to reply in.",
  missing_reply: "Write a reply first.",
  slot_unavailable:
    "That time was taken a moment ago. Choose another time; nothing was saved.",
  block_covers_booking:
    "That time has a booking in it. Move or cancel the booking first.",
  service_not_found:
    "That service isn’t available any more. Choose another one.",
  invalid_customer: "Add the customer’s name.",
  invalid_service_name: "Every service needs a name, up to 80 characters.",
  invalid_service_length: "Choose a length and time after from the lists.",
  duplicate_service: "A service appears twice. Reload and try again.",
  duplicate_service_name: "Two services have the same name.",
  unknown_service:
    "One of these services has changed elsewhere. Reload the page and try again.",
};

/**
 * The owner-facing sentence for a failed database call. Anything that isn't
 * an expected, explained failure is also logged on the server with the
 * operation and the database's own code and message, so it can be traced.
 * Nothing from the database reaches the browser.
 */
export function friendlyError(
  error: DbError | null | undefined,
  operation: string,
): string {
  const known = knownError(error);
  if (known) return known;
  logServerError(operation, error);
  return "Something went wrong. Nothing was changed. Please try again.";
}

function knownError(error: DbError | null | undefined): string | null {
  if (!error) return null;
  if (error.code === "23P01") return byHint.slot_unavailable;
  if (error.hint === "service_has_future_bookings") {
    const name = error.details ? `“${error.details}”` : "That service";
    return `${name} has bookings coming up, so it can’t be removed yet. Move or cancel them first. Nothing was changed.`;
  }
  if (error.code === "23514" && /phone/.test(error.message ?? "")) {
    return "That WhatsApp number doesn’t look right.";
  }
  if (error.code === "23505") return "That already exists.";
  if (error.hint && byHint[error.hint]) return byHint[error.hint];
  return null;
}

/** Server-side only: what failed, with the database's code and message. */
export function logServerError(operation: string, error: unknown) {
  const e = (error ?? {}) as DbError;
  console.error(`[pingflow] ${operation} failed`, {
    code: e.code ?? null,
    message: e.message ?? String(error),
    hint: e.hint ?? null,
    details: e.details ?? null,
  });
}

export type ActionResult =
  { ok: true; message?: string } | { ok: false; error: string };
