import * as Sentry from "@sentry/react";

// En dev, les erreurs sont deja dans la console et dans l'overlay Vite : les
// envoyer en plus au projet de prod n'apporte rien et y noie les vraies
// alertes sous le bruit de toutes les machines de dev (NOSHO-CRM-W).
// PROD couvre tout `vite build`, previews Coolify comprises, et reste faux
// sous Vitest.
if (import.meta.env.PROD) {
  Sentry.init({
    dsn:
      import.meta.env.VITE_SENTRY_DSN ||
      "https://a318a734cf9c27db5f2b890b5688b1a0@o4510487498588160.ingest.de.sentry.io/4511047848427600",
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}
