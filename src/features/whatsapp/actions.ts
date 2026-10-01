"use server";

import { refresh } from "next/cache";
import { whatsAppServerDeps } from "@/features/whatsapp/server";
import { requireOwner } from "@/lib/auth/session";
import { type ActionResult, friendlyError } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase/service";
import { WhatsAppCloudTransport } from "@/lib/whatsapp/cloud-transport";

// The owner's WhatsApp controls in Settings.

/** Stops receiving and sending. Customers, bookings and history stay. */
export async function disconnectWhatsApp(): Promise<ActionResult> {
  const owner = await requireOwner();
  const { error } = await owner.supabase.rpc("disconnect_whatsapp");
  if (error) {
    return { ok: false, error: friendlyError(error, "disconnectWhatsApp") };
  }
  refresh();
  return {
    ok: true,
    message: "WhatsApp is disconnected. Nothing will be sent from Pingflow.",
  };
}

/**
 * After a problem: checks the connection's credentials with WhatsApp and,
 * if they work, marks it connected again.
 */
export async function checkWhatsAppConnection(): Promise<ActionResult> {
  const owner = await requireOwner();
  // Ownership is proven with the owner's own access first.
  const { data: mine, error } = await owner.supabase
    .from("whatsapp_connections")
    .select("id")
    .eq("business_id", owner.business.id)
    .neq("status", "disconnected")
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      error: friendlyError(error, "checkWhatsAppConnection"),
    };
  }
  if (!mine) return { ok: false, error: "WhatsApp isn’t connected." };

  // The number's IDs and the credentials are the server's.
  const db = createServiceClient();
  const { data: connection } = await db
    .from("whatsapp_connections")
    .select("id, mode, phone_number_id")
    .eq("id", mine.id)
    .single();
  const unavailable: ActionResult = {
    ok: false,
    error:
      "WhatsApp still isn’t accepting Pingflow’s connection. Reconnect it.",
  };
  if (!connection) return unavailable;
  const credentials = await whatsAppServerDeps().credentials.getCredentials({
    id: connection.id,
    mode: connection.mode,
    phoneNumberId: connection.phone_number_id,
  });
  if (!credentials) return unavailable;
  const health = await new WhatsAppCloudTransport(credentials).health();
  if (!health.ok) {
    await db
      .from("whatsapp_connections")
      .update({
        status: "needs_attention",
        last_error_category:
          health.category === "connection"
            ? "provider_refused"
            : "check_failed",
        last_error_at: new Date().toISOString(),
      })
      .eq("id", connection.id);
    refresh();
    return unavailable;
  }
  await db
    .from("whatsapp_connections")
    .update({
      status: "connected",
      last_error_category: null,
      last_error_at: null,
      ...(health.verifiedName ? { verified_name: health.verifiedName } : {}),
    })
    .eq("id", connection.id);
  refresh();
  return { ok: true, message: "WhatsApp is working again." };
}
