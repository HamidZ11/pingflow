import { createServiceClient } from "@/lib/supabase/service";

// GET /api/health           the app is up.
// GET /api/health?ready=1   and the database answers, within 3 seconds.
//
// For uptime checks and deploys. It says "ok" or "unavailable" and nothing
// else: no data, IDs, versions or configuration, and it never calls OpenAI
// or Meta.

export const dynamic = "force-dynamic";

const json = (body: Record<string, string>, status = 200) =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });

async function databaseAnswers(): Promise<boolean> {
  try {
    const query = createServiceClient()
      .from("businesses")
      .select("id", { head: true })
      .limit(1);
    const timeout = new Promise<{ error: true }>((resolve) =>
      setTimeout(() => resolve({ error: true }), 3000),
    );
    const { error } = await Promise.race([query, timeout]);
    return !error;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!new URL(request.url).searchParams.has("ready")) {
    return json({ status: "ok" });
  }
  return (await databaseAnswers())
    ? json({ status: "ok", database: "ok" })
    : json({ status: "unavailable", database: "unavailable" }, 503);
}
