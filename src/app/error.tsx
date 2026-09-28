"use client";

import Link from "next/link";
import { LoadError } from "@/components/app/load-error";
import { Mark } from "@/components/mark";

// Last-resort error screen, for failures above a page (for example, the app
// can't reach its database to check who is signed in).
export default function RootError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="px-5 pt-16 pb-24">
      <div className="mx-auto max-w-md">
        <Mark className="size-8" />
        <div className="mt-6">
          <LoadError {...props} />
        </div>
        <Link
          href="/"
          className="mt-2 inline-flex h-10 items-center rounded-md px-1 text-ui font-medium text-ink-2 hover:text-ink"
        >
          Go to the homepage
        </Link>
      </div>
    </main>
  );
}
