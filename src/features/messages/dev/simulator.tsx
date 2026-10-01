"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import {
  Hint,
  inputClassName,
  Label,
  selectClassName,
  textareaClassName,
} from "@/components/app/fields";
import { Spinner } from "@/components/app/spinner";
import { Button } from "@/components/button-link";
import {
  reprocessMessage,
  type SimulationResult,
  simulateMessage,
} from "@/features/messages/dev/actions";
import type { SimulatorData } from "@/features/messages/dev/data";
import { cx } from "@/lib/cx";

// Development only: sends a pretend WhatsApp message through the real
// pipeline and shows everything it did, internals included.

const OTHER = "other";
/** Stands for whichever number is set up as the owner's. */
const OWNER = "owner";
const UNKNOWN_NUMBER = "+447700900111";

// Messages the fixture interpreter knows (the evaluation corpora), grouped
// by the flows they exercise. The demo seed's numbers: Sarah, Dana (Leo and
// Adam's parent), and a number nobody knows. A "Revised" sample changes the
// request sent just before it, so send them in order.
const SARAH = "+447700900123";
const samples = [
  { flow: "Next booking", text: "When's my next lesson?", from: SARAH },
  { flow: "Availability", text: "Are you free Friday at 4?", from: SARAH },
  { flow: "Availability", text: "Any spaces Thursday afternoon?", from: SARAH },
  { flow: "Availability", text: "Anything after 4 Friday?", from: SARAH },
  {
    flow: "New booking",
    text: "Can I book a driving lesson Friday at 5?",
    from: SARAH,
  },
  { flow: "Revised", text: "Actually could I do 6 instead?", from: SARAH },
  {
    flow: "Reschedule",
    text: "Can we move tomorrow's lesson to Friday after 4?",
    from: SARAH,
  },
  { flow: "Revised", text: "Actually 6 would be better", from: SARAH },
  { flow: "Cancellation", text: "Need to cancel tomorrow sorry", from: SARAH },
  { flow: "Cancellation", text: "I need to cancel my lesson", from: SARAH },
  { flow: "Clarification", text: "Can I move my lesson?", from: SARAH },
  { flow: "Clarification", text: "Friday works best for me", from: SARAH },
  { flow: "Clarification", text: "not sure yet tbh", from: SARAH },
  { flow: "Clarification", text: "Can we do later?", from: SARAH },
  { flow: "Question", text: "How long is a lesson?", from: SARAH },
  { flow: "Privacy", text: "When is Sarah booked?", from: UNKNOWN_NUMBER },
  {
    flow: "Privacy",
    text: "Hi, do you have anything free next week?",
    from: UNKNOWN_NUMBER,
  },
  { flow: "Parent", text: "When is Adam booked?", from: "+447700900567" },
  { flow: "Parent", text: "When is the lesson?", from: "+447700900567" },
  // The owner's own commands (sent from the owner's number).
  { flow: "Owner", text: "Who have I got tomorrow?", from: OWNER },
  { flow: "Owner", text: "When is Sarah booked?", from: OWNER },
  { flow: "Owner", text: "am i free friday at 5", from: OWNER },
  { flow: "Owner", text: "How many lessons have I got tomorrow?", from: OWNER },
  { flow: "Owner", text: "Move Sarah Friday", from: OWNER },
  { flow: "Owner", text: "Block Thursday afternoon", from: OWNER },
];

const outcomes: Record<string, string> = {
  auto_reply: "Replied automatically",
  request_clarification: "Asked one question",
  create_approval: "Sent to the owner for approval",
  owner_reply_task: "Left for the owner to reply",
  privacy_hold: "Held back for privacy; left for the owner",
  unsupported: "Not something Pingflow handles; left for the owner",
  no_action: "Nothing to do",
};

export function Simulator({ data }: { data: SimulatorData }) {
  const id = useId();
  const known = new Set(data.senders.map((s) => s.phone));
  const [sender, setSender] = useState(data.senders[0]?.phone ?? OTHER);
  const [otherPhone, setOtherPhone] = useState(UNKNOWN_NUMBER);
  const [body, setBody] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [last, setLast] = useState<{
    from: string;
    body: string;
    receivedAt: string;
    externalId: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const from = sender === OTHER ? otherPhone : sender;

  function send(again = false) {
    const input =
      again && last ? last : { from, body, receivedAt, externalId: "" };
    startTransition(async () => {
      const outcome = await simulateMessage({
        from: input.from,
        body: input.body,
        receivedAt: input.receivedAt || null,
        externalId: input.externalId || null,
      });
      setResult(outcome);
      if (outcome.ok) {
        setLast({ ...input, externalId: outcome.externalId });
        if (!again) setBody("");
      }
    });
  }

  const ownerSender = data.senders.find((s) => s.owner)?.phone ?? null;

  function pickSample(sample: (typeof samples)[number]) {
    setBody(sample.text);
    if (sample.from === OWNER) {
      if (ownerSender) setSender(ownerSender);
      return;
    }
    if (known.has(sample.from)) setSender(sample.from);
    else {
      setSender(OTHER);
      setOtherPhone(sample.from);
    }
  }

  return (
    <div className="space-y-8">
      <p className="rounded-md border border-line bg-sunken px-4 py-3 text-ui text-ink-2">
        <span className="font-medium text-ink">Interpreter:</span>{" "}
        {data.interpreter.kind}
        {data.interpreter.kind === "openai" &&
          ` · ${data.interpreter.model} · reasoning ${data.interpreter.reasoningEffort ?? "default"}`}
        . {data.interpreter.note}
        {data.interpreter.kind === "none" &&
          " To try the sample messages without a key, set PINGFLOW_MESSAGE_INTERPRETER=fixture in .env.local."}
      </p>

      <form
        className="space-y-5 rounded-lg border border-line bg-surface p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <div>
          <Label htmlFor={`${id}-sender`}>From</Label>
          <select
            id={`${id}-sender`}
            value={sender}
            onChange={(event) => setSender(event.target.value)}
            className={cx(selectClassName, "mt-2")}
          >
            {data.senders.map((s) => (
              <option key={s.phone} value={s.phone}>
                {s.label}
              </option>
            ))}
            <option value={OTHER}>Another number…</option>
          </select>
        </div>
        {sender === OTHER && (
          <div>
            <Label htmlFor={`${id}-phone`}>Number</Label>
            <input
              id={`${id}-phone`}
              value={otherPhone}
              onChange={(event) => setOtherPhone(event.target.value)}
              inputMode="tel"
              autoComplete="off"
              className={cx(inputClassName, "mt-2")}
            />
          </div>
        )}
        <div>
          <Label htmlFor={`${id}-body`}>Message</Label>
          <textarea
            id={`${id}-body`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            maxLength={4096}
            className={cx(textareaClassName, "mt-2")}
          />
        </div>
        <div>
          <Label htmlFor={`${id}-received`}>Received</Label>
          <input
            id={`${id}-received`}
            type="datetime-local"
            value={receivedAt}
            onChange={(event) => setReceivedAt(event.target.value)}
            aria-describedby={`${id}-received-hint`}
            className={cx(inputClassName, "mt-2 sm:max-w-xs")}
          />
          <Hint id={`${id}-received-hint`}>
            Optional, in the business’s time zone. Empty means now.
          </Hint>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={pending || !body.trim() || !from.trim()}
          >
            {pending && <Spinner />}
            Process message
          </Button>
          {last && (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => send(true)}
            >
              Deliver the last one again
            </Button>
          )}
        </div>
      </form>

      <section aria-labelledby={`${id}-samples`}>
        <h2 id={`${id}-samples`} className="text-ui font-medium text-ink">
          Sample messages
        </h2>
        <p className="mt-1 text-ui-sm text-ink-3">
          These are in the fixture set, so they work without an OpenAI key.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {samples.map((sample) => (
            <li key={`${sample.flow}:${sample.text}`}>
              <button
                type="button"
                onClick={() => pickSample(sample)}
                className="rounded-md border border-line bg-surface px-3 py-1.5 text-left text-ui-sm text-ink hover:border-ink-3"
              >
                <span className="text-ink-3">{sample.flow}:</span> {sample.text}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {result && <ResultPanel result={result} />}

      <RecentRuns runs={data.runs} onResult={setResult} />
    </div>
  );
}

function ResultPanel({ result }: { result: SimulationResult }) {
  if (!result.ok) {
    return (
      <p
        role="alert"
        className="rounded-md bg-alert/5 px-4 py-3 text-ui text-alert"
      >
        {result.error}
      </p>
    );
  }
  const r = result.report;
  if (r.owner) return <OwnerResult report={r} />;
  const decision = r.decision;
  const headline = r.duplicate
    ? "Seen before: nothing was done again"
    : r.status === "failed"
      ? "Couldn’t be interpreted: left for the owner"
      : decision
        ? (outcomes[decision.outcome] ?? decision.outcome)
        : r.status;

  const rows: [string, string | null | undefined][] = [
    ["Run", r.runId],
    ["Status", r.status],
    ["Interpreter", r.interpreter],
    ["Model", r.model],
    ["Prompt", r.promptVersion],
    [
      "Identity",
      r.identity
        ? `${r.identity.kind}${r.identity.customer ? `: ${r.identity.customer}` : ""}`
        : null,
    ],
    ["Intent", r.interpretation?.intent],
    ["Confidence", r.interpretation?.confidence],
    ["Decision", decision ? `${decision.outcome} (${decision.reason})` : null],
    ["Failure", r.failure],
    ["Proposal", decision?.approval?.proposal ?? null],
    ["Owner draft", decision?.ownerTask?.draft ?? null],
    ["Notes", decision?.assessment.notes.join("; ") || null],
  ];

  return (
    <section
      aria-live="polite"
      aria-labelledby="simulation-result"
      className="rounded-lg border border-line bg-surface p-4 sm:p-5"
    >
      <h2 id="simulation-result" className="text-body font-semibold text-ink">
        {headline}
      </h2>
      {decision?.reply && (
        <div className="mt-3 flex justify-end rounded-md bg-chat p-3">
          <p className="max-w-[92%] rounded-md rounded-tr-xs bg-bubble-out px-3 py-2 text-ui text-ink">
            {decision.reply.body}
          </p>
        </div>
      )}
      <dl className="mt-4 grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-ui">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-ink-3">{label}</dt>
              <dd className="break-words text-ink">{value}</dd>
            </div>
          ))}
        {r.usage && (
          <>
            <dt className="text-ink-3">Usage</dt>
            <dd className="text-ink tabular-nums">
              {r.usage.inputTokens} in ({r.usage.cachedInputTokens} cached) ·{" "}
              {r.usage.outputTokens} out ·{" "}
              {r.usage.estimatedCostMicros === null
                ? "no price listed for this model"
                : `${r.usage.currency} ${(r.usage.estimatedCostMicros / 1e6).toFixed(6)}`}
              {r.usage.recorded ? " · recorded" : " · not recorded"}
            </dd>
          </>
        )}
      </dl>
      {r.created?.pendingActionId && (
        <p className="mt-4 text-ui">
          <Link href="/app" className="underline underline-offset-4">
            Open Attention
          </Link>
        </p>
      )}
      {r.interpretation && (
        <details className="mt-4">
          <summary className="cursor-pointer text-ui text-ink-2">
            Interpretation
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-sunken p-3 text-ui-sm text-ink">
            {JSON.stringify(r.interpretation, null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}

function RecentRuns({
  runs,
  onResult,
}: {
  runs: SimulatorData["runs"];
  onResult: (result: SimulationResult) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  return (
    <section aria-labelledby="recent-runs">
      <h2 id="recent-runs" className="text-ui font-medium text-ink">
        Recent runs
      </h2>
      {runs.length === 0 ? (
        <p className="mt-2 text-ui text-ink-3">Nothing processed yet.</p>
      ) : (
        <ol className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
          {runs.map((run) => (
            <li key={run.id} className="px-4 py-3 text-ui">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium text-ink">{run.from}</span>
                <span className="text-ui-sm text-ink-3">
                  {run.when} · {run.source}
                </span>
              </div>
              <p className="mt-0.5 break-words text-ink-2">{run.body}</p>
              <p className="mt-1 text-ui-sm break-words text-ink-3">
                {run.status}
                {run.decision && ` · ${run.decision}`}
                {run.reason && ` (${run.reason})`}
                {run.error && ` · ${run.error}`}
                {run.interpreter && ` · ${run.interpreter}`}
                {run.model && ` ${run.model}`}
                {run.attempts > 1 && ` · ${run.attempts} attempts`}
              </p>
              {run.status === "failed" && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  disabled={pending}
                  onClick={() => {
                    setBusyId(run.id);
                    startTransition(async () => {
                      onResult(await reprocessMessage(run.id));
                      setBusyId(null);
                    });
                  }}
                >
                  {busyId === run.id && <Spinner />}
                  Reprocess
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

const ownerOutcomes: Record<string, string> = {
  answer: "Owner command: answered",
  clarify: "Owner command: asked one question",
  change: "Owner command: changed",
  refuse: "Owner command: nothing changed",
  no_action: "Owner command: nothing to do",
};

function OwnerResult({
  report,
}: {
  report: Extract<SimulationResult, { ok: true }>["report"];
}) {
  const o = report.owner!;
  const headline = report.duplicate
    ? "Seen before: nothing was done again"
    : o.applied === "conflict" || o.applied === "stale"
      ? "Owner command: the change couldn’t be made"
      : (ownerOutcomes[o.outcome] ?? o.outcome);
  const rows: [string, string | null | undefined][] = [
    ["Run", report.runId],
    ["Interpreter", report.interpreter],
    ["Model", report.model],
    ["Prompt", report.promptVersion],
    ["Intent", o.intent],
    ["Decision", `${o.outcome} (${o.reason})`],
    ["Change", o.applied],
  ];
  return (
    <section
      aria-live="polite"
      aria-labelledby="simulation-result"
      className="rounded-lg border border-line bg-surface p-4 sm:p-5"
    >
      <h2 id="simulation-result" className="text-body font-semibold text-ink">
        {headline}
      </h2>
      {o.reply && (
        <div className="mt-3 flex justify-end rounded-md bg-chat p-3">
          <p className="max-w-[92%] rounded-md rounded-tr-xs bg-bubble-out px-3 py-2 text-ui whitespace-pre-line text-ink">
            {o.reply}
          </p>
        </div>
      )}
      <dl className="mt-4 grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-ui">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-ink-3">{label}</dt>
              <dd className="break-words text-ink">{value}</dd>
            </div>
          ))}
        {report.usage && (
          <>
            <dt className="text-ink-3">Usage</dt>
            <dd className="text-ink tabular-nums">
              {report.usage.inputTokens} in ({report.usage.cachedInputTokens}{" "}
              cached) · {report.usage.outputTokens} out ·{" "}
              {report.usage.estimatedCostMicros === null
                ? "no price listed"
                : `${report.usage.currency} ${(report.usage.estimatedCostMicros / 1e6).toFixed(6)}`}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}
