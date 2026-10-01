import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Shared by the live evaluations (scripts/ai-eval.ts, ai-eval-owner.ts).

/** Which code the run used: the commit, plus a hash of uncommitted work. */
export function git() {
  const run = (cmd: string) => {
    try {
      return execSync(cmd, { encoding: "utf8", maxBuffer: 64 << 20 }).trim();
    } catch {
      return "";
    }
  };
  const untracked = run("git ls-files --others --exclude-standard")
    .split("\n")
    .filter(Boolean);
  const hash = createHash("sha256").update(run("git diff HEAD"));
  for (const file of untracked) {
    hash.update(file);
    try {
      hash.update(readFileSync(file));
    } catch {
      // Unreadable: its name is enough.
    }
  }
  return {
    commit: run("git rev-parse HEAD"),
    branch: run("git branch --show-current"),
    changedFiles: run("git status --porcelain").split("\n").filter(Boolean)
      .length,
    workingTree: hash.digest("hex").slice(0, 16),
  };
}

/** Nearest-rank percentile of sorted values. */
export const percentile = (sorted: number[], p: number) =>
  sorted.length
    ? sorted[
        Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
      ]
    : 0;

export const dollars = (micros: number) =>
  `$${(micros / 1_000_000).toFixed(6)}`;
