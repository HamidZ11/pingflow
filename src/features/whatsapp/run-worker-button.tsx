"use client";

import { useState, useTransition } from "react";
import { Spinner } from "@/components/app/spinner";
import { Button } from "@/components/button-link";
import { runWorkerNow } from "@/features/whatsapp/dev-actions";

// Development only: runs the WhatsApp worker once.
export function RunWorkerButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await runWorkerNow();
            setResult(r.ok ? "Done" : "Failed: see the server log");
          })
        }
      >
        {pending && <Spinner />}
        Run worker now
      </Button>
      {result && (
        <span role="status" className="text-ui-sm text-ink-3">
          {result}
        </span>
      )}
    </div>
  );
}
