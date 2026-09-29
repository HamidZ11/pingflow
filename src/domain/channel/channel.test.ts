import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deliveryLabel } from "@/domain/channel/delivery";
import { contentBody } from "@/domain/channel/inbound";
import {
  describeNotSent,
  notSentReason,
  reminderNotSentReason,
} from "@/domain/channel/not-sent";
import { decideSend, templatePurposeFor } from "@/domain/channel/send-policy";
import { templateParameters, templateValues } from "@/domain/channel/templates";
import { serviceWindow } from "@/domain/channel/window";
import {
  countryOfPhone,
  phoneFromInternational,
} from "@/domain/contacts/phone";
import { zonedInstant } from "@/domain/time/zoned";

const tz = "Europe/London";
const at = (h: number) => new Date(Date.UTC(2026, 8, 29, h));

describe("the 24-hour service window", () => {
  it("is open for 24 hours after their last message, then closed", () => {
    const last = at(10);
    expect(serviceWindow(last, at(11))).toMatchObject({ open: true });
    expect(
      serviceWindow(last, new Date(last.getTime() + 24 * 3600e3 - 1)).open,
    ).toBe(true);
    expect(
      serviceWindow(last, new Date(last.getTime() + 24 * 3600e3)).open,
    ).toBe(false);
    expect(serviceWindow(null, at(11))).toEqual({
      open: false,
      closedAt: null,
    });
  });
});

describe("the send policy", () => {
  const reminder = {
    purpose: "appointment_reminder" as const,
    name: "appt_reminder",
    language: "en_GB",
    parameters: ["customer_first_name", "when"],
  };
  const open = serviceWindow(at(10), at(11));
  const closed = serviceWindow(at(10), at(40));

  it("sends text inside the window, whatever it is", () => {
    for (const purpose of [
      "reply",
      "confirmation",
      "owner_reply",
      "reminder",
    ] as const) {
      expect(
        decideSend({ purpose, booking: null, window: open, templates: {} }),
      ).toEqual({ action: "send_text" });
    }
  });

  it("outside it, uses the approved template for the purpose, or doesn't send", () => {
    expect(
      decideSend({
        purpose: "reminder",
        booking: null,
        window: closed,
        templates: { appointment_reminder: reminder },
      }),
    ).toEqual({ action: "send_template", template: reminder });
    expect(
      decideSend({
        purpose: "reminder",
        booking: null,
        window: closed,
        templates: {},
      }),
    ).toEqual({ action: "block", reason: "template_required" });
    // Replies and the owner's own words never have a template.
    expect(
      decideSend({
        purpose: "owner_reply",
        booking: null,
        window: closed,
        templates: { appointment_reminder: reminder },
      }),
    ).toEqual({ action: "block", reason: "template_required" });
  });

  it("picks the confirmation template by what happened to the booking", () => {
    expect(templatePurposeFor("confirmation", { status: "confirmed" })).toBe(
      "booking_confirmation",
    );
    expect(templatePurposeFor("confirmation", { status: "cancelled" })).toBe(
      "cancellation_confirmation",
    );
    expect(templatePurposeFor("reply", null)).toBeNull();
  });
});

describe("template values", () => {
  const values = templateValues({
    customerName: "Sarah Khan",
    serviceName: "Driving lesson",
    startsAt: zonedInstant("2026-10-02", "17:00", tz),
    timeZone: tz,
    businessName: "Alex's Driving",
  });

  it("come from checked booking data, in the configured order", () => {
    expect(
      templateParameters(["customer_first_name", "service", "when"], values),
    ).toEqual(["Sarah", "driving lesson", "Friday 2 October at 17:00"]);
  });

  it("refuse an unknown or empty field rather than send a broken template", () => {
    expect(
      templateParameters(["customer_first_name", "price"], values),
    ).toBeNull();
    expect(
      templateParameters(["business_name"], { ...values, business_name: "" }),
    ).toBeNull();
  });
});

describe("what the owner is told", () => {
  it("labels delivery plainly", () => {
    expect(deliveryLabel("queued")).toBe("Sending");
    expect(deliveryLabel("delivered")).toBe("Delivered");
    expect(deliveryLabel("read")).toBe("Read");
    expect(deliveryLabel("blocked")).toBe("Not sent");
    expect(deliveryLabel("received")).toBeNull();
  });

  it("explains a message that wasn't sent without provider codes", () => {
    expect(
      describeNotSent({
        purpose: "confirmation",
        cause: "template_required",
        who: "Sarah",
      }).title,
    ).toBe("Pingflow couldn’t send the confirmation to Sarah");
    for (const cause of [
      "template_required",
      "connection_unavailable",
      "recipient_unavailable",
      "outcome_unknown",
      "template_rejected",
      "provider_failed",
      null,
    ]) {
      const text = notSentReason(cause) + reminderNotSentReason(cause);
      expect(text).not.toMatch(/\d{3,}|webhook|Graph|API|Meta/);
    }
  });

  it("says why a reminder wasn't sent, truthfully", () => {
    expect(reminderNotSentReason("simulated")).toBe(
      "it’s a simulated conversation, so it was recorded instead",
    );
    expect(reminderNotSentReason("not_on_whatsapp")).toBe(
      "they haven’t messaged you on WhatsApp yet",
    );
  });

  it("stores media as a label, with the caption if there is one", () => {
    expect(contentBody("audio", null)).toBe("Voice message");
    expect(contentBody("image", "Is this the place?")).toBe(
      "Photo: Is this the place?",
    );
  });
});

describe("numbers from providers", () => {
  it("reads international digits, never as a UK national number", () => {
    expect(phoneFromInternational("447700900123")).toBe("+447700900123");
    expect(phoneFromInternational("15551234567")).toBe("+15551234567");
    expect(phoneFromInternational("07700900123")).toBeNull();
    expect(phoneFromInternational("")).toBeNull();
    expect(countryOfPhone("+447700900123")).toBe("GB");
    expect(countryOfPhone("+15551234567")).toBeNull();
  });
});

describe("the message domain knows nothing about Meta", () => {
  it("imports no WhatsApp provider code", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
          files.push(path);
      }
    };
    walk("src/domain");
    walk("src/features/messages");
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(
        /lib\/whatsapp|features\/whatsapp|graph\.facebook|phone_number_id|wamid/,
      );
    }
  });
});
