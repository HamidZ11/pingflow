// A message from a customer, as any messaging channel delivers it. The
// pipeline only ever sees this shape; each channel turns its provider's
// payloads into it at the edge.

/** What a customer can send. Only text is read; the rest goes to the owner. */
export const contentTypes = [
  "text",
  "image",
  "audio",
  "video",
  "document",
  "location",
  "contacts",
  "interactive",
  "unknown",
] as const;

export type ContentType = (typeof contentTypes)[number];

export type InboundChannelMessage = {
  channel: "whatsapp";
  /** The provider's message ID: the same message is only ever stored once. */
  externalMessageId: string;
  /** Which of the business's numbers it came to (a connection). */
  connectionId: string;
  businessId: string;
  /** The customer's number in E.164, when the provider shares it. */
  senderPhone: string | null;
  contentType: ContentType;
  /** The text, or a media item's caption. */
  text: string | null;
  /** When the customer sent it, by the provider's clock. */
  sentAt: Date;
};

const labels: Record<Exclude<ContentType, "text">, string> = {
  image: "Photo",
  audio: "Voice message",
  video: "Video",
  document: "Document",
  location: "Location",
  contacts: "Contact card",
  interactive: "Button reply",
  unknown: "Message Pingflow can’t read",
};

/**
 * What's stored as the body of a message Pingflow doesn't read: "Voice
 * message", or "Photo: Is this the right place?" when it has a caption.
 */
export function contentBody(type: ContentType, text: string | null): string {
  if (type === "text") return text ?? "";
  const caption = text?.trim();
  return caption ? `${labels[type]}: ${caption}` : labels[type];
}

/** "a voice message", "a photo", for sentences. */
export function contentNoun(type: ContentType): string {
  switch (type) {
    case "audio":
      return "a voice message";
    case "image":
      return "a photo";
    case "video":
      return "a video";
    case "document":
      return "a document";
    case "location":
      return "a location";
    case "contacts":
      return "a contact card";
    case "interactive":
      return "a button reply";
    default:
      return "a message Pingflow can’t read";
  }
}

/** "voice messages", for "Pingflow can't handle voice messages yet." */
export function contentPlural(type: ContentType): string {
  switch (type) {
    case "audio":
      return "voice messages";
    case "image":
      return "photos";
    case "video":
      return "videos";
    case "document":
      return "documents";
    case "location":
      return "locations";
    case "contacts":
      return "contact cards";
    case "interactive":
      return "button replies";
    default:
      return "this kind of message";
  }
}
