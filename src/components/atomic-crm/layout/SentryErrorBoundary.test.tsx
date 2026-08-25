import * as Sentry from "@sentry/react";
import { render } from "vitest-browser-react";
import { CoreAdminContext, testDataProvider } from "ra-core";
import { MemoryRouter } from "react-router-dom";

import { SentryErrorBoundary } from "./SentryErrorBoundary";

/**
 * The layouts used to nest a plain `react-error-boundary` inside the Sentry
 * one. The inner boundary caught first and never rethrew, so Sentry saw
 * nothing: issue #109 blanked the deal page for a day with no stack to read.
 *
 * The regression is invisible to the user — the fallback looked identical —
 * so it has to be pinned by asserting the capture itself.
 */

const Boom = () => {
  throw new Error("boom from render");
};

const renderBoundary = (children: React.ReactNode) =>
  render(
    <MemoryRouter>
      <CoreAdminContext dataProvider={testDataProvider()}>
        <SentryErrorBoundary>{children}</SentryErrorBoundary>
      </CoreAdminContext>
    </MemoryRouter>,
  );

describe("SentryErrorBoundary", () => {
  let events: Sentry.ErrorEvent[] = [];

  beforeEach(() => {
    events = [];
    Sentry.init({
      dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
      // Record and drop: returning null keeps the event off the network.
      beforeSend: (event) => {
        events.push(event);
        return null;
      },
    });
  });

  afterEach(async () => {
    await Sentry.close();
  });

  it("renders children when nothing throws", async () => {
    const screen = await renderBoundary(<p>tout va bien</p>);

    await expect.element(screen.getByText("tout va bien")).toBeVisible();
    expect(events).toHaveLength(0);
  });

  it("reports the error to Sentry and shows the fallback", async () => {
    const screen = await renderBoundary(<Boom />);

    // What the user sees is unchanged: the same <Error> page as before.
    await expect.element(screen.getByRole("alert")).toBeVisible();

    // What changed: the error now actually reaches Sentry.
    await vi.waitFor(() => expect(events.length).toBeGreaterThan(0));
    expect(JSON.stringify(events[0])).toContain("boom from render");
  });
});
