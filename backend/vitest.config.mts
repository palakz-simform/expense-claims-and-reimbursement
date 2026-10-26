import { defineConfig } from "vitest/config";

// Tests always run against the Neon `test` branch: NODE_ENV=test makes src/config/env.ts read .env.test
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent"; // keep the test output readable: no request log lines

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/globalSetup.ts"], // refuses to run against the wrong database
    // Every query is a network round trip to Neon, so allow plenty of time
    testTimeout: 120_000,
    hookTimeout: 60_000,
    // One file at a time: simpler, and the tests share one database
    fileParallelism: false,
  },
});
