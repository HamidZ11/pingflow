import "server-only";
import { after } from "next/server";
import type { WhatsAppDeps } from "@/features/whatsapp/deps";
import { createWhatsAppDeps } from "@/features/whatsapp/factory";
import { runWhatsAppWork, sendQueued } from "@/features/whatsapp/worker";
import { serverPipeline } from "@/features/messages/process";
import { logServerError } from "@/lib/errors";
import { whatsAppEnv } from "@/lib/whatsapp/config";

// The WhatsApp channel as the server runs it: the server's database client,
// credentials from the environment (the developer connection), the real
// Cloud API transport and the message pipeline.
export function whatsAppServerDeps(): WhatsAppDeps {
  const pipeline = serverPipeline();
  return createWhatsAppDeps({
    db: pipeline.db,
    interpreter: pipeline.interpreter,
    ownerInterpreter: pipeline.ownerInterpreter,
    env: whatsAppEnv(),
    log: pipeline.log,
  });
}

/**
 * Processes stored events and queued messages once this response has been
 * sent. The durable queues are the guarantee; this is the fast path, and
 * the scheduled worker catches anything it doesn't finish.
 */
export function workAfterResponse() {
  after(async () => {
    try {
      await runWhatsAppWork(whatsAppServerDeps());
    } catch (error) {
      logServerError("whatsappWork", error);
    }
  });
}

/** Sends what an owner's action just queued, once the response has gone. */
export function sendAfterResponse() {
  after(async () => {
    try {
      await sendQueued(whatsAppServerDeps());
    } catch (error) {
      logServerError("whatsappSend", error);
    }
  });
}
