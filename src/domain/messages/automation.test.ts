import { describe, expect, it } from "vitest";
import { automationCorpus } from "@/domain/messages/fixtures/automation-corpus";
import { policyInputFor } from "@/domain/messages/fixtures/harness";
import { decide } from "@/domain/messages/policy";

describe("every automation corpus message reaches the expected outcome", () => {
  it.each(automationCorpus.map((c) => [c.id, c] as const))(
    "%s",
    (_id, testCase) => {
      const decision = decide(policyInputFor(testCase, testCase.gold));
      expect(decision.outcome, decision.reason).toBe(testCase.expected.outcome);
    },
  );
});
