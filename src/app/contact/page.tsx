import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import { PageIntro } from "@/components/page-intro";
import { ProgressRail } from "@/components/progress-rail";
import { SiteFooter } from "@/components/site-footer";
import { StartBand } from "@/components/start-band";
import { cx } from "@/lib/cx";
import { containerClassName } from "@/lib/layout";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Questions about Pingflow, early access, or whether it fits your business? Send us a message.",
};

const topics = [
  {
    label: "Product",
    text: "Is Pingflow right for the way I run my business?",
  },
  {
    label: "Setup",
    text: "Questions about WhatsApp Business or your schedule?",
  },
  { label: "General", text: "Something else? Send it over." },
];

export default function ContactPage() {
  return (
    <>
      <main>
        <section
          aria-labelledby="contact-title"
          className={cx(containerClassName, "pt-10 sm:pt-16 lg:pt-20")}
        >
          {/* Desktop: the intro and the topics share the left column beside
              the form. Mobile: intro, then the form, then the topics. */}
          <div className="grid gap-y-12 lg:grid-cols-[5fr_7fr] lg:gap-x-16">
            <PageIntro
              eyebrow="Contact"
              title="Talk to us."
              titleId="contact-title"
            >
              Questions about Pingflow, early access, or whether it fits your
              business? Send us a message.
            </PageIntro>

            <ContactForm className="lg:col-start-2 lg:row-span-2 lg:row-start-1" />

            <div>
              <h2 className="text-ui font-medium text-ink">
                What we can help with
              </h2>
              <dl className="mt-4 border-t border-line">
                {topics.map((topic) => (
                  <div
                    key={topic.label}
                    className="grid grid-cols-[5.5rem_1fr] gap-x-4 border-b border-line py-4"
                  >
                    <dt className="pt-px text-ui-sm text-ink-3">
                      {topic.label}
                    </dt>
                    <dd className="text-body text-ink">{topic.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* What happens after Send: the same rail as the pricing page, and the
            homepage's message-first story in miniature. */}
        <section
          aria-labelledby="next-title"
          className={cx(containerClassName, "py-20 sm:py-24 lg:py-32")}
        >
          <div className="border-t border-line-strong pt-10 lg:pt-14">
            <h2
              id="next-title"
              className="text-headline font-semibold text-ink"
            >
              What happens next
            </h2>
            <ProgressRail
              className="mt-10 lg:mt-14"
              steps={[
                {
                  id: "send",
                  content: (
                    <>
                      <p className="text-ui-sm text-ink-3 tabular-nums">01</p>
                      <p className="mt-2 text-lead font-medium text-ink">
                        You send us a message
                      </p>
                      <p className="mt-1 text-ui text-ink-2">
                        Using the form on this page.
                      </p>
                      {/* Illustration only: how a message lands with us. */}
                      <div
                        aria-hidden
                        className="mt-5 max-w-64 rounded-md rounded-tl-xs border border-line bg-surface px-3 pt-2 pb-1.5 text-ui text-ink"
                      >
                        <p>Is Pingflow right for the way I run my business?</p>
                        <p className="mt-0.5 text-right text-label text-ink-3">
                          Just now
                        </p>
                      </div>
                    </>
                  ),
                },
                {
                  id: "read",
                  content: (
                    <>
                      <p className="text-ui-sm text-ink-3 tabular-nums">02</p>
                      <p className="mt-2 text-lead font-medium text-ink">
                        We read it
                      </p>
                      <p className="mt-1 text-ui text-ink-2">
                        Someone on the Pingflow team reads it.
                      </p>
                    </>
                  ),
                },
                {
                  id: "reply",
                  content: (
                    <>
                      <p className="text-ui-sm text-ink-3 tabular-nums">03</p>
                      <p className="mt-2 text-lead font-medium text-ink">
                        We reply by email
                      </p>
                      <p className="mt-1 text-ui text-ink-2">
                        To the address you give us.
                      </p>
                    </>
                  ),
                },
              ]}
            />
          </div>
        </section>

        <StartBand />
      </main>
      <SiteFooter />
    </>
  );
}
