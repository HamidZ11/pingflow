import { Check } from "lucide-react";
import { formatPhone } from "@/domain/contacts/phone";
import type { Owner } from "@/lib/auth/session";

// Settings → WhatsApp → Owner commands: whether the owner's own number is
// set up, so they know they can message their business number to check
// and change the schedule. Setting it is done on the server (for now with
// `pnpm whatsapp owner`), because whoever it names can change bookings.

export async function loadOwnerNumber(owner: Owner): Promise<string | null> {
  const { data, error } = await owner.supabase
    .from("owner_channel_identities")
    .select("address_e164")
    .eq("business_id", owner.business.id)
    .eq("channel", "whatsapp")
    .maybeSingle();
  if (error) throw error;
  return data ? formatPhone(data.address_e164) : null;
}

export function OwnerCommandsCard({
  number,
  connected,
  developerHint,
}: {
  number: string | null;
  connected: boolean;
  developerHint: boolean;
}) {
  return (
    <section
      aria-labelledby="owner-commands-title"
      className="mt-4 rounded-lg border border-line bg-surface px-4 py-4"
    >
      <h3 id="owner-commands-title" className="text-ui font-medium text-ink">
        Owner commands
      </h3>
      <p className="mt-0.5 text-ui-sm text-ink-2">
        Message your business number from your own phone to check and change
        your schedule, for example “Who have I got tomorrow?” or “Move Sarah to
        Friday at 4”.
      </p>
      <dl className="mt-3 grid grid-cols-[auto_minmax(max-content,1fr)] gap-x-4 border-t border-line pt-3 text-ui">
        <dt className="text-ink-3">Owner WhatsApp number</dt>
        <dd className="flex items-center gap-1.5 self-start text-ink">
          {number ? (
            <>
              <Check aria-hidden className="size-3.5 shrink-0 text-whatsapp" />
              <span className="tabular-nums">{number}</span>
              <span className="sr-only">, set up</span>
            </>
          ) : (
            "Not set up"
          )}
        </dd>
      </dl>
      {number && !connected && (
        <p className="mt-2 text-ui-sm text-ink-3">
          This works once WhatsApp is connected.
        </p>
      )}
      {!number && developerHint && (
        <p className="mt-2 text-ui-sm text-ink-3">
          Developer: run “pnpm whatsapp owner &lt;your email&gt; &lt;your
          number&gt;” to set it.
        </p>
      )}
    </section>
  );
}
