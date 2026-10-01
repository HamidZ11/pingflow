"use server";

import { refresh } from "next/cache";
import { devToolsEnabled } from "@/features/messages/dev/enabled";
import { whatsAppServerDeps } from "@/features/whatsapp/server";
import { runWhatsAppWork } from "@/features/whatsapp/worker";
import { requireOwner } from "@/lib/auth/session";
import { logServerError } from "@/lib/errors";

// Development only: run the WhatsApp worker now instead of waiting.
export async function runWorkerNow(): Promise<{
  ok: boolean;
  summary?: string;
}> {
  if (!devToolsEnabled()) return { ok: false };
  await requireOwner();
  try {
    const summary = await runWhatsAppWork(whatsAppServerDeps());
    refresh();
    return { ok: true, summary: JSON.stringify(summary) };
  } catch (error) {
    logServerError("runWorkerNow", error);
    return { ok: false };
  }
}
