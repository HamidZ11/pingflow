import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PageHeader, pageClassName } from "@/components/app/page-header";
import { devToolsEnabled } from "@/features/messages/dev/enabled";
import { RunWorkerButton } from "@/features/whatsapp/run-worker-button";
import { requireOwner } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";
import { GRAPH_API_VERSION, whatsAppEnv } from "@/lib/whatsapp/config";

export const metadata: Metadata = { title: "WhatsApp diagnostics" };

// Development only, not in the navigation: the channel's internals for the
// signed-in owner's business. IDs, never tokens or secrets.
export default async function WhatsAppDiagnosticsPage() {
  if (!devToolsEnabled()) notFound();
  const owner = await requireOwner();
  const db = createServiceClient();
  const businessId = owner.business.id;
  const [connections, events, deliveries, templates] = await Promise.all([
    db
      .from("whatsapp_connections")
      .select(
        "id, mode, status, phone_number_id, waba_id, display_phone_number, last_webhook_at, last_inbound_at, last_outbound_at, last_error_category",
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false }),
    db
      .from("whatsapp_events")
      .select(
        "event_key, kind, status, occurred_at, attempts, error_category, message_id",
      )
      .or(`business_id.eq.${businessId},business_id.is.null`)
      .order("received_at", { ascending: false })
      .limit(15),
    db
      .from("message_deliveries")
      .select(
        "message_id, dispatch, attempts, provider_message_id, sent_via, error_category, error_code, accepted_at, delivered_at, read_at",
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(15),
    db
      .from("whatsapp_templates")
      .select("purpose, name, language, parameters, provider_status")
      .eq("business_id", businessId),
  ]);
  const env = whatsAppEnv();
  const host = (await headers()).get("host") ?? "localhost:3000";
  const configured = (value: string | null) => (value ? "set" : "missing");

  const block = (title: string, rows: unknown) => (
    <section className="mt-6">
      <h2 className="text-ui font-medium text-ink">{title}</h2>
      <pre className="mt-2 overflow-x-auto rounded-md bg-sunken p-3 text-ui-sm text-ink">
        {JSON.stringify(rows, null, 2)}
      </pre>
    </section>
  );

  return (
    <div className={pageClassName("narrow")}>
      <PageHeader
        title="WhatsApp diagnostics"
        description="Development only. The channel's internals for this business."
        actions={<RunWorkerButton />}
      />
      {block("Environment", {
        graphApiVersion: GRAPH_API_VERSION,
        webhookUrl: `https://<your tunnel>/api/webhooks/whatsapp (this app: ${host})`,
        WHATSAPP_VERIFY_TOKEN: configured(env.verifyToken),
        META_APP_SECRET: configured(env.appSecret),
        WHATSAPP_ACCESS_TOKEN: configured(env.accessToken),
        WHATSAPP_PHONE_NUMBER_ID: env.phoneNumberId ?? "missing",
        WHATSAPP_WABA_ID: env.wabaId ?? "missing",
        WHATSAPP_WORKER_SECRET: configured(env.workerSecret),
      })}
      {block("Connections", connections.data)}
      {block(
        "Recent webhook events (this business, and unroutable)",
        events.data,
      )}
      {block("Recent outbound deliveries", deliveries.data)}
      {block("Templates", templates.data)}
    </div>
  );
}
