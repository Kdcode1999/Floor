import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Two kinds of test:
// - supabase/tests: the database rules. They apply the migrations in supabase/migrations to an
//   in-memory Postgres and check who can do what.
// - tests: the web app's plain logic.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["supabase/tests/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
