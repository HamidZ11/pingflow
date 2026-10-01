// Who a message is from, and who it's about, decided from Pingflow's own
// records: the sender's number, the contact it belongs to, and the
// customers that contact is linked to. The interpreter can report a name
// mentioned in the message ("When is Adam's lesson?"), but it never decides
// identity, and a name never unlocks someone else's bookings.

export type LinkedCustomer = {
  id: string;
  fullName: string;
  relationship: string;
};

export type Identity =
  /** The number isn't known, or isn't linked to any customer. */
  | { kind: "unknown" }
  /** Exactly one customer, either the only one linked or the one named. */
  | { kind: "customer"; customer: LinkedCustomer; via: "only_link" | "named" }
  /** Several linked customers and the message doesn't say which. */
  | { kind: "ambiguous"; candidates: LinkedCustomer[] }
  /** The message names someone this number isn't linked to. */
  | { kind: "not_linked"; named: string; linked: LinkedCustomer[] };

function norm(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’']s$/, "");
}

function matches(customer: LinkedCustomer, reference: string) {
  const ref = norm(reference);
  const full = norm(customer.fullName);
  const first = full.split(/\s+/)[0];
  return ref === full || ref === first;
}

export function resolveIdentity(
  linked: LinkedCustomer[],
  personReference: string | null,
): Identity {
  if (linked.length === 0) return { kind: "unknown" };

  if (personReference) {
    const named = linked.filter((c) => matches(c, personReference));
    if (named.length === 1) {
      return {
        kind: "customer",
        customer: named[0],
        via: linked.length === 1 ? "only_link" : "named",
      };
    }
    if (named.length === 0) {
      return { kind: "not_linked", named: personReference, linked };
    }
    return { kind: "ambiguous", candidates: named };
  }

  if (linked.length === 1) {
    return { kind: "customer", customer: linked[0], via: "only_link" };
  }
  return { kind: "ambiguous", candidates: linked };
}
