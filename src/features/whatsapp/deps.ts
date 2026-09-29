import type { SupabaseClient } from "@supabase/supabase-js";
import type { PipelineDeps } from "@/features/messages/pipeline";
import type { MessagingTransport } from "@/lib/messaging/transport";
import type {
  WhatsAppCredentialProvider,
  WhatsAppCredentials,
} from "@/lib/whatsapp/credentials";
import type { Database } from "@/lib/supabase/database.types";

// What the WhatsApp channel needs, passed in: the server's database client,
// where credentials come from, how to build a transport, and the message
// pipeline. The server wires the real ones (server.ts); tests use fakes.

export type WhatsAppDeps = {
  db: SupabaseClient<Database>;
  credentials: WhatsAppCredentialProvider;
  transportFor: (credentials: WhatsAppCredentials) => MessagingTransport;
  pipeline: PipelineDeps;
  /** IDs and outcomes only: never message text, numbers or secrets. */
  log?: (event: string, fields: Record<string, unknown>) => void;
  now?: () => Date;
};

export class WhatsAppError extends Error {}
