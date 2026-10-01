import { describe, expect, it } from "vitest";
import { checkEnvironment } from "@/lib/env";

const supabase = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  SUPABASE_SECRET_KEY: "sb_secret_example",
};
const prod = { production: true };

describe("the environment check", () => {
  it("needs Supabase, and names what's missing without values", () => {
    const { errors } = checkEnvironment({}, prod);
    expect(errors).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL is not set.",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set.",
      "SUPABASE_SECRET_KEY is not set.",
    ]);
    expect(checkEnvironment(supabase, prod).errors).toEqual([]);
  });

  it("refuses a secret behind a public name, and never repeats a value", () => {
    const { errors } = checkEnvironment(
      { ...supabase, NEXT_PUBLIC_OPENAI_API_KEY: "sk-should-not-appear" },
      prod,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^NEXT_PUBLIC_OPENAI_API_KEY looks secret/);
    expect(errors.join(" ")).not.toContain("sk-should-not-appear");
  });

  it("catches the publishable key pasted as the secret key", () => {
    const { errors } = checkEnvironment(
      {
        ...supabase,
        SUPABASE_SECRET_KEY: supabase.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      },
      prod,
    );
    expect(errors[0]).toMatch(/^SUPABASE_SECRET_KEY is the same as/);
  });

  it("keeps OpenAI and WhatsApp optional", () => {
    const { errors, warnings } = checkEnvironment(supabase, prod);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([
      "OPENAI_API_KEY is not set: messages are stored and go to the owner unread.",
    ]);
  });

  it("once WhatsApp is set up at all, asks for the parts that work together", () => {
    const { warnings } = checkEnvironment(
      { ...supabase, OPENAI_API_KEY: "x", META_APP_SECRET: "x" },
      prod,
    );
    expect(warnings).toEqual([
      "WHATSAPP_VERIFY_TOKEN not set: Meta can't verify or deliver to the webhook.",
      "WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID not set: the developer connection can't send.",
      "Neither WHATSAPP_WORKER_SECRET nor CRON_SECRET is set: the scheduled worker can't run, so reminders and retries won't go out.",
    ]);
    const complete = checkEnvironment(
      {
        ...supabase,
        OPENAI_API_KEY: "x",
        WHATSAPP_VERIFY_TOKEN: "x",
        META_APP_SECRET: "x",
        WHATSAPP_ACCESS_TOKEN: "x",
        WHATSAPP_PHONE_NUMBER_ID: "x",
        CRON_SECRET: "x",
      },
      prod,
    );
    expect(complete).toEqual({ errors: [], warnings: [] });
  });

  it("flags development switches and a local database in production only", () => {
    const local = {
      ...supabase,
      OPENAI_API_KEY: "x",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      PINGFLOW_MESSAGE_INTERPRETER: "fixture",
      LOCAL_MAIL_INBOX_URL: "http://127.0.0.1:54324",
    };
    expect(checkEnvironment(local, { production: false }).warnings).toEqual([]);
    expect(checkEnvironment(local, prod).warnings).toHaveLength(3);
  });
});
