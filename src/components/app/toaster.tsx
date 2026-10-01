"use client";

import { X } from "lucide-react";
import Link from "next/link";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cx } from "@/lib/cx";

// Short confirmations after an action ("Sarah's lesson moved…"). Announced
// politely to screen readers; they sit above the mobile tab bar and leave on
// their own after a few seconds (or stay while hovered or focused).

type Toast = {
  id: number;
  message: string;
  tone: "done" | "error";
  action?: { href: string; label: string };
};

type ToastInput = Omit<Toast, "id" | "tone"> & { tone?: Toast["tone"] };

const ToastContext = createContext<(toast: ToastInput) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((input: ToastInput) => {
    const id = nextId.current++;
    // One at a time: a new confirmation replaces the last.
    setToasts([{ tone: "done", ...input, id }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6 md:left-22"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(toast.id), 6000);
    return () => clearTimeout(timer);
  }, [paused, toast.id, onDismiss]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cx(
        "pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-md py-2 pr-2 pl-4 text-ui shadow-overlay motion-safe:animate-message-in",
        toast.tone === "error"
          ? "bg-alert text-surface"
          : "bg-night text-night-text",
      )}
    >
      <p className="min-w-0 flex-1 py-1">{toast.message}</p>
      {toast.action && (
        <Link
          href={toast.action.href}
          className={cx(
            "shrink-0 rounded-sm px-2 py-1.5 font-medium underline-offset-4 hover:underline",
            toast.tone === "error" ? "text-surface" : "text-accent",
          )}
        >
          {toast.action.label}
        </Link>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onDismiss(toast.id)}
        className="grid size-8 shrink-0 place-items-center rounded-sm opacity-70 hover:opacity-100"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
