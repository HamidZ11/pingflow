import "server-only";
import { formatPhone } from "@/domain/contacts/phone";
import { formatRelativeDateTime } from "@/domain/time/format";
import type { Owner } from "@/lib/auth/session";

// What Settings shows about WhatsApp: one state, the number, and when a
// message last arrived. Meta's IDs and the credentials stay on the server.

export type WhatsAppSettings =
  | { state: "not_connected" }
  | { state: "connecting" }
  | {
      state: "connected" | "needs_attention";
      number: string | null;
      name: string | null;
      developer: boolean;
      lastMessage: string | null;
    };

export async function loadWhatsAppSettings(
  owner: Owner,
  now = new Date(),
): Promise<WhatsAppSettings> {
  const { data, error } = await owner.supabase
    .from("whatsapp_connections")
    .select(
      "status, mode, display_phone_number, verified_name, last_inbound_at",
    )
    .eq("business_id", owner.business.id)
    .neq("status", "disconnected")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { state: "not_connected" };
  if (data.status === "connecting") return { state: "connecting" };
  return {
    state: data.status === "connected" ? "connected" : "needs_attention",
    number: data.display_phone_number
      ? formatPhone(data.display_phone_number)
      : null,
    name: data.verified_name,
    developer: data.mode === "developer",
    lastMessage: data.last_inbound_at
      ? formatRelativeDateTime(
          new Date(data.last_inbound_at),
          now,
          owner.business.timeZone,
        )
      : null,
  };
}
