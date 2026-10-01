// WhatsApp's customer service window: 24 hours from the customer's last
// message. Inside it any reply can be sent; outside it only an approved
// template. Worked out here from stored timestamps, never asked of a model.

export const SERVICE_WINDOW_HOURS = 24;

export type ServiceWindow =
  { open: true; closesAt: Date } | { open: false; closedAt: Date | null };

export function serviceWindow(
  lastInboundAt: Date | null,
  now: Date,
): ServiceWindow {
  if (!lastInboundAt) return { open: false, closedAt: null };
  const closesAt = new Date(
    lastInboundAt.getTime() + SERVICE_WINDOW_HOURS * 60 * 60 * 1000,
  );
  return closesAt > now
    ? { open: true, closesAt }
    : { open: false, closedAt: closesAt };
}
