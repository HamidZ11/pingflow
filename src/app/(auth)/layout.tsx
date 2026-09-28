import Link from "next/link";
import { InputModality } from "@/components/app/input-modality";
import { Mark } from "@/components/mark";

// Sign-in and onboarding: a quiet frame with just the wordmark, so the one
// task on the page has all the attention.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="mx-auto flex h-16 w-full max-w-page items-center px-5 sm:px-8 lg:px-10">
        <Link
          href="/"
          aria-label="Pingflow home"
          className="-mx-1 flex items-center gap-2 rounded-sm px-1 py-1 text-[1.0625rem] font-semibold tracking-[-0.02em]"
        >
          <Mark className="size-6" />
          Pingflow
        </Link>
      </header>
      {children}
      <InputModality />
    </>
  );
}
