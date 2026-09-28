"use client";

import { MailCheck } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  FieldError,
  Hint,
  inputClassName,
  Label,
} from "@/components/app/fields";
import { Spinner } from "@/components/app/spinner";
import { Button } from "@/components/button-link";
import { type MagicLinkState, sendMagicLink } from "@/lib/auth/actions";
import { isEmailAddress, normaliseEmail } from "@/lib/auth/email";

const RESEND_AFTER_SECONDS = 30;

const errors = {
  invalid_email: "Enter an email address like name@example.com.",
  rate_limited: "Too many links requested. Wait a minute, then try again.",
  failed: "The link couldn’t be sent. Check your connection and try again.",
} as const;

export function SignInForm({
  notice,
  devInboxUrl,
}: {
  notice: { tone: "problem" | "info"; text: string } | null;
  /** Local development only: where the local mail catcher shows emails. */
  devInboxUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState<MagicLinkState, FormData>(
    sendMagicLink,
    { status: "idle" },
  );
  const [clientError, setClientError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const sentHeadingRef = useRef<HTMLHeadingElement>(null);

  const sent = state.status === "sent" && !editing;
  const serverError = state.status === "error" ? errors[state.error] : null;
  const error = clientError ?? serverError;
  const email = state.status === "idle" ? "" : state.email;

  useEffect(() => {
    if (sent) sentHeadingRef.current?.focus();
  }, [sent]);

  if (sent) {
    return (
      <SentPanel
        email={email}
        headingRef={sentHeadingRef}
        pending={pending}
        resend={formAction}
        devInboxUrl={devInboxUrl}
        onChangeEmail={() => {
          setEditing(true);
          requestAnimationFrame(() => emailRef.current?.focus());
        }}
      />
    );
  }

  return (
    <form
      action={(formData) => {
        setEditing(false);
        formAction(formData);
      }}
      noValidate
      onSubmit={(event) => {
        const value = normaliseEmail(
          new FormData(event.currentTarget).get("email")?.toString() ?? "",
        );
        if (!isEmailAddress(value)) {
          event.preventDefault();
          setClientError(errors.invalid_email);
          emailRef.current?.focus();
        } else {
          setClientError(null);
        }
      }}
      className="mt-8"
    >
      {notice && (
        <p
          role={notice.tone === "problem" ? "alert" : "status"}
          className={
            notice.tone === "problem"
              ? "mb-6 rounded-md border border-alert/25 bg-alert/5 px-3.5 py-3 text-ui text-alert"
              : "mb-6 rounded-md bg-sunken px-3.5 py-3 text-ui text-ink-2"
          }
        >
          {notice.text}
        </p>
      )}
      <Label htmlFor="email">Email</Label>
      <input
        ref={emailRef}
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        defaultValue={email}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "email-error" : "email-hint"}
        onChange={() => clientError && setClientError(null)}
        className={`${inputClassName} mt-1.5`}
        placeholder="you@example.com"
      />
      {error ? (
        <FieldError id="email-error">{error}</FieldError>
      ) : (
        <Hint id="email-hint">Use the email you want to sign in with.</Hint>
      )}
      <Button
        type="submit"
        size="lg"
        className="mt-6 w-full"
        disabled={pending}
      >
        {pending ? (
          <>
            <Spinner />
            Sending…
          </>
        ) : (
          "Send magic link"
        )}
      </Button>
    </form>
  );
}

function SentPanel({
  email,
  headingRef,
  pending,
  resend,
  onChangeEmail,
  devInboxUrl,
}: {
  devInboxUrl: string | null;
  email: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  pending: boolean;
  resend: (formData: FormData) => void;
  onChangeEmail: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(RESEND_AFTER_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  return (
    <div className="mt-8 rounded-lg border border-line bg-surface px-5 py-6">
      <span
        aria-hidden
        className="grid size-10 place-items-center rounded-full bg-night text-accent"
      >
        <MailCheck className="size-5" />
      </span>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="mt-4 text-body font-semibold text-ink focus-visible:outline-none"
      >
        Check your email
      </h2>
      <p className="mt-1 text-ui text-ink-2" role="status">
        We sent a sign-in link to{" "}
        <span className="font-medium break-all text-ink">{email}</span>. It
        works once and expires in an hour.
      </p>
      <p className="mt-3 text-ui-sm text-ink-3">
        Not there? Check spam, or send another.
      </p>
      {devInboxUrl && (
        <p className="mt-2 text-ui-sm text-ink-3">
          Local development?{" "}
          <a
            href={devInboxUrl}
            target="_blank"
            rel="noreferrer"
            className="text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink"
          >
            Open test inbox
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <form
          action={(formData) => {
            setSecondsLeft(RESEND_AFTER_SECONDS);
            resend(formData);
          }}
        >
          <input type="hidden" name="email" value={email} />
          <Button
            type="submit"
            variant="secondary"
            disabled={pending || secondsLeft > 0}
          >
            {pending ? (
              <>
                <Spinner />
                Sending…
              </>
            ) : secondsLeft > 0 ? (
              `Send again in ${secondsLeft}s`
            ) : (
              "Send again"
            )}
          </Button>
        </form>
        <Button variant="ghost" onClick={onChangeEmail}>
          Use a different email
        </Button>
      </div>
    </div>
  );
}
