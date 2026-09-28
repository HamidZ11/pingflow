"use client";

import { useState, useTransition } from "react";
import { FieldError } from "@/components/app/fields";
import { Spinner } from "@/components/app/spinner";
import { useToast } from "@/components/app/toaster";
import { Button } from "@/components/button-link";
import { resumeConversation } from "@/features/customers/actions";

export function ResumeButton({
  conversationId,
  customerName,
}: {
  conversationId: string;
  customerName: string;
}) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await resumeConversation(
              conversationId,
              customerName,
            );
            if (result.ok) toast({ message: result.message ?? "Done." });
            else setError(result.error);
          })
        }
      >
        {pending && <Spinner />}
        Let Pingflow reply again
      </Button>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
