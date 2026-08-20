import path from "node:path";
import { defineConfig } from "vitest/config";

// Separate config for Supabase Edge Function tests.
// These files are written for Deno and use JSR imports (jsr:@supabase/supabase-js@2)
// that Vite cannot resolve. We alias jsr: imports to their npm equivalents so
// Vitest can run the tests in a Node environment without a Deno runtime.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["supabase/functions/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      ".supabase-e2e/**",
      // generate-proposal's tests are written against the Deno runtime itself
      // (Deno.test + jsr:@std/assert). Aliasing those imports is not enough —
      // there is no Deno global here — so they are owned by the Deno runner
      // instead: `make test-edge-functions`.
      "supabase/functions/generate-proposal/**",
    ],
  },
  resolve: {
    alias: {
      // Map Deno-style imports to installed npm packages
      "jsr:@supabase/supabase-js@2": path.resolve(
        __dirname,
        "node_modules/@supabase/supabase-js",
      ),
      "npm:pgsql-ast-parser@^12": "pgsql-ast-parser",
    },
  },
});
