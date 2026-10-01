import type { NextRequest } from "next/server";
import { ingestWebhook } from "@/features/whatsapp/ingest";
import { workAfterResponse } from "@/features/whatsapp/server";
import {
  handleNotification,
  handleVerification,
} from "@/features/whatsapp/webhook-handler";
import { createServiceClient } from "@/lib/supabase/service";
import { whatsAppEnv } from "@/lib/whatsapp/config";

// WhatsApp Cloud API webhook. Meta calls it; nothing else should.
//   GET   the subscription handshake (hub.mode, hub.verify_token, hub.challenge)
//   POST  message and status notifications, signed with the app secret

// Room for the work that runs after the response.
export const maxDuration = 60;

export function GET(request: NextRequest) {
  return handleVerification(request.nextUrl, whatsAppEnv());
}

export function POST(request: Request) {
  return handleNotification(request, {
    env: whatsAppEnv(),
    ingest: (input) =>
      ingestWebhook(
        {
          db: createServiceClient(),
          log: (event, fields) =>
            console.info(`[pingflow] ${event} ${JSON.stringify(fields)}`),
        },
        input,
      ),
    afterResponse: workAfterResponse,
  });
}
