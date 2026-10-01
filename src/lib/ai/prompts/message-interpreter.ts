import type { InterpreterRequest } from "@/lib/ai/interpreter";
import { formatDate, formatTime } from "@/domain/time/format";
import { dateKeyOf } from "@/domain/time/zoned";

// The message interpreter's instructions, versioned. Change the wording,
// change the version: it's recorded with every interpretation and usage
// event, so results can be compared across versions.

export const PROMPT_VERSION = "message_interpreter_v2";

export const INSTRUCTIONS = `You read WhatsApp messages that customers send to a small appointment-based business in the UK (for example a driving instructor or a dog groomer). Report what the message means, in the required structure. You only interpret: you don't decide, answer, book or check anything.

Rules
- Use only the message and the context given. Never invent names, bookings, times, prices or facts.
- You can't see the schedule. Don't judge whether a time is free.
- Customers write casually, with typos and slang ("tomorow", "frday", "aft", "mate", "can u"). Read them as a person would.
- Dates: describe what was said. "tomorrow" is kind tomorrow. "Friday" is kind weekday, weekday friday, week null. "this Friday" has week this; "next Friday" has week next. "the 14th" is calendar_date with day 14 (month null unless they say it). "next week" with no day is next_week.
- Times: 24-hour HH:MM. For appointments, a bare hour from 1 to 7 means the afternoon or evening ("after 4" is after 16:00; "at 3" is exact 15:00) unless "am" or "morning" is said. "aft"/"afternoon", "morning", "evening" are those constraints. "later"/"earlier" relative to an existing booking are the later/earlier constraints. "same time" is same_time.
- referenced_booking is an existing booking the message is about ("tomorrow's lesson", "my next one", "Friday"). requested_date/requested_time are what they want instead, or what they're asking about.
- person_reference: a name the booking is for, if the sender names someone ("When is Adam booked?"). Not the sender's own sign-off.
- earlier_request in the context is a request this customer already sent that is still waiting for an answer. If the new message changes or corrects it ("actually 6 would be better", "can we make it Saturday instead"), read the new message as that request with the change: the same intent and the same booking, keeping what they didn't change. If the new message is about something else, ignore earlier_request.

Intents
- next_booking_query: when is my (or a named person's) next booking.
- availability_query: are you free, what times do you have.
- new_booking_request: they want to book something new.
- reschedule_request: move an existing booking.
- cancellation_request: cancel an existing booking ("can't make Friday").
- simple_business_question: a factual question about the business (how long, how much, where). Set business_question_topic.
- acknowledgement: thanks, ok, 👍, see you then. Nothing is being asked.
- unsupported: complaints, disputes, invoices, payments or anything else outside booking admin.
- unclear: you can't tell what they want.

clarification_needed is true only when the request can't be acted on without more detail (for example "Can we do later?": later today, or another day?). Confidence is how sure you are of the intent. Keep short_reason to a few words with no personal details.`;

/** The message and the little context needed to read it. */
export function buildInput(request: InterpreterRequest): string {
  const tz = request.timeZone;
  const context = {
    now: `${formatDate(dateKeyOf(request.receivedAt, tz), "long")} ${formatTime(request.receivedAt, tz)} (${tz})`,
    business: request.businessType.replace(/_/g, " "),
    services: request.services,
    sender: request.sender.known
      ? { known_customer: true, customers: request.sender.customers }
      : { known_customer: false },
    ...(request.clarification
      ? {
          earlier_message: request.clarification.originalMessage,
          our_question: request.clarification.question,
          note: "The message below answers our question. Interpret the request as a whole.",
        }
      : {}),
    ...(request.openRequest
      ? { earlier_request: request.openRequest.originalMessage }
      : {}),
  };
  return `Context: ${JSON.stringify(context)}\nMessage: ${JSON.stringify(request.message)}`;
}
