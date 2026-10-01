"use client";

import { Check, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { Overlay } from "@/components/app/overlay";
import { Spinner } from "@/components/app/spinner";
import { useToast } from "@/components/app/toaster";
import { Button } from "@/components/button-link";
import { WhatsAppMark } from "@/components/whatsapp-mark";
import {
  checkWhatsAppConnection,
  disconnectWhatsApp,
} from "@/features/whatsapp/actions";
import type { WhatsAppSettings } from "@/features/whatsapp/settings-data";

// The WhatsApp section of Settings: one plain state, and only the actions
// that really exist. No Meta IDs, tokens or API details.
export function WhatsAppSettingsCard({
  settings,
  developerHint,
}: {
  settings: WhatsAppSettings;
  /** Development only: how to use the number in .env.local. */
  developerHint: boolean;
}) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"disconnect" | "check" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(
    kind: "disconnect" | "check",
    action: () => ReturnType<typeof disconnectWhatsApp>,
  ) {
    setError(null);
    setBusy(kind);
    startTransition(async () => {
      const result = await action();
      setBusy(null);
      if (result.ok) {
        setConfirming(false);
        toast({ message: result.message ?? "Done." });
      } else {
        setError(result.error);
      }
    });
  }

  const connected =
    settings.state === "connected" || settings.state === "needs_attention";

  return (
    <div>
      <div className="rounded-lg border border-line bg-surface px-4 py-4">
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-sunken">
            <WhatsAppMark className="size-5 text-whatsapp" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-ui font-medium text-ink">WhatsApp Business</p>
            {settings.state === "not_connected" && (
              <>
                <p className="text-ui-sm text-ink-2">Not connected</p>
                <p className="mt-1 text-ui-sm text-ink-3">
                  Connect WhatsApp Business so Pingflow can receive and reply to
                  customer messages.
                </p>
              </>
            )}
            {settings.state === "connecting" && (
              <p className="text-ui-sm text-ink-2">Connecting…</p>
            )}
            {settings.state === "connected" && (
              <p className="flex items-center gap-1.5 text-ui-sm text-ink-2">
                <Check aria-hidden className="size-3.5 text-whatsapp" />
                Connected
              </p>
            )}
            {settings.state === "needs_attention" && (
              <>
                <p className="flex items-center gap-1.5 text-ui-sm font-medium text-ink">
                  <TriangleAlert aria-hidden className="size-3.5 text-alert" />
                  WhatsApp needs attention
                </p>
                <p className="mt-0.5 text-ui-sm text-ink-2">
                  Pingflow can’t currently send messages.
                </p>
              </>
            )}
          </div>
        </div>

        {connected && (
          <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 border-t border-line pt-3 text-ui">
            <dt className="text-ink-3">Number</dt>
            <dd className="break-words text-ink tabular-nums">
              {settings.number ?? "Unknown"}
            </dd>
            {settings.name && (
              <>
                <dt className="text-ink-3">Name</dt>
                <dd className="break-words text-ink">{settings.name}</dd>
              </>
            )}
            <dt className="text-ink-3">Last message</dt>
            <dd className="text-ink">
              {settings.lastMessage ?? "None received yet"}
            </dd>
            {settings.developer && (
              <>
                <dt className="text-ink-3">Set up</dt>
                <dd className="text-ink">Developer connection</dd>
              </>
            )}
          </dl>
        )}

        {error && (
          <p role="alert" className="mt-3 text-ui text-alert">
            {error}
          </p>
        )}

        {connected && (
          <div className="mt-4 flex flex-wrap gap-2">
            {settings.state === "needs_attention" && (
              <Button
                disabled={busy !== null}
                onClick={() => run("check", checkWhatsAppConnection)}
              >
                {busy === "check" && <Spinner />}
                {busy === "check" ? "Checking…" : "Check again"}
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={busy !== null}
              onClick={() => setConfirming(true)}
            >
              Disconnect
            </Button>
          </div>
        )}
      </div>

      {settings.state === "not_connected" && (
        <p className="mt-2 text-ui-sm text-ink-3">
          Connecting from here isn’t available yet. Until it is, nothing is sent
          to customers; Activity records what Pingflow would have sent.
          {developerHint &&
            " Developer: run “pnpm whatsapp connect <your email>” to use the number in .env.local."}
        </p>
      )}

      <Overlay
        open={confirming}
        onClose={() => {
          setConfirming(false);
          setError(null);
        }}
        dismissible={busy === null}
        variant="dialog"
        title="Disconnect WhatsApp?"
        description="Pingflow will stop receiving and sending WhatsApp messages."
        footer={
          <>
            <Button
              variant="ghost"
              disabled={busy !== null}
              onClick={() => setConfirming(false)}
            >
              Keep connected
            </Button>
            <Button
              disabled={busy !== null}
              onClick={() => run("disconnect", disconnectWhatsApp)}
            >
              {busy === "disconnect" && <Spinner />}
              {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </Button>
          </>
        }
      >
        {error && (
          <p
            role="alert"
            className="mb-3 rounded-md bg-alert/5 px-3 py-2.5 text-ui text-alert"
          >
            {error}
          </p>
        )}
        <p className="text-ui text-ink-2">
          Your customers, bookings and message history stay in Pingflow.
          Anything waiting to be sent won’t be.
        </p>
      </Overlay>
    </div>
  );
}
