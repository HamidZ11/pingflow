// How the app talks to Supabase when something goes wrong.
//
// Reads (GET/HEAD) that fail for a reason that might pass on its own, such
// as a dropped connection, a timeout, or a 502/503/504/520 from the gateway,
// are tried again, briefly: at most two more times, a short randomised pause
// apart, and never beyond an overall time budget. After that the page shows
// its error screen, so nobody stares at a hanging page.
//
// Writes (POST/PATCH/DELETE, including every database function) are never
// retried here: repeating one could apply it twice. They fail once, cleanly,
// and the database functions are written so a repeat by the owner is safe
// (for example, an approval that already happened is refused).
//
// Everything else (4xx: signed out, not allowed, invalid) is returned as is,
// immediately. Retrying wouldn't change the answer.

export type RetryPolicy = {
  /** Retries after the first attempt. */
  retries: number;
  /** Pause before the first retry; doubles each time, plus jitter. */
  baseDelayMs: number;
  /** Give up on a single attempt after this long. */
  attemptTimeoutMs: number;
  /** Give up altogether after this long, whatever is left. */
  totalBudgetMs: number;
};

export const defaultRetryPolicy: RetryPolicy = {
  retries: 2,
  baseDelayMs: 250,
  attemptTimeoutMs: 2000,
  totalBudgetMs: 4000,
};

const retryableStatuses = new Set([502, 503, 504, 520]);
const idempotentMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function isRetryableStatus(status: number): boolean {
  return retryableStatuses.has(status);
}

export function isIdempotent(method: string | undefined): boolean {
  return idempotentMethods.has((method ?? "GET").toUpperCase());
}

type Deps = {
  fetch: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
  policy?: RetryPolicy;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function methodOf(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method;
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method;
  }
  return "GET";
}

export function createBoundedFetch({
  fetch: baseFetch,
  sleep = defaultSleep,
  now = Date.now,
  random = Math.random,
  policy = defaultRetryPolicy,
}: Deps): typeof fetch {
  return async (input, init) => {
    const retryable = isIdempotent(methodOf(input, init));
    const started = now();
    let attempt = 0;

    while (true) {
      const remaining = policy.totalBudgetMs - (now() - started);
      const timeout = AbortSignal.timeout(
        Math.max(1, Math.min(policy.attemptTimeoutMs, remaining)),
      );
      const signal = init?.signal
        ? AbortSignal.any([init.signal, timeout])
        : timeout;

      let failure: unknown;
      try {
        const response = await baseFetch(input, { ...init, signal });
        if (!retryable || !isRetryableStatus(response.status)) return response;
        failure = response;
      } catch (error) {
        // The caller cancelled: stop, don't retry.
        if (init?.signal?.aborted) throw error;
        if (!retryable) throw error;
        failure = error;
      }

      const delay = policy.baseDelayMs * 2 ** attempt * (0.75 + random() * 0.5);
      const outOfTime = now() - started + delay >= policy.totalBudgetMs - 250;
      if (attempt >= policy.retries || outOfTime) {
        if (failure instanceof Response) return failure;
        throw failure;
      }
      if (failure instanceof Response) {
        // Free the connection before trying again.
        await failure.body?.cancel().catch(() => {});
      }
      attempt++;
      await sleep(delay);
    }
  };
}
