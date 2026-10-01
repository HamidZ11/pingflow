import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { FaqList } from "@/components/faq-list";
import { PageIntro } from "@/components/page-intro";
import { ProgressRail } from "@/components/progress-rail";
import { SiteFooter } from "@/components/site-footer";
import { StartBand } from "@/components/start-band";
import { cx } from "@/lib/cx";
import { containerClassName } from "@/lib/layout";
import { contactHref, startFreeHref } from "@/lib/links";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Start free, then £10 a month. One simple plan for the WhatsApp admin Pingflow handles for you.",
};

// Buying information only — the product does more than this list says.
const included = [
  "WhatsApp Business connection",
  "Built-in Pingflow calendar",
  "Bookings and reschedules",
  "Automatic reminders",
  "Owner approvals",
  "Customer history",
  "Activity log",
];

const outcomes = [
  "Customers book and reschedule over WhatsApp.",
  "Pingflow keeps your schedule organised.",
  "Important changes still wait for your approval.",
];

const questions = [
  {
    question: "What happens after the free trial?",
    answer:
      "Pingflow is £10 a month, billed monthly. It’s the same single plan, with everything you used during your trial.",
  },
  {
    question: "Do I need WhatsApp Business?",
    answer:
      "Yes. Pingflow connects to a WhatsApp Business number. The free WhatsApp Business app is enough; personal WhatsApp accounts aren’t supported.",
  },
  {
    question: "Do I need to use a separate calendar?",
    answer:
      "No. Pingflow has its own simple schedule built in. Google Calendar sync is planned for people who already use it.",
  },
  {
    question: "What about WhatsApp message charges?",
    answer:
      "WhatsApp message charges may apply depending on Meta’s pricing. Meta sets those charges, not Pingflow.",
  },
  {
    question: "What if I stop using Pingflow?",
    answer:
      "Your WhatsApp Business number and your conversations stay yours. You carry on messaging customers from the WhatsApp Business app, as you do now.",
  },
];

export default function PricingPage() {
  return (
    <>
      <main>
        {/* 1–2. A short intro straight into the offer. */}
        <section
          aria-labelledby="pricing-title"
          className={cx(containerClassName, "pt-8 sm:pt-10 lg:pt-12")}
        >
          <PageIntro
            eyebrow="Pricing"
            titleId="pricing-title"
            title={
              <>
                <span className="block sm:inline">Start free.</span>{" "}
                <span className="block sm:inline">Then £10 a month.</span>
              </>
            }
          >
            One simple plan for the WhatsApp admin Pingflow handles for you.
          </PageIntro>

          {/* The whole offer in one surface. Desktop: price and action on the
              left, what's included on the right, the button level with the
              end of the list. Narrow: price, list, then the button. */}
          <div className="mt-10 grid gap-10 rounded-xl bg-night p-6 text-night-text sm:p-8 lg:mt-12 lg:grid-cols-[3fr_2fr] lg:grid-rows-[auto_1fr] lg:gap-x-16 lg:p-10">
            <ProgressRail
              tone="night"
              ongoing
              steps={[
                {
                  id: "trial",
                  content: (
                    <>
                      <p className="text-ui text-night-text-2">Free trial</p>
                      <p className="mt-2 text-price font-semibold tabular-nums">
                        £0
                      </p>
                    </>
                  ),
                },
                {
                  id: "monthly",
                  content: (
                    <>
                      <p className="text-ui text-night-text-2">Then</p>
                      <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
                        <span className="text-price font-semibold tabular-nums">
                          £10
                        </span>
                        <span className="text-lead text-night-text-2">
                          a month
                        </span>
                      </p>
                    </>
                  ),
                },
              ]}
            />

            <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <h2 className="text-ui font-medium text-night-text-2">
                Everything you need
              </h2>
              <ul className="mt-5 grid gap-3">
                {included.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-body">
                    <Check
                      aria-hidden
                      strokeWidth={2.5}
                      className="mt-1 size-4 shrink-0 text-accent"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:self-end">
              <ButtonLink
                href={startFreeHref}
                variant="accent"
                size="lg"
                className="w-full sm:w-auto"
              >
                Start free
              </ButtonLink>
              <p className="mt-4 text-ui-sm text-night-text-3">
                WhatsApp message charges may apply depending on Meta’s pricing.
              </p>
            </div>
          </div>
        </section>

        {/* 3. Why one plan: the statement beside three short outcomes. */}
        <section
          aria-labelledby="one-plan-title"
          className={cx(containerClassName, "pt-16 lg:pt-24")}
        >
          <div className="grid gap-8 border-t border-line-strong pt-8 lg:grid-cols-[3fr_2fr] lg:gap-x-16 lg:pt-10">
            <div>
              <h2
                id="one-plan-title"
                className="text-ui font-medium text-ink-3"
              >
                Why only one plan
              </h2>
              <p className="mt-3 text-title font-medium text-balance text-ink">
                Pingflow is built for solo service businesses. You shouldn’t
                need to compare five plans to automate your admin.
              </p>
            </div>
            <ul className="divide-y divide-line self-end">
              {outcomes.map((outcome) => (
                <li
                  key={outcome}
                  className="py-3 text-body text-ink first:pt-0 last:pb-0"
                >
                  {outcome}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 4. Questions, across the full content width. */}
        <section
          aria-labelledby="questions-title"
          className={cx(containerClassName, "pt-16 pb-20 lg:pt-24 lg:pb-24")}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
            <h2
              id="questions-title"
              className="text-title font-semibold text-ink"
            >
              Questions
            </h2>
            <p className="text-ui text-ink-2">
              Something else?{" "}
              <Link
                href={contactHref}
                className="rounded-xs font-medium text-ink underline decoration-line-strong underline-offset-4 transition-[text-decoration-color] duration-150 hover:decoration-ink"
              >
                Talk to us
              </Link>
              .
            </p>
          </div>
          <FaqList items={questions} className="mt-6" />
        </section>

        {/* 5. Close. */}
        <StartBand />
      </main>
      <SiteFooter />
    </>
  );
}
