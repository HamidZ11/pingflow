import { describe, expect, it } from "vitest";
import { ownerCommand } from "@/domain/owner/command";
import { ownerCorpus } from "@/domain/owner/fixtures/corpus";
import { assessOwnerCase } from "@/domain/owner/fixtures/harness";

const byId = (id: string) => ownerCorpus.find((c) => c.id === id)!;

describe("the owner evaluation harness", () => {
  it("passes every gold reading with the same effect", () => {
    for (const c of ownerCorpus) {
      const a = assessOwnerCase(c, { ok: true, command: c.gold });
      expect(a, c.id).toMatchObject({ pass: true, severity: null });
      expect(a.criteria.sameEffect, c.id).toBe(true);
    }
  });

  it("calls a different change critical", () => {
    const c = byId("cancel-1");
    const a = assessOwnerCase(c, {
      ok: true,
      command: ownerCommand({ ...c.gold, person: "Omar" }),
    });
    expect(a.severity).toBe("critical");
  });

  it("calls a wrong answer important, and no reading important", () => {
    const c = byId("sched-1");
    const wrongDay = assessOwnerCase(c, {
      ok: true,
      command: ownerCommand({
        ...c.gold,
        date: {
          kind: "today",
          weekday: null,
          week: null,
          day: null,
          month: null,
        },
      }),
    });
    expect(wrongDay.severity).toBe("important");
    expect(assessOwnerCase(c, { ok: false, failure: "timeout" })).toMatchObject(
      {
        structured: "provider_error",
        severity: "important",
      },
    );
  });
});
