import type { ReplyChannel } from "@/features/attention/data";

// One sentence under anything Pingflow is about to send, saying where it
// goes: nowhere yet, WhatsApp, or (after 24 hours) nowhere from here.

export function channelNote(
  channel: ReplyChannel,
  what: "reply" | "confirmation",
): string {
  if (channel.kind === "simulated") {
    return "WhatsApp isn’t connected for this conversation, so this is recorded but not sent.";
  }
  if (channel.windowOpen) return "Pingflow will send this on WhatsApp.";
  return what === "reply"
    ? "It’s been more than 24 hours since they last messaged, so WhatsApp won’t let Pingflow send this. Reply in WhatsApp instead."
    : "It’s been more than 24 hours since they last messaged, so WhatsApp may not let Pingflow send this. If it can’t, it’ll tell you.";
}

/** Whether the owner's own words can go from Pingflow right now. */
export function canSendReply(channel: ReplyChannel): boolean {
  return channel.kind === "simulated" || channel.windowOpen;
}
