// What the server needs to run, checked once at startup (see
// src/instrumentation.ts). Problems name the variable, never its value.
//
//   always       Supabase: the public URL and key, and the secret key the
//                server uses for inbound messages and the usage ledger.
//   optional     OpenAI: without a key, messages still arrive and go to the
//                owner unread.
//   optional     WhatsApp: none of it is needed until a business connects,
//                but once any of it is set, the parts that only work
//                together must all be there.
//   never        Development switches in production, and anything secret
//                behind a NEXT_PUBLIC_ name (those go to every browser).

type Env = Record<string, string | undefined>;

export type EnvironmentCheck = {
  /** Can't run without these: the server refuses to start in production. */
  errors: string[];
  /** Runs, but with something switched off or set up wrongly. */
  warnings: string[];
};

const set = (env: Env, name: string) => Boolean(env[name]?.trim());

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
];

const WHATSAPP = [
  "WHATSAPP_VERIFY_TOKEN",
  "META_APP_SECRET",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_WABA_ID",
  "WHATSAPP_WORKER_SECRET",
];

/** Secret-looking names that would be shipped to the browser. */
const PUBLIC_SECRET =
  /^NEXT_PUBLIC_.*(SECRET|TOKEN|SERVICE_ROLE|OPENAI|PASSWORD|PRIVATE)/;

export function checkEnvironment(
  env: Env,
  { production }: { production: boolean },
): EnvironmentCheck {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const name of REQUIRED) {
    if (!set(env, name)) errors.push(`${name} is not set.`);
  }
  if (
    set(env, "SUPABASE_SECRET_KEY") &&
    env.SUPABASE_SECRET_KEY?.trim() ===
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  ) {
    errors.push(
      "SUPABASE_SECRET_KEY is the same as NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Use the project's secret key.",
    );
  }
  for (const name of Object.keys(env).filter((n) => PUBLIC_SECRET.test(n))) {
    errors.push(
      `${name} looks secret but is public: anything named NEXT_PUBLIC_ is sent to every browser. Rename it without the prefix.`,
    );
  }

  if (!set(env, "OPENAI_API_KEY")) {
    warnings.push(
      "OPENAI_API_KEY is not set: messages are stored and go to the owner unread.",
    );
  }

  // WhatsApp: all or nothing, by job.
  if (WHATSAPP.some((name) => set(env, name))) {
    const need = (names: string[], job: string) => {
      const missing = names.filter((name) => !set(env, name));
      if (missing.length) {
        warnings.push(`${missing.join(" and ")} not set: ${job}.`);
      }
    };
    need(
      ["WHATSAPP_VERIFY_TOKEN", "META_APP_SECRET"],
      "Meta can't verify or deliver to the webhook",
    );
    need(
      ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
      "the developer connection can't send",
    );
    if (!set(env, "WHATSAPP_WORKER_SECRET") && !set(env, "CRON_SECRET")) {
      warnings.push(
        "Neither WHATSAPP_WORKER_SECRET nor CRON_SECRET is set: the scheduled worker can't run, so reminders and retries won't go out.",
      );
    }
  }

  if (production) {
    if (env.PINGFLOW_MESSAGE_INTERPRETER?.trim()) {
      warnings.push(
        "PINGFLOW_MESSAGE_INTERPRETER is set but is ignored in production. Remove it.",
      );
    }
    if (set(env, "LOCAL_MAIL_INBOX_URL")) {
      warnings.push(
        "LOCAL_MAIL_INBOX_URL is set but is for local development only. Remove it.",
      );
    }
    const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) {
      warnings.push(
        "NEXT_PUBLIC_SUPABASE_URL points at a local Supabase. Use the hosted project's URL.",
      );
    }
  }
  return { errors, warnings };
}
