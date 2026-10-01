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

// Why a message recorded as "simulated" wasn't sent. In a connected
// business that only happens in a conversation that came from the
// development simulator; otherwise WhatsApp wasn't connected when it was
// recorded. Decided per message from the conversation's own history, not
// from today's connection, so an old message keeps its true reason.

export type SimulatedReason = "simulated_conversation" | "not_connected";

export type InboundSource = {
  conversationId: string;
  source: "whatsapp" | "simulator";
  sentAt: string;
};

export function simulatedReason(
  message: { conversationId: string | null; sentAt: string },
  inbound: InboundSource[],
): SimulatedReason {
  const at = Date.parse(message.sentAt);
  let latest: InboundSource | null = null;
  for (const m of inbound) {
    if (m.conversationId !== message.conversationId) continue;
    const t = Date.parse(m.sentAt);
    if (t <= at && (!latest || t > Date.parse(latest.sentAt))) latest = m;
  }
  return latest?.source === "simulator"
    ? "simulated_conversation"
    : "not_connected";
}

/** "it’s a simulated conversation", or why WhatsApp didn't send it. */
export function simulatedNote(
  reason: SimulatedReason,
  connectedNow: boolean,
): string {
  if (reason === "simulated_conversation") {
    return "it’s a simulated conversation";
  }
  return connectedNow
    ? "WhatsApp wasn’t connected at the time"
    : "WhatsApp isn’t connected yet";
}
