import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for the domain layer (availability, time, approvals). They run
// in Node with no database; end-to-end tests live in e2e/ (Playwright).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
