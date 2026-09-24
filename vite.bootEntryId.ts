import type { Plugin } from "vite";

/**
 * Re-adds `id="app-entry"` to the entry <script> after Vite rewrites it.
 *
 * Vite re-emits that tag from scratch when it swaps the source path for the
 * hashed chunk, dropping every attribute index.html declared on it — `id`
 * included. The out-of-bundle boot watchdog matches on that id to tell the real
 * entry apart from /@vite/client and any other module script, so it has to be
 * put back after the rewrite.
 *
 * Losing it silently is the worst outcome available here: the watchdog stays
 * installed but deaf, and the next deploy that deletes a bundle goes unreported
 * exactly like before it existed. Hence the assertion below — a build that
 * cannot mark the entry fails instead of shipping a watchdog that cannot fire.
 */
export function bootEntryIdPlugin(): Plugin {
  return {
    name: "nosho-boot-entry-id",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        let tagged = false;
        const out = html.replace(
          /<script\s([^>]*)>/g,
          (tag: string, attrs: string) => {
            if (tagged) return tag;
            const padded = ` ${attrs}`;
            if (!/\stype="module"/.test(padded)) return tag;
            // The dev server keeps the attributes index.html declared, so the
            // entry arrives already marked; only the build strips them. Claim
            // it anyway, or the search would run on and mark a later script.
            if (/\sid="app-entry"/.test(padded)) {
              tagged = true;
              return tag;
            }
            const src = /\ssrc="([^"]*)"/.exec(padded)?.[1];
            // Injected by the dev server, and always before the entry.
            if (!src || src.startsWith("/@vite/")) return tag;
            tagged = true;
            return `<script id="app-entry" ${attrs}>`;
          },
        );
        if (!tagged) {
          throw new Error(
            '[nosho-boot-entry-id] no entry <script type="module" src="…"> found ' +
              "in index.html — the boot watchdog would never recognise a failed boot.",
          );
        }
        return out;
      },
    },
  };
}
