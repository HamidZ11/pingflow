// WhatsApp for developers: the developer connection, templates, the worker,
// and signed test webhooks. Uses the secret key; never prints tokens.
//
//   pnpm whatsapp connect <email>          connect the number in .env.local
//   pnpm whatsapp disconnect <email>
//   pnpm whatsapp status <email>           connection, queues, templates
//   pnpm whatsapp work [--loop]            run the worker (once, or every 5 s)
//   pnpm whatsapp template <email> <purpose> <name> <language> [field,...]
//   pnpm whatsapp templates-sync <email>   refresh template review status
//   pnpm whatsapp simulate <email> "text" [--from +447700900123] [--url http://localhost:3000]
//                                          post a signed Meta-shaped webhook
//   pnpm whatsapp owner <email> <number>   the owner's own WhatsApp number:
//                                          messages from it are owner commands
//   pnpm whatsapp owner-clear <email>
//   pnpm whatsapp retry-failed <email>     put inbound events that ran out
//                                          of retries back in the queue
//
// Only against the local Supabase unless --allow-remote is passed.

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { internationalDigits, parsePhone } from "@/domain/contacts/phone";
import { templateFields } from "@/domain/channel/templates";
import { createWhatsAppDeps } from "@/features/whatsapp/factory";
import { runWhatsAppWork } from "@/features/whatsapp/worker";
import {
  aiSettings,
  createMessageInterpreter,
  createOwnerInterpreter,
} from "@/lib/ai/config";
import type { Database } from "@/lib/supabase/database.types";
import { WhatsAppCloudTransport } from "@/lib/whatsapp/cloud-transport";
import { whatsAppEnv } from "@/lib/whatsapp/config";
import { signBody } from "@/lib/whatsapp/signature";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at === -1 ? null : (args[at + 1] ?? "");
};
const positional = args.filter(
  (a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"),
);
const [command, ...rest] = positional;

function fail(message: string): never {
  console.error(`  ${message}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (
  !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url) &&
  !args.includes("--allow-remote")
) {
  fail(
    "Only runs against the local Supabase (pass --allow-remote to override).",
  );
}
const db = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
const env = whatsAppEnv();

async function businessFor(email: string | undefined) {
  if (!email) fail("Which account? Pass the owner's email.");
  const { data: users, error } = await db.auth.admin.listUsers({
    perPage: 1000,
  });
  if (error) fail(error.message);
  const user = users.users.find((u) => u.email === email);
  if (!user) fail(`No account for ${email}.`);
  const { data: business } = await db
    .from("businesses")
    .select("id, name")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!business) fail(`${email} hasn't set up a business.`);
  return business;
}

async function liveConnection(businessId: string) {
  const { data } = await db
    .from("whatsapp_connections")
    .select("*")
    .eq("business_id", businessId)
    .neq("status", "disconnected")
    .maybeSingle();
  return data;
}

async function connect(email?: string) {
  const business = await businessFor(email);
  if (!env.accessToken || !env.phoneNumberId) {
    fail(
      "Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env.local first.",
    );
  }
  const health = await new WhatsAppCloudTransport({
    accessToken: env.accessToken,
    phoneNumberId: env.phoneNumberId,
  }).health();
  if (!health.ok) {
    fail(
      `WhatsApp refused the credentials (${health.category}${health.code ? `, code ${health.code}` : ""}).`,
    );
  }
  const display = health.displayPhoneNumber
    ? parsePhone(
        health.displayPhoneNumber.startsWith("+")
          ? health.displayPhoneNumber
          : `+${health.displayPhoneNumber}`,
      )
    : null;
  const existing = await liveConnection(business.id);
  const now = new Date().toISOString();
  const row = {
    business_id: business.id,
    mode: "developer" as const,
    status: "connected" as const,
    waba_id: env.wabaId,
    phone_number_id: env.phoneNumberId,
    display_phone_number: display,
    verified_name: health.verifiedName,
    connected_at: now,
    last_error_category: null,
    last_error_at: null,
  };
  const { error } = existing
    ? await db.from("whatsapp_connections").update(row).eq("id", existing.id)
    : await db.from("whatsapp_connections").insert(row);
  if (error) fail(error.message);
  console.log(
    `  Connected ${display ?? "the number"}${health.verifiedName ? ` (${health.verifiedName})` : ""} to ${business.name ?? email}.`,
  );
}

async function disconnect(email?: string) {
  const business = await businessFor(email);
  const { error } = await db
    .from("whatsapp_connections")
    .update({
      status: "disconnected",
      disconnected_at: new Date().toISOString(),
    })
    .eq("business_id", business.id)
    .neq("status", "disconnected");
  if (error) fail(error.message);
  console.log("  Disconnected. History is kept.");
}

async function status(email?: string) {
  const business = await businessFor(email);
  const connection = await liveConnection(business.id);
  if (!connection) {
    console.log("  Not connected.");
    return;
  }
  const count = async (
    table: "whatsapp_events" | "message_deliveries",
    column: string,
    value: string,
  ) => {
    const { count: n } = await db
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq(column, value);
    return n ?? 0;
  };
  const { data: templates } = await db
    .from("whatsapp_templates")
    .select("purpose, name, language, parameters, provider_status")
    .eq("connection_id", connection.id);
  console.log(`
  Status            ${connection.status}${connection.last_error_category ? ` (${connection.last_error_category})` : ""}
  Mode              ${connection.mode}
  Number            ${connection.display_phone_number ?? "unknown"}
  Phone number ID   ${connection.phone_number_id}
  WABA ID           ${connection.waba_id ?? "not set"}
  Last webhook      ${connection.last_webhook_at ?? "never"}
  Last inbound      ${connection.last_inbound_at ?? "never"}
  Last outbound     ${connection.last_outbound_at ?? "never"}
  Events pending    ${await count("whatsapp_events", "status", "pending")}
  Events failed     ${await count("whatsapp_events", "status", "failed")}${(await count("whatsapp_events", "status", "failed")) ? " (pnpm whatsapp retry-failed)" : ""}
  Sends queued      ${await count("message_deliveries", "dispatch", "queued")}
  Templates         ${templates?.length ? templates.map((t) => `${t.purpose}: ${t.name} (${t.language}) ${t.provider_status} [${t.parameters.join(", ")}]`).join("\n                    ") : "none"}
`);
}

async function work() {
  const deps = createWhatsAppDeps({
    db,
    interpreter: createMessageInterpreter(aiSettings()),
    ownerInterpreter: createOwnerInterpreter(aiSettings()),
    env,
    log: (event, fields) => console.log(`  ${event} ${JSON.stringify(fields)}`),
  });
  do {
    await runWhatsAppWork(deps);
    if (args.includes("--loop")) await new Promise((r) => setTimeout(r, 5000));
  } while (args.includes("--loop"));
}

async function template(
  email?: string,
  purpose?: string,
  name?: string,
  language?: string,
  fields?: string,
) {
  const business = await businessFor(email);
  const connection = await liveConnection(business.id);
  if (!connection) fail("Connect first.");
  const purposes = [
    "booking_confirmation",
    "cancellation_confirmation",
    "appointment_reminder",
  ] as const;
  if (!purposes.includes(purpose as (typeof purposes)[number])) {
    fail(`Purpose is one of: ${purposes.join(", ")}.`);
  }
  if (!name || !language)
    fail(
      "Give the template's name and language, e.g. appointment_reminder en_GB.",
    );
  const parameters = fields ? fields.split(",").map((f) => f.trim()) : [];
  const unknown = parameters.filter(
    (p) => !(templateFields as readonly string[]).includes(p),
  );
  if (unknown.length)
    fail(
      `Unknown fields: ${unknown.join(", ")}. Use: ${templateFields.join(", ")}.`,
    );
  const { error } = await db.from("whatsapp_templates").upsert(
    {
      business_id: business.id,
      connection_id: connection.id,
      purpose: purpose as (typeof purposes)[number],
      name,
      language,
      parameters,
      provider_status: "UNKNOWN",
    },
    { onConflict: "connection_id,purpose" },
  );
  if (error) fail(error.message);
  console.log(
    "  Saved. Run templates-sync to check it's approved; only approved templates are sent.",
  );
}

async function templatesSync(email?: string) {
  const business = await businessFor(email);
  const connection = await liveConnection(business.id);
  if (!connection?.waba_id) fail("Connect first, with WHATSAPP_WABA_ID set.");
  if (!env.accessToken) fail("Set WHATSAPP_ACCESS_TOKEN.");
  const result = await new WhatsAppCloudTransport({
    accessToken: env.accessToken,
    phoneNumberId: connection.phone_number_id,
  }).templates(connection.waba_id);
  if (!result.ok) fail(`WhatsApp refused (${result.category}).`);
  const { data: configured } = await db
    .from("whatsapp_templates")
    .select("id, name, language")
    .eq("connection_id", connection.id);
  for (const t of configured ?? []) {
    const found = result.templates.find(
      (p) => p.name === t.name && p.language === t.language,
    );
    await db
      .from("whatsapp_templates")
      .update({
        provider_status: found?.status ?? "NOT_FOUND",
        status_checked_at: new Date().toISOString(),
        last_error_code: null,
      })
      .eq("id", t.id);
    console.log(`  ${t.name} (${t.language}): ${found?.status ?? "not found"}`);
  }
}

async function simulate(email?: string, text?: string) {
  const business = await businessFor(email);
  const connection = await liveConnection(business.id);
  if (!connection) fail("Connect first.");
  if (!text)
    fail(
      'What should the message say? pnpm whatsapp simulate <email> "When\'s my next lesson?"',
    );
  if (!env.appSecret)
    fail("Set META_APP_SECRET: the webhook only accepts signed requests.");
  const from = parsePhone(flag("--from") ?? "+447700900123");
  if (!from) fail("--from isn't a phone number.");
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: connection.waba_id ?? "0",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: internationalDigits(
                  connection.display_phone_number ?? "+440000000000",
                ),
                phone_number_id: connection.phone_number_id,
              },
              contacts: [
                { profile: { name: "Test" }, wa_id: internationalDigits(from) },
              ],
              messages: [
                {
                  from: internationalDigits(from),
                  id: `wamid.local-${randomUUID()}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const body = JSON.stringify(payload);
  const target = `${flag("--url") ?? "http://localhost:3000"}/api/webhooks/whatsapp`;
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signBody(body, env.appSecret),
    },
    body,
  });
  console.log(`  ${target} answered ${response.status}.`);
}

/** Names the owner's own number: its messages become owner commands. */
async function owner(email?: string, number?: string) {
  const business = await businessFor(email);
  const phone = number ? parsePhone(number) : null;
  if (!phone) fail("Give the owner's WhatsApp number, e.g. +447700900001.");
  const { data: customer } = await db
    .from("contacts")
    .select("id, customer_contacts ( customer_id )")
    .eq("business_id", business.id)
    .eq("phone_e164", phone)
    .maybeSingle();
  const { error } = await db
    .from("owner_channel_identities")
    .upsert(
      { business_id: business.id, channel: "whatsapp", address_e164: phone },
      { onConflict: "business_id,channel" },
    );
  if (error) fail(error.message);
  console.log(
    `  Owner number set. Messages from it are now owner commands${
      customer?.customer_contacts?.length
        ? " (it's also a customer's number; the owner comes first)"
        : ""
    }.`,
  );
}

async function ownerClear(email?: string) {
  const business = await businessFor(email);
  const { error } = await db
    .from("owner_channel_identities")
    .delete()
    .eq("business_id", business.id)
    .eq("channel", "whatsapp");
  if (error) fail(error.message);
  console.log(
    "  Owner number removed. Its messages are treated like anyone else's.",
  );
}

// Inbound events that failed every retry (the database was down for a
// while, say) keep their payload. Requeued, the worker takes them again,
// oldest first; a message already stored is never stored twice.
async function retryFailed(email?: string) {
  const business = await businessFor(email);
  const { data, error } = await db
    .from("whatsapp_events")
    .update({
      status: "pending",
      attempts: 0,
      next_attempt_at: null,
      claimed_at: null,
      error_category: null,
    })
    .eq("business_id", business.id)
    .eq("status", "failed")
    .select("id");
  if (error) fail(error.message);
  console.log(
    `  ${data?.length ?? 0} failed event${data?.length === 1 ? "" : "s"} requeued. Run \`pnpm whatsapp work\` or wait for the scheduled worker.`,
  );
}

const commands: Record<string, (...a: string[]) => Promise<void>> = {
  connect,
  disconnect,
  status,
  work,
  template,
  "templates-sync": templatesSync,
  simulate,
  owner,
  "owner-clear": ownerClear,
  "retry-failed": retryFailed,
};

const run = command ? commands[command] : undefined;
if (!run) {
  fail(
    `Commands: ${Object.keys(commands).join(", ")}. See the top of scripts/whatsapp.ts.`,
  );
}
run(...rest).catch((error) =>
  fail(error instanceof Error ? error.message : String(error)),
);
