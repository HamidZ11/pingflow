import "server-only";
import type { PipelineDeps } from "@/features/messages/pipeline";
import { aiSettings, createMessageInterpreter } from "@/lib/ai/config";
import { createServiceClient } from "@/lib/supabase/service";

// The message pipeline as the server runs it: the secret-key client (no one
// is signed in when a message arrives), the configured interpreter, and
// trace logs that carry IDs and outcomes only, never message text, phone
// numbers or keys.
export function serverPipeline(): PipelineDeps {
  return {
    db: createServiceClient(),
    interpreter: createMessageInterpreter(aiSettings()),
    log: (event, fields) => {
      console.info(`[pingflow] ${event} ${JSON.stringify(fields)}`);
    },
  };
}
