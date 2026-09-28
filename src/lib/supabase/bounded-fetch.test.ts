import { describe, expect, it, vi } from "vitest";
import {
  createBoundedFetch,
  defaultRetryPolicy,
} from "@/lib/supabase/bounded-fetch";

// A fake clock and sleep, so the tests measure the policy, not real time.
function harness(responses: (number | Error)[]) {
  let clock = 0;
  const sleeps: number[] = [];
  const calls: string[] = [];
  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(init?.method ?? "GET");
    const next = responses.shift() ?? 200;
    if (next instanceof Error) throw next;
    return new Response(null, { status: next });
  });
  const bounded = createBoundedFetch({
    fetch: fetch as unknown as typeof globalThis.fetch,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    random: () => 0.5,
  });
  return { bounded, fetch, sleeps, calls };
}

describe("retrying reads that might succeed next time", () => {
  it("tries a failed read again and returns the recovery", async () => {
    const { bounded, fetch } = harness([503, 200]);
    const response = await bounded("http://db/rest/v1/bookings");
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries network errors and gateway failures, at most twice", async () => {
    const { bounded, fetch } = harness([
      new TypeError("fetch failed"),
      502,
      504,
      200,
    ]);
    const response = await bounded("http://db/rest/v1/bookings");
    expect(response.status).toBe(504);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("keeps the whole thing to a couple of seconds", async () => {
    const { bounded, sleeps } = harness([503, 503, 503]);
    await bounded("http://db/rest/v1/bookings");
    const waited = sleeps.reduce((a, b) => a + b, 0);
    expect(sleeps).toEqual([250, 500]);
    expect(waited).toBeLessThan(defaultRetryPolicy.totalBudgetMs);
    expect(waited).toBeLessThan(1000);
  });

  it("gives up with the error once retries run out", async () => {
    const { bounded, fetch } = harness([
      new TypeError("fetch failed"),
      new TypeError("fetch failed"),
      new TypeError("fetch failed"),
    ]);
    await expect(bounded("http://db/rest/v1/bookings")).rejects.toThrow(
      "fetch failed",
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

describe("not retrying what a retry can't fix, or mustn't repeat", () => {
  it("returns client errors straight away", async () => {
    for (const status of [400, 401, 403, 404, 409]) {
      const { bounded, fetch } = harness([status]);
      const response = await bounded("http://db/rest/v1/bookings");
      expect(response.status).toBe(status);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it("never repeats a write, even after a server error", async () => {
    for (const method of ["POST", "PATCH", "DELETE"]) {
      const { bounded, fetch } = harness([503]);
      const response = await bounded("http://db/rest/v1/rpc/resolve", {
        method,
      });
      expect(response.status).toBe(503);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it("never repeats a write after a network error", async () => {
    const { bounded, fetch } = harness([new TypeError("fetch failed")]);
    await expect(
      bounded("http://db/rest/v1/rpc/resolve", { method: "POST" }),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stops when the caller cancels", async () => {
    const controller = new AbortController();
    const fetch = vi.fn(async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    const bounded = createBoundedFetch({
      fetch: fetch as unknown as typeof globalThis.fetch,
      sleep: async () => {},
    });
    await expect(
      bounded("http://db/rest/v1/bookings", { signal: controller.signal }),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("gives every attempt a time limit", async () => {
    const seen: (AbortSignal | null | undefined)[] = [];
    const fetch = vi.fn(async (_i: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init?.signal);
      return new Response(null, { status: 200 });
    });
    const bounded = createBoundedFetch({
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    await bounded("http://db/rest/v1/bookings");
    expect(seen[0]).toBeInstanceOf(AbortSignal);
  });
});
