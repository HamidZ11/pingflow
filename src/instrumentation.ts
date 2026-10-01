import type { Instrumentation } from "next";

// Runs once as each server starts, and on every server error.
//
// register: checks the environment (src/lib/env.ts). In production a
// missing required variable stops the server with its name in the log,
// rather than failing later on a customer's message. Warnings are logged
// and the server carries on.
//
// onRequestError: one structured line per server error, so deployment logs
// show what failed and where. The path loses its query string (a sign-in
// link carries a one-time token there); headers and cookies are never
// logged; phone numbers and emails in the message are masked.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkEnvironment } = await import("@/lib/env");
  const production = process.env.NODE_ENV === "production";
  const { errors, warnings } = checkEnvironment(process.env, { production });
  for (const warning of warnings) {
    console.warn(`[pingflow] environment: ${warning}`);
  }
  if (errors.length) {
    for (const error of errors) {
      console.error(`[pingflow] environment: ${error}`);
    }
    if (production) {
      throw new Error(
        `Pingflow can't start: ${errors.length} required setting${errors.length === 1 ? " is" : "s are"} missing or wrong. See the log above.`,
      );
    }
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { redact } = await import("@/lib/errors");
  const e = error as { message?: unknown; digest?: unknown } | null;
  console.error(
    `[pingflow] request_error ${JSON.stringify({
      method: request.method,
      path: request.path.split("?")[0],
      route: context.routePath,
      type: context.routeType,
      digest: typeof e?.digest === "string" ? e.digest : null,
      message: redact(
        typeof e?.message === "string" ? e.message : String(error),
      ),
    })}`,
  );
};
