import { authorisedScheduledWork } from "@/features/whatsapp/webhook-handler";
import { whatsAppServerDeps } from "@/features/whatsapp/server";
import { runWhatsAppWork } from "@/features/whatsapp/worker";
import { logServerError } from "@/lib/errors";
import { whatsAppEnv } from "@/lib/whatsapp/config";

// The scheduled worker: call every minute or so with Authorization: Bearer
// <WHATSAPP_WORKER_SECRET>, or let Vercel Cron call it (it sends Bearer
// <CRON_SECRET>). It finishes anything the webhook's own after-response
// work didn't, retries temporary send failures, and sends due reminders.
// Anyone else gets a 404. Answers with counts only.

export const maxDuration = 60;

async function work(request: Request) {
  if (
    !authorisedScheduledWork(
      request.headers.get("authorization"),
      whatsAppEnv(),
    )
  ) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const summary = await runWhatsAppWork(whatsAppServerDeps());
    return Response.json(summary);
  } catch (error) {
    logServerError("whatsappScheduledWork", error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}

export const GET = work;
export const POST = work;
