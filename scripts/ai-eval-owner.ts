// The live owner-command evaluation: sends the owner corpus to OpenAI and
// assesses every reading by what Pingflow would then do with it.
//
//   pnpm ai:eval --owner              every case (37), one call each
//   pnpm ai:eval --owner --limit 10   the first 10
//
// Like the customer evaluation it costs money, never runs in CI, needs
// OPENAI_API_KEY, says what it will send first, and caps HTTP requests at
// cases × (1 + retries). Results go to results/ai-evals/ (git-ignored):
// synthetic corpus messages and readings, never keys or headers.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ownerCorpus } from "@/domain/owner/fixtures/corpus";
import {
  assessOwnerCase,
  type OwnerCaseAssessment,
  ownerRequestFor,
} from "@/domain/owner/fixtures/harness";
import { aiSettings } from "@/lib/ai/config";
import {
  OpenAIOwnerInterpreter,
  ownerCommandFormat,
  type OwnerInterpreterResult,
} from "@/lib/ai/owner-interpreter";
import { estimateCost, priceFor } from "@/lib/ai/pricing";
import { OWNER_PROMPT_VERSION } from "@/lib/ai/prompts/owner-command";
import { dollars, git, percentile } from "./eval-shared";

const MAX_CASES = 40;
const EARLY_PROVIDER_FAILURES = 3;

function limitArg(): number {
  const at = process.argv.indexOf("--limit");
  const all = Math.min(ownerCorpus.length, MAX_CASES);
  if (at === -1) return all;
  const n = Number(process.argv[at + 1]);
  if (!Number.isInteger(n) || n < 1) {
    console.error("--limit needs a whole number of cases, e.g. --limit 10");
    process.exit(1);
  }
  return Math.min(n, all);
}

type CaseRecord = {
  id: string;
  text: string;
  latencyMs: number;
  requests: number;
  failure: string | null;
  reportedModel: string | null;
  usage: {
    input: number;
    cached: number;
    output: number;
    costMicros: number | null;
  } | null;
  command: unknown;
  assessment: OwnerCaseAssessment;
};

export async function main() {
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
  const cases = ownerCorpus.slice(0, limitArg());
  const maxRequests = cases.length * (1 + settings.maxRetries);
  const endpoint = new URL(
    process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  ).host;
  const schemaHash = createHash("sha256")
    .update(JSON.stringify(ownerCommandFormat.schema))
    .digest("hex")
    .slice(0, 12);
  const price = priceFor(settings.model);

  console.log(`
  Live owner-command evaluation. Real API usage: this costs money.
    OPENAI_API_KEY configured  yes
    Endpoint                   ${endpoint}
    Model                      ${settings.model}
    Reasoning effort           ${settings.reasoningEffort ?? "model default"}
    Prompt version             ${OWNER_PROMPT_VERSION}
    Schema                     ${ownerCommandFormat.name} ${schemaHash}
    Cases                      ${cases.length}
    Maximum API requests       ${maxRequests}
`);

  let requests = 0;
  const countingFetch: typeof fetch = async (input, init) => {
    requests++;
    if (requests > maxRequests) {
      throw new Error(`Request cap reached (${maxRequests}).`);
    }
    return fetch(input, init);
  };
  const interpreter = new OpenAIOwnerInterpreter({
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
      stopped = `Request cap reached (${maxRequests}) before ${testCase.id}.`;
      break;
    }
    const before = requests;
    const t0 = performance.now();
    const result: OwnerInterpreterResult = await interpreter.interpret(
      ownerRequestFor(testCase),
    );
    const latencyMs = Math.round(performance.now() - t0);
    const used = requests - before;
    const cost = result.usage ? estimateCost(result.usage) : null;
    const assessment = assessOwnerCase(
      testCase,
      result.ok
        ? { ok: true, command: result.command }
        : { ok: false, failure: result.failure },
    );
    records.push({
      id: testCase.id,
      text: testCase.text,
      latencyMs,
      requests: used,
      failure: result.ok ? null : result.failure,
      reportedModel: result.usage?.model ?? null,
      usage: result.usage
        ? {
            input: result.usage.inputTokens,
            cached: result.usage.cachedInputTokens,
            output: result.usage.outputTokens,
            costMicros: cost?.micros ?? null,
          }
        : null,
      command: result.ok ? result.command : null,
      assessment,
    });
    const mark = assessment.severity?.toUpperCase() ?? "ok";
    console.log(
      `  ${mark.padEnd(9)} ${testCase.id.padEnd(10)} ${String(latencyMs).padStart(5)} ms  ${used} req${assessment.reasons.length ? `  ${assessment.reasons.join("; ")}` : ""}`,
    );
    if (
      records.length === EARLY_PROVIDER_FAILURES &&
      records.every((r) => r.assessment.structured === "provider_error")
    ) {
      stopped = `The first ${EARLY_PROVIDER_FAILURES} cases failed at the provider.`;
      break;
    }
  }
  const wallMs = Date.now() - started;

  const all = records.map((r) => r.assessment);
  const tally = (pick: (x: OwnerCaseAssessment) => boolean | null) => {
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
    clarification: tally((x) => x.criteria.clarification),
    outcome: tally((x) => x.criteria.outcome),
    sameEffect: tally((x) => x.criteria.sameEffect),
    pass: tally((x) => x.pass),
  };
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
  const latencies = records.map((r) => r.latencyMs).sort((x, y) => x - y);
  const metered = records.filter((r) => r.usage);
  const sum = (pick: (u: NonNullable<CaseRecord["usage"]>) => number) =>
    metered.reduce((total, r) => total + pick(r.usage!), 0);
  const tokens = {
    input: sum((u) => u.input),
    cached: sum((u) => u.cached),
    output: sum((u) => u.output),
  };
  const priced =
    metered.length > 0 && metered.every((r) => r.usage!.costMicros !== null);
  const totalMicros = priced ? sum((u) => u.costMicros!) : null;
  const perMessageMicros =
    totalMicros !== null ? totalMicros / metered.length : null;

  const summary = {
    cases: { planned: cases.length, run: records.length },
    requests: {
      actual: requests,
      retried: Math.max(0, requests - records.length),
      cap: maxRequests,
    },
    stopped,
    criteria,
    structured,
    severity,
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
    },
    cost: {
      currency: "USD",
      totalMicros,
      averagePerMessageMicros: perMessageMicros,
    },
  };

  const timestamp = new Date().toISOString();
  const dir = join("results", "ai-evals");
  mkdirSync(dir, { recursive: true });
  const file = join(
    dir,
    `${timestamp.replace(/[:.]/g, "-")}-owner-${settings.model}.json`,
  );
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        kind: "pingflow-owner-eval",
        timestamp,
        git: git(),
        endpoint,
        model: settings.model,
        reportedModels: [...new Set(records.map((r) => r.reportedModel))],
        promptVersion: OWNER_PROMPT_VERSION,
        schema: { name: ownerCommandFormat.name, hash: schemaHash },
        settings: {
          reasoningEffort: settings.reasoningEffort,
          maxOutputTokens: settings.maxOutputTokens,
          timeoutMs: settings.timeoutMs,
          maxRetries: settings.maxRetries,
        },
        price,
        summary,
        cases: records,
      },
      null,
      2,
    )}\n`,
  );

  const pct = (c: { correct: number; of: number }) =>
    c.of
      ? `${c.correct}/${c.of} (${Math.round((100 * c.correct) / c.of)}%)`
      : "n/a";
  console.log(`
  ${stopped ? `STOPPED: ${stopped}\n  ` : ""}Requests      ${records.length} cases, ${requests} API requests, ${summary.requests.retried} retried
  Intent        ${pct(criteria.intent)}
  Date          ${pct(criteria.date)}
  Time          ${pct(criteria.time)}
  Person        ${pct(criteria.person)}
  Clarification ${pct(criteria.clarification)}
  Outcome       ${pct(criteria.outcome)}; same effect ${pct(criteria.sameEffect)}
  Structured    ${structured.valid} valid, ${structured.refused} refused, ${structured.incomplete} incomplete, ${structured.malformed} malformed, ${structured.providerErrors} provider errors
  Severity      ${severity.critical.length} critical [${severity.critical.join(", ")}]; ${severity.important.length} important [${severity.important.join(", ")}]; ${severity.minor.length} minor
  Latency       min ${summary.latencyMs.min} ms, p50 ${summary.latencyMs.p50} ms, p95 ${summary.latencyMs.p95} ms, max ${summary.latencyMs.max} ms
  Tokens        ${tokens.input} in (${tokens.cached} cached), ${tokens.output} out; per case ${summary.tokens.averageInput.toFixed(0)} in, ${summary.tokens.averageOutput.toFixed(0)} out
  Cost          ${totalMicros === null ? "unknown: no listed price" : `${dollars(totalMicros)} in all, ${dollars(perMessageMicros!)} per message`}
  Saved         ${file}
`);
  if (stopped) process.exit(2);
}
