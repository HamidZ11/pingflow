// The live end-to-end check: five messages through the real pipeline with
// the real OpenAI interpreter, into a fresh local demo business, then
// checks what landed in the database.
//
//   pnpm ai:smoke
//
// It costs money (five calls, ten requests at most), so it only runs when
// asked and needs OPENAI_API_KEY. It only runs against the local Supabase.
// It recreates the business for ai-smoke@pingflow.test each time.

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { processInboundMessage } from "@/features/messages/pipeline";
import { aiSettings } from "@/lib/ai/config";
import { OpenAIMessageInterpreter } from "@/lib/ai/openai-interpreter";
import type { Database } from "@/lib/supabase/database.types";

const EMAIL = "ai-smoke@pingflow.test";
const SARAH = "+447700900123";
const OMAR = "+447700900456";

type Check = { name: string; ok: boolean; detail?: string };

async function main() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error("OPENAI_API_KEY configured: no. Nothing was sent.");
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
    console.error("The smoke test only runs against the local Supabase.");
    process.exit(1);
  }
  const settings = aiSettings({
    ...process.env,
    PINGFLOW_MESSAGE_INTERPRETER: "",
  });
  const maxRequests = 5 * (1 + settings.maxRetries);
  const endpoint = new URL(
    process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  ).host;
  console.log(`
  Live smoke test. Real API usage: this costs money.
    Endpoint   ${endpoint}${endpoint === "api.openai.com" ? "" : "   NOT OpenAI"}
    Model      ${settings.model}
    Messages   5, at most ${maxRequests} API requests
    Business   a fresh demo for ${EMAIL}
`);

  execSync(`pnpm -s db:seed ${EMAIL}`, { stdio: "ignore" });
  const db = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  const ownerId = users.users.find((u) => u.email === EMAIL)!.id;
  const { data: business } = await db
    .from("businesses")
    .select("id, timezone")
    .eq("owner_id", ownerId)
    .single();
  const businessId = business!.id;
  const tz = business!.timezone;

  const bookingsNow = async () => {
    const { data } = await db
      .from("bookings")
      .select("id, starts_at, status")
      .eq("business_id", businessId)
      .order("id");
    return JSON.stringify(data);
  };
  const bookingsBefore = await bookingsNow();

  // Sarah's next lesson: the demo puts it on the next weekday.
  const { data: sarahNext } = await db
    .from("bookings")
    .select("starts_at, customer:customers!inner ( full_name )")
    .eq("business_id", businessId)
    .eq("customer.full_name", "Sarah Khan")
    .eq("status", "confirmed")
    .gt("starts_at", new Date().toISOString())
    .order("starts_at")
    .limit(1)
    .single();
  const dayOf = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long" }).format(
      new Date(iso),
    );
  const tomorrow = dayOf(new Date(Date.now() + 86_400_000).toISOString());
  const lessonDay = dayOf(sarahNext!.starts_at);
  const isTomorrow = lessonDay === tomorrow;
  if (!isTomorrow) {
    console.log(
      `  Sarah's next lesson is ${lessonDay}, not tomorrow: the messages name the day instead.\n`,
    );
  }
  const lessonRef = isTomorrow ? "tomorrow's lesson" : `my ${lessonDay} lesson`;
  const cancelDay = isTomorrow ? "tomorrow" : lessonDay;

  let requests = 0;
  const countingFetch: typeof fetch = async (input, init) => {
    if (++requests > maxRequests) throw new Error("Request cap reached.");
    return fetch(input, init);
  };
  const interpreter = new OpenAIMessageInterpreter({
    apiKey: key,
    model: settings.model,
    reasoningEffort: settings.reasoningEffort,
    timeoutMs: settings.timeoutMs,
    maxRetries: settings.maxRetries,
    maxOutputTokens: settings.maxOutputTokens,
    fetch: countingFetch,
  });

  const steps = [
    { flow: "Next booking", from: SARAH, text: "When's my next lesson?" },
    { flow: "Availability", from: SARAH, text: "Anything after 4 Friday?" },
    {
      flow: "Reschedule",
      from: SARAH,
      text: `Can we move ${lessonRef} to Friday after 4?`,
    },
    // Omar's own conversation, so the question doesn't colour the next one.
    { flow: "Ambiguous", from: OMAR, text: "Can we do later?" },
    {
      flow: "Cancellation",
      from: SARAH,
      text: `Need to cancel ${cancelDay} sorry`,
    },
  ];

  const checks: Check[] = [];
  const check = (name: string, ok: boolean, detail?: string) =>
    checks.push({ name, ok, detail });
  const rows: string[] = [];

  for (const [index, step] of steps.entries()) {
    const before = requests;
    const t0 = performance.now();
    const report = await processInboundMessage(
      { db, interpreter },
      {
        businessId,
        from: step.from,
        body: step.text,
        externalId: `ai-smoke-${Date.now()}-${index}`,
        source: "simulator",
      },
    );
    const ms = Math.round(performance.now() - t0);
    const i = report.interpretation;
    const d = report.decision;
    const { data: actions } = await db
      .from("pending_actions")
      .select("kind, status, proposed_starts_at, booking_id")
      .eq("source_message_id", report.messageId)
      .eq("status", "open");
    const { data: replies } = await db
      .from("messages")
      .select("body, delivery")
      .eq("processing_run_id", report.runId);
    const { data: usage } = await db
      .from("usage_events")
      .select(
        "model, input_tokens, cached_input_tokens, output_tokens, estimated_cost_micros, currency, external_reference, metadata, category, provider, operation, business_id",
      )
      .eq("business_id", businessId)
      .contains("metadata", { run_id: report.runId });

    const f = step.flow;
    check(
      `${f}: read without failure`,
      report.status === "completed",
      report.failure,
    );
    const reply = d?.reply?.body ?? null;
    const times = reply?.match(/\d\d:\d\d/g) ?? [];
    switch (f) {
      case "Next booking":
        check(`${f}: intent`, i?.intent === "next_booking_query", i?.intent);
        check(`${f}: automatic reply`, d?.outcome === "auto_reply", d?.outcome);
        check(
          `${f}: reply from the real booking`,
          /^Your next driving lesson is .+ at 16:00\.$/.test(reply ?? ""),
          reply ?? "",
        );
        check(`${f}: nothing in Attention`, (actions ?? []).length === 0);
        break;
      case "Availability":
        check(`${f}: intent`, i?.intent === "availability_query", i?.intent);
        check(`${f}: automatic reply`, d?.outcome === "auto_reply", d?.outcome);
        check(
          `${f}: at most 3 times, all after 16:00`,
          times.length <= 3 && times.every((t) => t >= "16:00"),
          reply ?? "",
        );
        break;
      case "Reschedule": {
        check(`${f}: intent`, i?.intent === "reschedule_request", i?.intent);
        check(
          `${f}: after 16:00`,
          i?.requested_time?.constraint === "after" &&
            i.requested_time.time === "16:00",
          JSON.stringify(i?.requested_time),
        );
        const request = actions?.find((a) => a.kind === "reschedule_request");
        check(`${f}: approval in Attention`, Boolean(request));
        const proposal = request?.proposed_starts_at;
        const proposalTime = proposal
          ? new Intl.DateTimeFormat("en-GB", {
              timeZone: tz,
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(proposal))
          : null;
        check(
          `${f}: real proposal, Friday after 16:00`,
          Boolean(proposal) &&
            dayOf(proposal!) === "Friday" &&
            proposalTime! >= "16:00",
          proposal ? `${dayOf(proposal)} ${proposalTime}` : "none",
        );
        break;
      }
      case "Ambiguous":
        check(
          `${f}: asks one question`,
          d?.outcome === "request_clarification",
          d?.outcome,
        );
        check(
          `${f}: one simulated reply`,
          (replies ?? []).length === 1 && replies![0].delivery === "simulated",
          reply ?? "",
        );
        break;
      case "Cancellation":
        check(`${f}: intent`, i?.intent === "cancellation_request", i?.intent);
        check(
          `${f}: approval in Attention`,
          Boolean(actions?.find((a) => a.kind === "cancellation_request")),
        );
        break;
    }
    check(
      `${f}: booking data unchanged`,
      (await bookingsNow()) === bookingsBefore,
    );

    // The ledger: one row per billed call, at the listed price.
    const u = usage ?? [];
    check(`${f}: one usage row`, u.length === 1, `${u.length}`);
    const row = u[0];
    if (row) {
      check(
        `${f}: usage row complete`,
        row.category === "ai" &&
          row.provider === "openai" &&
          row.operation === "interpret_message" &&
          row.business_id === businessId &&
          (row.model ?? "").startsWith(settings.model) &&
          row.input_tokens! > 0 &&
          row.output_tokens! > 0 &&
          row.cached_input_tokens !== null &&
          Boolean(row.external_reference) &&
          (row.metadata as Record<string, unknown>).prompt_version ===
            report.promptVersion &&
          row.estimated_cost_micros !== null &&
          row.estimated_cost_micros > 0 &&
          row.currency === "USD",
        JSON.stringify({ model: row.model, cost: row.estimated_cost_micros }),
      );
    }
    rows.push(
      `  ${f.padEnd(13)} ${String(i?.intent ?? report.failure).padEnd(21)} ${String(d?.outcome).padEnd(22)} ${String(ms).padStart(5)} ms  ${requests - before} req  ${row ? `${row.input_tokens} in (${row.cached_input_tokens} cached), ${row.output_tokens} out, ${row.estimated_cost_micros} µ$` : "no usage"}${reply ? `\n  ${"".padEnd(13)} reply: ${reply}` : ""}`,
    );
  }

  console.log(rows.join("\n"));
  console.log("");
  for (const c of checks) {
    console.log(
      `  ${c.ok ? "pass" : "FAIL"}  ${c.name}${!c.ok && c.detail ? `  (${c.detail})` : ""}`,
    );
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(
    `\n  ${checks.length - failed}/${checks.length} checks passed, ${requests} API requests.\n`,
  );
  if (failed) process.exit(2);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
