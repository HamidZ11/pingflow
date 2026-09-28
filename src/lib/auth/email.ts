// A deliberately simple check: catches typos like a missing @ or domain
// before we ask for an email to be sent. The link itself proves the address.
export function isEmailAddress(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}

export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}
