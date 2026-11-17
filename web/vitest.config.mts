import { defineConfig } from "vitest/config";

// Database rule tests. They apply the migrations in supabase/migrations to an in-memory
// Postgres and check who can do what.
export default defineConfig({
  test: {
    include: ["supabase/tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
