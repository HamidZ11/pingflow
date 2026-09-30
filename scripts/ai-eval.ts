// The live evaluation: sends the evaluation corpus to OpenAI and assesses
// every reading against the expected one, by what Pingflow would then do.
//
//   pnpm ai:eval               every case (41), one call each
//   pnpm ai:eval --limit 20    the first 20
//   pnpm ai:eval --owner       the owner-command corpus instead
//
// It costs money, so it never runs in CI or the normal test suite and needs
// OPENAI_API_KEY. Before sending anything it says what it will send. HTTP
// requests are counted (the SDK may retry a temporary failure once) and
// capped: the run stops rather than exceed cases × (1 + retries).
//
// Results go to results/ai-evals/ (git-ignored) as JSON. They hold the
// synthetic corpus messages and readings, never keys or headers.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { corpus } from "@/domain/messages/fixtures/corpus";
import {
  assessCase,
  type CaseAssessment,
  interpreterRequestFor,
} from "@/domain/messages/fixtures/harness";
import { aiSettings } from "@/lib/ai/config";
import type { InterpreterResult } from "@/lib/ai/interpreter";
import {
  interpretationFormat,
  OpenAIMessageInterpreter,
} from "@/lib/ai/openai-interpreter";
import { estimateCost, priceFor } from "@/lib/ai/pricing";
import { PROMPT_VERSION } from "@/lib/ai/prompts/message-interpreter";
import { dollars, git, percentile } from "./eval-shared";

const MAX_CASES = 41;
/** Stop early if the first few calls all fail at the provider. */
const EARLY_PROVIDER_FAILURES = 3;

function limitArg(): number {
  const at = process.argv.indexOf("--limit");
  if (at === -1) return Math.min(corpus.length, MAX_CASES);
  const n = Number(process.argv[at + 1]);
  if (!Number.isInteger(n) || n < 1) {
    console.error("--limit needs a whole number of cases, e.g. --limit 20");
    process.exit(1);
  }
  return Math.min(n, corpus.length, MAX_CASES);
}

type CaseRecord = {
  id: string;
  text: string;
  latencyMs: number;
  requests: number;
  failure: string | null;
  detail: string | null;
  reportedModel: string | null;
  usage: {
    input: number;
    cached: number;
    output: number;
    costMicros: number | null;
    responseId: string | null;
  } | null;
  interpretation: unknown;
  assessment: CaseAssessment;
};

async function main() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error(
      "OPENAI_API_KEY configured: no. Nothing was sent. Add it to .env.local to run the live evaluation.",
    );
    process.exit(1);
  }
  const settings = aiSettings({
    ...process.env,
    PINGFLOW_MESSAGE_INTERPRETER: "",
  });
  const cases = corpus.slice(0, limitArg());
  const maxRequests = cases.length * (1 + settings.maxRetries);
  const endpoint = new URL(
    process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  ).host;
  const schemaHash = createHash("sha256")
    .update(JSON.stringify(interpretationFormat.schema))
    .digest("hex")
    .slice(0, 12);
  const price = priceFor(settings.model);

  console.log(`
  Live evaluation. Real API usage: this costs money.
    OPENAI_API_KEY configured  yes
    Endpoint                   ${endpoint}${endpoint === "api.openai.com" ? "" : "   NOT OpenAI: not a model evaluation"}
    Model                      ${settings.model}
    Reasoning effort           ${settings.reasoningEffort ?? "model default"}
    Prompt version             ${PROMPT_VERSION}
    Schema                     ${interpretationFormat.name} ${schemaHash}
    Cases                      ${cases.length}
    Maximum API requests       ${maxRequests}: one per case, at most ${settings.maxRetries} retry each
    Price per 1M tokens        ${price ? `$${price.inputPerMillion} in, $${price.cachedInputPerMillion} cached, $${price.outputPerMillion} out` : "not listed: cost will be unknown"}
`);

  // Every HTTP request the SDK makes, retries included. Headers aren't kept.
  let requests = 0;
  let sampleRequest: Record<string, unknown> | null = null;
  const countingFetch: typeof fetch = async (input, init) => {
    requests++;
    if (requests > maxRequests) {
      throw new Error(`Request cap reached (${maxRequests}).`);
    }
    if (!sampleRequest && typeof init?.body === "string") {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      const text = body.text as
        { format?: Record<string, unknown> } | undefined;
      const shown = [
        "model",
        "store",
        "reasoning",
        "max_output_tokens",
        "text",
        "instructions",
        "input",
      ];
      sampleRequest = {
        model: body.model,
        store: body.store,
        reasoning: body.reasoning,
        max_output_tokens: body.max_output_tokens,
        format: {
          type: text?.format?.type,
          name: text?.format?.name,
          strict: text?.format?.strict,
        },
        instructionsChars: String(body.instructions ?? "").length,
        input: body.input,
        otherFields: Object.keys(body).filter((k) => !shown.includes(k)),
      };
    }
    return fetch(input, init);
  };

  const interpreter = new OpenAIMessageInterpreter({
    apiKey: key,
    model: settings.model,
    reasoningEffort: settings.reasoningEffort,
    timeoutMs: settings.timeoutMs,
    maxRetries: settings.maxRetries,
    maxOutputTokens: settings.maxOutputTokens,
    fetch: countingFetch,
  });

  const records: CaseRecord[] = [];
  const started = Date.now();
  let stopped: string | null = null;

  for (const testCase of cases) {
    if (requests >= maxRequests) {
      stopped = `Request cap reached (${maxRequests}) before ${testCase.id}. Stopping to diagnose.`;
      break;
    }
    const before = requests;
    const t0 = performance.now();
    const result: InterpreterResult = await interpreter.interpret(
      interpreterRequestFor(testCase),
    );
    const latencyMs = Math.round(performance.now() - t0);
    const used = requests - before;
    const cost = result.usage ? estimateCost(result.usage) : null;
    const assessment = assessCase(
      testCase,
      result.ok
        ? { ok: true, interpretation: result.interpretation }
        : { ok: false, failure: result.failure },
    );
    records.push({
      id: testCase.id,
      text: testCase.text,
      latencyMs,
      requests: used,
      failure: result.ok ? null : result.failure,
      detail: result.ok ? null : (result.detail ?? null),
      reportedModel: result.usage?.model ?? null,
      usage: result.usage
        ? {
            input: result.usage.inputTokens,
            cached: result.usage.cachedInputTokens,
            output: result.usage.outputTokens,
            costMicros: cost?.micros ?? null,
            responseId: result.usage.responseId,
          }
        : null,
      interpretation: result.ok ? result.interpretation : null,
      assessment,
    });
    const mark = assessment.severity?.toUpperCase() ?? "ok";
    console.log(
      `  ${mark.padEnd(9)} ${testCase.id.padEnd(11)} ${String(latencyMs).padStart(5)} ms  ${used} req${assessment.reasons.length ? `  ${assessment.reasons.join("; ")}` : ""}`,
    );

    if (used > 1 + settings.maxRetries) {
      stopped = `${testCase.id} made ${used} requests. Stopping to diagnose.`;
      break;
    }
    if (
      records.length === EARLY_PROVIDER_FAILURES &&
      records.every((r) => r.assessment.structured === "provider_error")
    ) {
      stopped = `The first ${EARLY_PROVIDER_FAILURES} cases failed at the provider (${records.map((r) => r.detail ?? r.failure).join(", ")}). Stopping to diagnose.`;
      break;
    }
  }
  const wallMs = Date.now() - started;

  // --- Summary ---------------------------------------------------------------
  const n = records.length;
  const all = records.map((r) => r.assessment);
  const tally = (pick: (x: CaseAssessment) => boolean | null) => {
    const applicable = all.filter((x) => pick(x) !== null);
    return {
      correct: applicable.filter((x) => pick(x) === true).length,
      of: applicable.length,
    };
  };
  const criteria = {
    intent: tally((x) => x.criteria.intent),
    date: tally((x) => x.criteria.date),
    time: tally((x) => x.criteria.time),
    person: tally((x) => x.criteria.person),
    service: tally((x) => x.criteria.service),
    clarification: tally((x) => x.criteria.clarification),
    outcome: tally((x) => x.criteria.outcome),
    sameEffect: tally((x) => x.criteria.sameEffect),
    corpusPass: tally((x) => x.pass),
  };
  // Date, time, person and service, wherever the expected reading has one.
  const keyEntities = { correct: 0, of: 0 };
  for (const x of all) {
    for (const [k, has] of Object.entries(x.keyEntities)) {
      if (!has) continue;
      keyEntities.of++;
      if (x.criteria[k as keyof typeof x.keyEntities]) keyEntities.correct++;
    }
  }
  const clearCore = tally((x) => (x.clearCore ? x.criteria.intent : null));
  const structured = {
    valid: all.filter((x) => x.structured === "valid").length,
    refused: all.filter((x) => x.structured === "refused").length,
    incomplete: all.filter((x) => x.structured === "incomplete").length,
    malformed: all.filter((x) => x.structured === "invalid_output").length,
    providerErrors: all.filter((x) => x.structured === "provider_error").length,
  };
  const severity = {
    critical: all.filter((x) => x.severity === "critical").map((x) => x.id),
    important: all.filter((x) => x.severity === "important").map((x) => x.id),
    minor: all.filter((x) => x.severity === "minor").map((x) => x.id),
  };
  const withReason = (re: RegExp) =>
    all.filter((x) => x.reasons.some((r) => re.test(r))).map((x) => x.id);

  const latencies = records.map((r) => r.latencyMs).sort((x, y) => x - y);
  const metered = records.filter((r) => r.usage);
  const sum = (pick: (u: NonNullable<CaseRecord["usage"]>) => number) =>
    metered.reduce((total, r) => total + pick(r.usage!), 0);
  const tokens = {
    input: sum((u) => u.input),
    cached: sum((u) => u.cached),
    output: sum((u) => u.output),
  };
  const bySize = [...metered].sort(
    (x, y) =>
      x.usage!.input + x.usage!.output - (y.usage!.input + y.usage!.output),
  );
  const priced =
    metered.length > 0 && metered.every((r) => r.usage!.costMicros !== null);
  const totalMicros = priced ? sum((u) => u.costMicros!) : null;
  const perMessageMicros =
    totalMicros !== null ? totalMicros / metered.length : null;
  // Did the stable instructions get cache hits once the first call warmed it?
  const cachedAfterFirst = metered.slice(1).filter((r) => r.usage!.cached > 0);

  const summary = {
    cases: { planned: cases.length, run: n },
    requests: {
      logical: n,
      actual: requests,
      retried: Math.max(0, requests - n),
      cap: maxRequests,
    },
    stopped,
    criteria,
    keyEntities,
    clearCore,
    structured,
    severity,
    safety: {
      privacyCritical: withReason(/privacy/),
      unsafeAction: withReason(
        /critical: (.* read as |raised a |ambiguity|unsupported|acted where)/,
      ),
      inventedDateOrTime: withReason(/wasn't in the message/),
    },
    latencyMs: {
      min: latencies[0] ?? 0,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies.at(-1) ?? 0,
      wallClock: wallMs,
    },
    tokens: {
      ...tokens,
      averageInput: metered.length ? tokens.input / metered.length : 0,
      averageOutput: metered.length ? tokens.output / metered.length : 0,
      smallest: bySize[0] ? { id: bySize[0].id, ...bySize[0].usage } : null,
      largest: bySize.at(-1)
        ? { id: bySize.at(-1)!.id, ...bySize.at(-1)!.usage }
        : null,
    },
    cache: {
      cachedShareOfInput: tokens.input ? tokens.cached / tokens.input : 0,
      requestsWithCacheHitsAfterFirst: cachedAfterFirst.length,
    },
    cost: {
      currency: "USD",
      totalMicros,
      averagePerMessageMicros: perMessageMicros,
      /** AI interpretation cost only: no WhatsApp, database or hosting. */
      aiInterpretationOnlyPerMonth:
        perMessageMicros === null
          ? null
          : Object.fromEntries(
              [100, 500, 1000, 5000].map((m) => [
                m,
                Number(((perMessageMicros * m) / 1e6).toFixed(4)),
              ]),
            ),
    },
  };

  const timestamp = new Date().toISOString();
  const artifact = {
    kind: "pingflow-ai-eval",
    timestamp,
    git: git(),
    endpoint,
    model: settings.model,
    reportedModels: [...new Set(records.map((r) => r.reportedModel))],
    promptVersion: PROMPT_VERSION,
    schema: { name: interpretationFormat.name, hash: schemaHash },
    settings: {
      reasoningEffort: settings.reasoningEffort,
      maxOutputTokens: settings.maxOutputTokens,
      timeoutMs: settings.timeoutMs,
      maxRetries: settings.maxRetries,
    },
    price,
    summary,
    failedCases: records
      .filter((r) => r.assessment.severity && r.assessment.severity !== "minor")
      .map((r) => r.id),
    sampleRequest,
    cases: records,
  };
  const dir = join("results", "ai-evals");
  mkdirSync(dir, { recursive: true });
  const file = join(
    dir,
    `${timestamp.replace(/[:.]/g, "-")}-${settings.model}.json`,
  );
  writeFileSync(file, `${JSON.stringify(artifact, null, 2)}\n`);

  const pct = (c: { correct: number; of: number }) =>
    c.of
      ? `${c.correct}/${c.of} (${Math.round((100 * c.correct) / c.of)}%)`
      : "n/a";
  console.log(`
  ${stopped ? `STOPPED: ${stopped}\n  ` : ""}Requests      ${n} cases, ${requests} API requests, ${summary.requests.retried} retried
  Intent        ${pct(criteria.intent)}; clear core requests ${pct(clearCore)}
  Date          ${pct(criteria.date)}
  Time          ${pct(criteria.time)}
  Person        ${pct(criteria.person)}
  Service       ${pct(criteria.service)}
  Key entities  ${pct(keyEntities)}
  Clarification ${pct(criteria.clarification)}
  Outcome       ${pct(criteria.outcome)}; same effect ${pct(criteria.sameEffect)}
  Structured    ${structured.valid} valid, ${structured.refused} refused, ${structured.incomplete} incomplete, ${structured.malformed} malformed, ${structured.providerErrors} provider errors
  Severity      ${severity.critical.length} critical [${severity.critical.join(", ")}]; ${severity.important.length} important [${severity.important.join(", ")}]; ${severity.minor.length} minor
  Latency       min ${summary.latencyMs.min} ms, p50 ${summary.latencyMs.p50} ms, p95 ${summary.latencyMs.p95} ms, max ${summary.latencyMs.max} ms; ${(wallMs / 1000).toFixed(1)} s in all
  Tokens        ${tokens.input} in (${tokens.cached} cached), ${tokens.output} out; per case ${summary.tokens.averageInput.toFixed(0)} in, ${summary.tokens.averageOutput.toFixed(0)} out
  Cost          ${totalMicros === null ? "unknown: no listed price" : `${dollars(totalMicros)} in all, ${dollars(perMessageMicros!)} per message (AI interpretation only)`}
  Saved         ${file}
`);
  if (stopped) process.exit(2);
}

(process.argv.includes("--owner")
  ? import("./ai-eval-owner").then((m) => m.main())
  : main()
).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
