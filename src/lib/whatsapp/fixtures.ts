// Minimal WhatsApp Cloud API webhook bodies, in the documented shape (Graph
// API v26.0), for tests and the local webhook tool. Synthetic numbers only.

export const TEST_WABA_ID = "102290129340398";
export const TEST_PHONE_NUMBER_ID = "106540352242922";

type Envelope = { phoneNumberId?: string; wabaId?: string };

function envelope(value: Record<string, unknown>, e: Envelope = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: e.wabaId ?? TEST_WABA_ID,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550783881",
                phone_number_id: e.phoneNumberId ?? TEST_PHONE_NUMBER_ID,
              },
              ...value,
            },
          },
        ],
      },
    ],
  };
}

const seconds = (at: Date) => String(Math.floor(at.getTime() / 1000));

export function inboundText(
  input: {
    id: string;
    from: string; // digits, no "+"
    body: string;
    at?: Date;
    userId?: string;
  } & Envelope,
) {
  return envelope(
    {
      contacts: [
        {
          profile: { name: "Customer" },
          wa_id: input.from,
          ...(input.userId ? { user_id: input.userId } : {}),
        },
      ],
      messages: [
        {
          from: input.from,
          ...(input.userId ? { from_user_id: input.userId } : {}),
          id: input.id,
          timestamp: seconds(input.at ?? new Date()),
          type: "text",
          text: { body: input.body },
        },
      ],
    },
    input,
  );
}

export function inboundOfType(
  input: {
    id: string;
    from?: string | null;
    type: string;
    part?: Record<string, unknown>;
    at?: Date;
    userId?: string;
  } & Envelope,
) {
  return envelope(
    {
      contacts: [
        { profile: { name: "Customer" }, wa_id: input.from ?? undefined },
      ],
      messages: [
        {
          ...(input.from ? { from: input.from } : {}),
          ...(input.userId ? { from_user_id: input.userId } : {}),
          id: input.id,
          timestamp: seconds(input.at ?? new Date()),
          type: input.type,
          ...(input.part ? { [input.type]: input.part } : {}),
        },
      ],
    },
    input,
  );
}

export function statusUpdate(
  input: {
    id: string;
    status: "sent" | "delivered" | "read" | "failed" | "played";
    recipient?: string;
    at?: Date;
    billable?: boolean;
    category?: string;
    errorCode?: number;
  } & Envelope,
) {
  return envelope(
    {
      statuses: [
        {
          id: input.id,
          status: input.status,
          timestamp: seconds(input.at ?? new Date()),
          recipient_id: input.recipient ?? "447700900123",
          ...(input.status !== "failed" && input.category
            ? {
                pricing: {
                  billable: input.billable ?? false,
                  pricing_model: "PMP",
                  type: input.billable ? "regular" : "free_customer_service",
                  category: input.category,
                },
              }
            : {}),
          ...(input.errorCode
            ? {
                errors: [
                  {
                    code: input.errorCode,
                    title: "Message undeliverable",
                    message: "Message undeliverable",
                    error_data: { details: "Message could not be delivered" },
                  },
                ],
              }
            : {}),
        },
      ],
    },
    input,
  );
}

/** A change for a field Pingflow doesn't subscribe to or act on. */
export function otherField(field: string) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: TEST_WABA_ID,
        changes: [{ field, value: { event: "something", ts: 1 } }],
      },
    ],
  };
}

/**
 * An inbound text exactly as Meta sent one in September 2026, with every
 * identifier replaced by a synthetic value: `contacts[].user_id` and
 * `country_code`, `from_user_id` and `from_logical_id` on the message, and
 * an undocumented `internal_1p_only_data` block Pingflow must ignore.
 */
export function currentMetaInboundText(
  input: {
    id: string;
    from: string;
    body: string;
    at?: Date;
  } & Envelope,
) {
  const phoneNumberId = input.phoneNumberId ?? TEST_PHONE_NUMBER_ID;
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: input.wabaId ?? TEST_WABA_ID,
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550000000",
                phone_number_id: phoneNumberId,
              },
              contacts: [
                {
                  profile: { name: "T" },
                  wa_id: input.from,
                  user_id: "GB.0000000000000000",
                  country_code: "GB",
                },
              ],
              messages: [
                {
                  from: input.from,
                  from_user_id: "GB.0000000000000000",
                  id: input.id,
                  timestamp: seconds(input.at ?? new Date()),
                  text: { body: input.body },
                  from_logical_id: "000000000000000",
                  type: "text",
                  internal_1p_only_data: {
                    account_context: {
                      waac_id: "000000000000000",
                      cs_id: phoneNumberId,
                      account_context_type: "non_paid_messaging",
                    },
                  },
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}
