import "server-only";
import { formatPhone } from "@/domain/contacts/phone";
import { formatRelativeDateTime } from "@/domain/time/format";
import { aiSettings } from "@/lib/ai/config";
import type { Owner } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";

// What the simulator shows: who can "send" a message (the business's
// contacts), which interpreter is configured, and recent processing runs.
// Runs are internal, so they're read with the server's client, scoped to
// the signed-in owner's business.

export type SimulatorSender = { phone: string; label: string };

export type SimulatorRun = {
  id: string;
  when: string;
  from: string;
  body: string;
  source: string;
  status: string;
  attempts: number;
  interpreter: string | null;
  model: string | null;
  decision: string | null;
  reason: string | null;
  error: string | null;
};

export type SimulatorData = {
  senders: SimulatorSender[];
  interpreter: {
    kind: string;
    model: string;
    reasoningEffort: string | null;
    note: string;
  };
  runs: SimulatorRun[];
};

export async function loadSimulator(owner: Owner): Promise<SimulatorData> {
  const now = new Date();
  const tz = owner.business.timeZone;
  const { data: contacts, error } = await owner.supabase
    .from("contacts")
    .select(
      "phone_e164, display_name, links:customer_contacts ( relationship, customer:customers ( full_name ) )",
    )
    .eq("business_id", owner.business.id)
    .order("display_name");
  if (error) throw error;

  const senders = contacts.map((c) => {
    const phone = formatPhone(c.phone_e164);
    const people = (c.links ?? [])
      .map((l) => l.customer?.full_name.split(" ")[0])
      .filter((n): n is string => Boolean(n))
      .sort();
    if (!c.display_name) {
      return {
        phone: c.phone_e164,
        label: people.length
          ? `${phone} (for ${people.join(" and ")})`
          : `${phone} (not a customer)`,
      };
    }
    const forWhom =
      people.length > 1 ||
      (people.length === 1 && !c.display_name.startsWith(people[0]))
        ? ` (for ${people.join(" and ")})`
        : "";
    return {
      phone: c.phone_e164,
      label: `${c.display_name}${forWhom} · ${phone}`,
    };
  });

  const { data: runs, error: runsError } = await createServiceClient()
    .from("message_processing_runs")
    .select(
      `id, status, attempts, interpreter, model, decision, decision_detail, error_category, created_at,
       message:messages!message_processing_runs_business_id_message_id_fkey (
         body, sent_at, source,
         conversation:conversations ( contact:contacts ( phone_e164, display_name ) )
       )`,
    )
    .eq("business_id", owner.business.id)
    .order("created_at", { ascending: false })
    .limit(12);
  if (runsError) throw runsError;

  const settings = aiSettings();
  return {
    senders,
    interpreter: {
      kind: settings.interpreter,
      model: settings.model,
      reasoningEffort: settings.reasoningEffort,
      note: settings.note,
    },
    runs: runs.map((r) => {
      const contact = r.message?.conversation?.contact;
      const detail = (r.decision_detail ?? {}) as { reason?: string };
      return {
        id: r.id,
        when: formatRelativeDateTime(
          new Date(r.message?.sent_at ?? r.created_at),
          now,
          tz,
        ),
        from: contact
          ? (contact.display_name ?? formatPhone(contact.phone_e164))
          : "Unknown",
        body: r.message?.body ?? "",
        source: r.message?.source ?? "",
        status: r.status,
        attempts: r.attempts,
        interpreter: r.interpreter,
        model: r.model,
        decision: r.decision,
        reason: detail.reason ?? null,
        error: r.error_category,
      };
    }),
  };
}
