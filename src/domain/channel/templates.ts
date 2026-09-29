import { firstName, serviceNoun } from "@/domain/messages/templates";
import { formatDate, formatTime } from "@/domain/time/format";
import { dateKeyOf } from "@/domain/time/zoned";

// The fields an approved WhatsApp template can be filled from. A template's
// body parameters are configured as an ordered list of these names, so the
// wording lives in WhatsApp Manager and the values come from checked data.

export const templateFields = [
  "customer_first_name",
  "service",
  "day",
  "time",
  "when",
  "business_name",
] as const;

export type TemplateField = (typeof templateFields)[number];

export function isTemplateField(value: string): value is TemplateField {
  return (templateFields as readonly string[]).includes(value);
}

export function templateValues(input: {
  customerName: string;
  serviceName: string | null;
  startsAt: Date;
  timeZone: string;
  businessName: string | null;
}): Record<TemplateField, string> {
  const day = formatDate(dateKeyOf(input.startsAt, input.timeZone), "long");
  const time = formatTime(input.startsAt, input.timeZone);
  return {
    customer_first_name: firstName(input.customerName),
    service: serviceNoun(input.serviceName ?? "booking"),
    day,
    time,
    when: `${day} at ${time}`,
    business_name: input.businessName ?? "",
  };
}

/** The body parameters for a template, in its configured order. */
export function templateParameters(
  parameters: string[],
  values: Record<TemplateField, string>,
): string[] | null {
  const out: string[] = [];
  for (const name of parameters) {
    if (!isTemplateField(name) || !values[name]) return null;
    out.push(values[name]);
  }
  return out;
}
