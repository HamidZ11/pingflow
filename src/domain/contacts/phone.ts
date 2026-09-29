// WhatsApp numbers are stored in E.164 ("+447700900123"). Owners type them
// however they write them ("07700 900123", "+44 7700 900123"); UK numbers
// without a country code are assumed, since the demo business is in the UK.

export function parsePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let digits = trimmed.replace(/[\s().-]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (digits.startsWith("0")) digits = `+44${digits.slice(1)}`;
  if (!digits.startsWith("+")) digits = `+${digits}`;
  return /^\+[1-9]\d{6,14}$/.test(digits) ? digits : null;
}

/**
 * A number as messaging providers send it: international digits with no
 * "+" ("447700900123"). Never read as a UK national number.
 */
export function phoneFromInternational(digits: string): string | null {
  const clean = digits.trim().replace(/^\+/, "");
  return /^[1-9]\d{6,14}$/.test(clean) ? `+${clean}` : null;
}

/** "+447700900123" → "447700900123", as messaging providers take it. */
export function internationalDigits(e164: string): string {
  return e164.replace(/^\+/, "");
}

/** ISO country for a number, where the prefix settles it; otherwise null. */
export function countryOfPhone(e164: string): string | null {
  if (e164.startsWith("+44")) return "GB";
  if (e164.startsWith("+353")) return "IE";
  return null;
}

/** "+447700900123" → "+44 7700 900123"; other countries lightly spaced. */
export function formatPhone(e164: string): string {
  const uk = /^\+44(\d{4})(\d{6})$/.exec(e164);
  if (uk) return `+44 ${uk[1]} ${uk[2]}`;
  return e164.replace(/^(\+\d{1,3})(\d{3,4})(\d+)$/, "$1 $2 $3");
}

export const relationshipLabels = {
  self: "themselves",
  parent: "parent",
  guardian: "guardian",
  partner: "partner",
  other: "on their behalf",
} as const;

export type Relationship = keyof typeof relationshipLabels;
