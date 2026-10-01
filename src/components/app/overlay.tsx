"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { cx } from "@/lib/cx";

// Sheets and dialogs on the native <dialog> element, opened with
// showModal(). The browser provides the focus trap, Escape to close, and an
// inert page behind. This component adds: open/close from React state,
// closing on a backdrop click, and returning focus to whatever opened it
// (or, if that is gone, to the page's main heading).

type OverlayProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Actions pinned to the bottom edge. */
  footer?: ReactNode;
  /** Sheet: bottom on phones, right side from md. Dialog: small, centred. */
  variant?: "sheet" | "dialog";
  /** Pass false while an action is running, so it can't be dismissed. */
  dismissible?: boolean;
  className?: string;
};

export function Overlay({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "sheet",
  dismissible = true,
  className,
}: OverlayProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const dismissibleRef = useRef(dismissible);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    dismissibleRef.current = dismissible;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnTo.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const onCancel = (event: Event) => {
      if (!dismissibleRef.current) event.preventDefault();
    };
    const onDialogClose = () => {
      const target = returnTo.current;
      if (target?.isConnected) {
        target.focus();
      } else {
        document.querySelector<HTMLElement>("main h1")?.focus();
      }
      onCloseRef.current();
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onDialogClose);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onDialogClose);
    };
  }, []);

  const sheet = variant === "sheet";

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={(event) => {
        // A click on the dialog element itself is a click on the backdrop.
        if (event.target === event.currentTarget && dismissibleRef.current) {
          ref.current?.close();
        }
      }}
      className={cx(
        "app-overlay m-0 max-w-none flex-col overflow-hidden bg-surface text-ink shadow-overlay open:flex",
        sheet
          ? "app-sheet inset-x-0 top-auto bottom-0 max-h-[92dvh] w-full rounded-t-xl md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:max-h-none md:w-[min(30rem,100vw)] md:rounded-none md:rounded-l-xl"
          : "app-dialog inset-0 m-auto h-fit max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] rounded-lg",
        className,
      )}
    >
      <div className="flex items-start gap-3 border-b border-line px-5 pt-4 pb-3.5 md:px-6">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-body font-semibold text-ink">
            {title}
          </h2>
          {description && (
            <div id={descriptionId} className="mt-0.5 text-ui text-ink-3">
              {description}
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label="Close"
          disabled={!dismissible}
          onClick={() => ref.current?.close()}
          className="-mt-1 -mr-2 grid size-10 shrink-0 place-items-center rounded-md text-ink-2 transition-[background-color] duration-150 hover:bg-sunken disabled:opacity-40"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 md:px-6">
        {children}
      </div>
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
          {footer}
        </div>
      )}
    </dialog>
  );
}
