import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Tests cover the app's plain logic: files with no phone code in them. Screens are checked by
// walking the app (see checks/).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["tests/**/*.test.ts"] },
});
