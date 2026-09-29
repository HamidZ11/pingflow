import type { SupabaseClient } from "@supabase/supabase-js";
import type { WhatsAppDeps } from "@/features/whatsapp/deps";
import type { MessageInterpreter } from "@/lib/ai/interpreter";
import type { Database } from "@/lib/supabase/database.types";
import { WhatsAppCloudTransport } from "@/lib/whatsapp/cloud-transport";
import type { WhatsAppEnv } from "@/lib/whatsapp/config";
import { EnvironmentWhatsAppCredentialProvider } from "@/lib/whatsapp/credentials";

// The real channel, assembled: shared by the server (server.ts) and the
// `pnpm whatsapp` command.
export function createWhatsAppDeps(input: {
  db: SupabaseClient<Database>;
  interpreter: MessageInterpreter;
  env: WhatsAppEnv;
  log?: WhatsAppDeps["log"];
}): WhatsAppDeps {
  return {
    db: input.db,
    credentials: new EnvironmentWhatsAppCredentialProvider(input.env),
    transportFor: (credentials) =>
      new WhatsAppCloudTransport({
        accessToken: credentials.accessToken,
        phoneNumberId: credentials.phoneNumberId,
      }),
    pipeline: {
      db: input.db,
      interpreter: input.interpreter,
      log: input.log,
    },
    log: input.log,
  };
}
