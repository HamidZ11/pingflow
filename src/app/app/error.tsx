"use client";

import { LoadError } from "@/components/app/load-error";
import { pageClassName } from "@/components/app/page-header";

// An app screen whose data didn't load. The rail stays, so the owner can
// also go elsewhere.
export default function AppError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className={pageClassName("narrow")}>
      <div className="mt-8 rounded-lg border border-line bg-surface px-5 py-8 sm:px-8">
        <LoadError {...props} />
      </div>
    </div>
  );
}
