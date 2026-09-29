// What happened to a message Pingflow sent, and how it reads to the owner.
// States only move forward; the database applies that (apply_whatsapp_status).

export type Delivery =
  | "received"
  | "simulated"
  | "queued"
  | "accepted"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "blocked";

/** A short status for the owner, or null when there's nothing to say. */
export function deliveryLabel(delivery: Delivery): string | null {
  switch (delivery) {
    case "simulated":
      return "Simulated";
    case "queued":
    case "accepted":
      return "Sending";
    case "sent":
      return "Sent";
    case "delivered":
      return "Delivered";
    case "read":
      return "Read";
    case "failed":
    case "blocked":
      return "Not sent";
    default:
      return null;
  }
}
