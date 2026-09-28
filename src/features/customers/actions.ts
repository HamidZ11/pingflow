"use server";

import { refresh } from "next/cache";
import {
  parsePhone,
  type Relationship,
  relationshipLabels,
} from "@/domain/contacts/phone";
import { firstName } from "@/domain/messages/templates";
import { requireOwner } from "@/lib/auth/session";
import { type ActionResult, friendlyError } from "@/lib/errors";

export async function addCustomer(input: {
  name: string;
  phone: string;
  relationship: Relationship;
  contactName: string;
}): Promise<ActionResult & { customerId?: string }> {
  const owner = await requireOwner();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Add the customer’s name." };
  if (!(input.relationship in relationshipLabels)) {
    return { ok: false, error: "Choose who messages you." };
  }
  let phone: string | null = null;
  if (input.phone.trim()) {
    phone = parsePhone(input.phone);
    if (!phone)
      return { ok: false, error: "That WhatsApp number doesn’t look right." };
  }

  const { data, error } = await owner.supabase.rpc("create_customer", {
    p_full_name: name,
    p_phone_e164: phone ?? undefined,
    p_relationship: input.relationship,
    p_contact_name: input.contactName.trim() || undefined,
  });
  if (error || !data)
    return { ok: false, error: friendlyError(error, "addCustomer") };
  refresh();
  return { ok: true, message: `${firstName(name)} added.`, customerId: data };
}

export async function resumeConversation(
  conversationId: string,
  customerName: string,
): Promise<ActionResult> {
  const owner = await requireOwner();
  const { error } = await owner.supabase.rpc("resume_conversation", {
    p_conversation_id: conversationId,
  });
  if (error)
    return { ok: false, error: friendlyError(error, "resumeConversation") };
  refresh();
  return {
    ok: true,
    message: `Pingflow will handle ${firstName(customerName)}’s messages again.`,
  };
}
