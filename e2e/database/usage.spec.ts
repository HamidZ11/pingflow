import { expect, test } from "@playwright/test";
import { aiUsage, messagingUsage } from "../../src/domain/usage/usage-event";
import { writeUsage } from "../../src/lib/usage/ledger";
import { adminClient, demoOwner, hasKeys } from "./db";

// The usage ledger is internal: the server records to it; owners can't see
// or change it.

test.describe.configure({ mode: "serial" });
test.skip(!hasKeys, "Needs the Supabase keys in .env.local");

const email = "db-usage@pingflow.test";

test("records model calls and messages, each provider event once", async () => {
  const { businessId } = await demoOwner(email);
  const admin = adminClient();
  const requestId = `req_${crypto.randomUUID()}`;
  const call = aiUsage({
    businessId,
    provider: "openai",
    operation: "interpret_message",
    model: "test-model",
    inputTokens: 900,
    outputTokens: 60,
    estimatedCostMicros: 420,
    currency: "USD",
    requestId,
  });
  expect(await writeUsage(admin, call)).toEqual({ recorded: true });
  // The same provider event reported again (webhooks retry) counts once.
  expect(await writeUsage(admin, call)).toEqual({ recorded: false });

  const messageId = `wamid.${crypto.randomUUID()}`;
  const message = messagingUsage({
    businessId,
    channel: "whatsapp",
    provider: "meta",
    operation: "send_template",
    messageCategory: "utility",
    destinationCountry: "GB",
    billable: true,
    providerMessageId: messageId,
  });
  expect(await writeUsage(admin, message)).toEqual({ recorded: true });

  // Events without a provider reference are never merged.
  const unreferenced = messagingUsage({
    businessId,
    channel: "email",
    provider: "local",
    operation: "sign_in_link",
  });
  await writeUsage(admin, unreferenced);
  await writeUsage(admin, unreferenced);

  const { data } = await admin
    .from("usage_events")
    .select("category, external_reference, input_tokens, billable")
    .eq("business_id", businessId);
  expect(data!.filter((r) => r.external_reference === requestId)).toHaveLength(
    1,
  );
  expect(data!.filter((r) => r.external_reference === messageId)).toHaveLength(
    1,
  );
  expect(data!.filter((r) => r.category === "email")).toHaveLength(2);
});

test("belongs to a real business", async () => {
  const admin = adminClient();
  await expect(
    writeUsage(
      admin,
      messagingUsage({
        businessId: crypto.randomUUID(),
        channel: "whatsapp",
        provider: "meta",
        operation: "send_template",
      }),
    ),
  ).rejects.toThrow(/Couldn't record usage/);
});

test("owners can't read or write it", async () => {
  const { client, businessId } = await demoOwner(email);
  const read = await client.from("usage_events").select("*").limit(1);
  expect(read.error?.code).toBe("42501");
  const write = await client.from("usage_events").insert({
    business_id: businessId,
    category: "other",
    provider: "fake",
    operation: "fake",
  });
  expect(write.error?.code).toBe("42501");
});

test("refuses malformed events before they reach the database", async () => {
  const { businessId } = await demoOwner(email);
  await expect(
    writeUsage(
      adminClient(),
      aiUsage({
        businessId,
        provider: "openai",
        operation: "interpret_message",
        model: "m",
        inputTokens: -5,
        outputTokens: 1,
      }),
    ),
  ).rejects.toThrow(/Invalid usage event/);
});
