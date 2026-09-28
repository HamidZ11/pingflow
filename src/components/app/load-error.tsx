"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/button-link";

// What a screen shows when its data couldn't be loaded (usually a dropped
// connection, after a few seconds of quiet retries). Nothing was changed,
// so trying again is always safe. Focus moves to "Try again", so keyboard
// and screen reader users land on the way forward; the message is read
// with it.
export function LoadError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    console.error(error);
    button.current?.focus();
  }, [error]);

  return (
    <div role="alert" aria-labelledby="load-error-title">
      <h1 id="load-error-title" className="text-heading font-semibold text-ink">
        Pingflow couldn’t load this right now.
      </h1>
      <p
        id="load-error-detail"
        className="mt-1.5 max-w-md text-body text-ink-2"
      >
        Your data hasn’t been changed. Try again in a moment.
      </p>
      <Button
        ref={button}
        className="mt-6"
        onClick={retry}
        aria-describedby="load-error-detail"
      >
        Try again
      </Button>
    </div>
  );
}
