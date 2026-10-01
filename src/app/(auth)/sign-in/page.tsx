import type { Metadata } from "next";
import { SignInForm } from "@/features/auth/sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Pingflow with a link sent to your email.",
};

// Locally, sign-in emails go to the Supabase stack's mail catcher, not a
// real inbox. In development only, and only if its address is configured
// (LOCAL_MAIL_INBOX_URL in .env.local), point to it. A production build
// never renders this.
function devInboxUrl(): string | null {
  if (process.env.NODE_ENV !== "development") return null;
  return process.env.LOCAL_MAIL_INBOX_URL || null;
}

const linkProblems = {
  // The auth server reports used and out-of-date links the same way.
  expired:
    "That sign-in link has expired or was already used. Each link works once, for an hour. Send yourself a new one.",
  invalid: "That sign-in link didn’t work. Send yourself a new one.",
} as const;

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const params = await searchParams;
  const error = params.error;
  const notice =
    error === "expired" || error === "invalid"
      ? { tone: "problem" as const, text: linkProblems[error] }
      : error === "session"
        ? {
            tone: "info" as const,
            text: "Your session has ended. Sign in again to carry on.",
          }
        : params["signed-out"]
          ? { tone: "info" as const, text: "You’ve signed out." }
          : null;

  return (
    <main className="px-5 pt-10 pb-24 sm:pt-16 md:pt-24">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-title font-semibold text-balance text-ink">
          Sign in to Pingflow
        </h1>
        <p className="mt-2 text-body text-ink-2">
          We’ll email you a link. No password needed, and new accounts start the
          same way.
        </p>
        <SignInForm notice={notice} devInboxUrl={devInboxUrl()} />
      </div>
    </main>
  );
}
