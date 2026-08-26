import path from "node:path";
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    browser: {
      provider: playwright(),
      enabled: true,
      instances: [
        {
          browser: "chromium",
          ...(process.env.CI && {
            launch: { channel: "chromium-headless-shell" },
          }),
        },
      ],
      commands: {
        // Uses Chrome DevTools Protocol to override the timezone at runtime,
        // since process.env.TZ has no effect in a real browser environment.
        async setTimezone({ context, page }, timezoneId: string) {
          const session = await context.newCDPSession(page);
          await session.send("Emulation.setTimezoneOverride", { timezoneId });
          await session.detach();
        },
      },
    },
    exclude: [
      "**/node_modules/**",
      "doc/**",
      "supabase/**",
      ".supabase-e2e/**",
      "e2e/**/*.spec.{ts,tsx}",
    ],
    server: {
      deps: {
        external: [/playwright/],
      },
    },
  },
  optimizeDeps: {
    exclude: ["playwright", "playwright-core"],
    // Pre-bundle these instead of letting Vite discover them mid-run. When a
    // test is the first to import one, Vite optimizes it and reloads the page,
    // which remounts React under the running suite — the component tests then
    // fail with "Cannot read properties of null (reading 'useRef')". Only on a
    // cold cache, so it reproduces in CI and almost never locally.
    include: ["@tanstack/react-query", "date-fns"],
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `vite-plugin-pwa` only runs through vite.config.ts, so its virtual
      // module does not exist here. Without this alias every test that reaches
      // <CRM> (via useVersionCheck) fails to load. See the stub for details.
      "virtual:pwa-register/react": path.resolve(
        __dirname,
        "./src/test/stubs/pwa-register-react.ts",
      ),
    },
  },
});
