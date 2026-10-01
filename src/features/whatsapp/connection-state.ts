import "server-only";
import type { InboundSource } from "@/domain/channel/delivery";
import type { Owner } from "@/lib/auth/session";

/**
 * Whether messages can go out on WhatsApp right now: the business has a
 * connection that is connected, or connected but needing attention.
 */
export async function whatsappConnected(owner: Owner): Promise<boolean> {
  const { data, error } = await owner.supabase
    .from("whatsapp_connections")
    .select("status")
    .eq("business_id", owner.business.id)
    .in("status", ["connected", "needs_attention"])
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** Where each of these conversations' messages came from, and when. */
export async function loadInboundSources(
  owner: Owner,
  conversationIds: string[],
): Promise<InboundSource[]> {
  if (conversationIds.length === 0) return [];
  const { data, error } = await owner.supabase
    .from("messages")
    .select("conversation_id, source, sent_at")
    .eq("business_id", owner.business.id)
    .eq("direction", "inbound")
    .in("conversation_id", conversationIds)
    .order("sent_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data.map((m) => ({
    conversationId: m.conversation_id,
    source: m.source,
    sentAt: m.sent_at,
  }));
}
