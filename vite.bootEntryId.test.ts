import { bootEntryIdPlugin } from "./vite.bootEntryId.ts";

/**
 * The boot watchdog in index.html recognises a failed boot by matching the
 * failing <script> against `id="app-entry"`. Vite re-emits that tag from
 * scratch when it swaps in the hashed chunk and keeps none of the attributes
 * index.html declared — so the id is re-added here, after the rewrite.
 *
 * The regression this pins is silent by construction: without the id the
 * watchdog still installs, still runs, and simply never fires again. Nothing
 * in the built output looks wrong. So assert the tagging itself, and assert
 * that a template it cannot tag fails the build instead of shipping.
 */

const transform = (html: string) => {
  const plugin = bootEntryIdPlugin();
  const hook = plugin.transformIndexHtml;
  if (typeof hook !== "object" || typeof hook.handler !== "function") {
    throw new Error("transformIndexHtml must expose an ordered handler");
  }
  return hook.handler.call(
    null as never,
    html,
    null as never,
  ) as unknown as string;
};

describe("bootEntryIdPlugin", () => {
  it("tags the hashed entry Vite emits at build time", () => {
    const out = transform(
      '<script type="module" crossorigin src="./assets/index-CBgRzrCv.js"></script>',
    );

    expect(out).toBe(
      '<script id="app-entry" type="module" crossorigin src="./assets/index-CBgRzrCv.js"></script>',
    );
  });

  it("tags the real entry and not the dev client Vite injects before it", () => {
    const out = transform(
      '<head><script type="module" src="/@vite/client"></script>' +
        '<script type="module">import R from "/@react-refresh"</script></head>' +
        '<body><script type="module" src="/src/main.tsx"></script></body>',
    );

    expect(out).toContain('<script type="module" src="/@vite/client">');
    expect(out).toContain(
      '<script id="app-entry" type="module" src="/src/main.tsx">',
    );
    expect(out.match(/id="app-entry"/g)).toHaveLength(1);
  });

  it("does not re-tag an entry the dev server already delivered marked", () => {
    const out = transform(
      '<script type="module" src="/@vite/client"></script>' +
        '<script id="app-entry" type="module" src="/src/main.tsx"></script>' +
        '<script type="module" src="/other.js"></script>',
    );

    expect(out.match(/id="app-entry"/g)).toHaveLength(1);
    expect(out).toContain('<script type="module" src="/other.js">');
  });

  it("leaves classic (non-module) scripts alone", () => {
    const out = transform(
      '<script src="/legacy.js"></script>' +
        '<script type="module" src="/app.js"></script>',
    );

    expect(out).toContain('<script src="/legacy.js"></script>');
    expect(out).toContain(
      '<script id="app-entry" type="module" src="/app.js">',
    );
  });

  it("fails the build rather than emit a watchdog that cannot fire", () => {
    expect(() =>
      transform("<body><script>/* watchdog, no entry */</script></body>"),
    ).toThrow(/no entry <script/);
  });
});
