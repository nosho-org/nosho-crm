import * as Sentry from "@sentry/react";
import type { ReactNode } from "react";
import { Error } from "@/components/admin/error";

/**
 * The app's single error boundary.
 *
 * It has to be Sentry's own, not a plain `react-error-boundary`: a boundary
 * that catches without rethrowing ends the error's journey. React treats an
 * error caught by a boundary as handled and only `console.error`s it — no
 * `reportError`, so no `window.onerror` — and `src/sentry.ts` enables only
 * browserTracing and replay, with no captureConsole integration and no manual
 * `captureException` anywhere in the app.
 *
 * The layouts used to nest a plain `<ErrorBoundary>` *inside* this one. The
 * inner boundary won every time, so nothing ever reached Sentry: issue #109
 * blanked the deal page for a day and left no trace to read.
 *
 * The fallback is the same `<Error>` the plain boundary rendered, so the user
 * sees exactly what it always did.
 */
export const SentryErrorBoundary = Sentry.withErrorBoundary(
  ({ children }: { children: ReactNode }) => <>{children}</>,
  {
    fallback: ({ error, resetError }) => (
      <Error error={error} resetErrorBoundary={resetError} />
    ),
  },
);
