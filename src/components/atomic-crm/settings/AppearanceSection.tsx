import { Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useSkin } from "@/components/admin/use-skin";

import { SKINS, type CrmSkin } from "../root/skins";

/**
 * A sketch of what each skin does to the Opportunités screen: the shape of the
 * figures, then the inactivity block underneath.
 *
 * Radii are inline literals rather than tokens on purpose — the preview must
 * look the same whichever skin is currently applied to the page around it.
 */
const SkinPreview = ({ skin }: { skin: CrmSkin }) => {
  if (skin === "dense") {
    return (
      <div className="flex flex-col gap-1">
        <div
          className="grid grid-cols-3 divide-x border bg-card overflow-hidden"
          style={{ borderRadius: 3 }}
        >
          {[0, 1, 2].map((group) => (
            <div key={group} className="flex flex-col gap-1 p-1.5">
              <div className="h-1 w-3/5 bg-muted-foreground/40" />
              <div className="h-2.5 w-full bg-muted-foreground/15" />
            </div>
          ))}
        </div>
        <div
          className="h-7 border bg-card"
          style={{ borderRadius: 3, borderLeftWidth: 2 }}
        />
      </div>
    );
  }

  if (skin === "calme") {
    return (
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((panel) => (
            <div
              key={panel}
              className="h-10 bg-card shadow-sm"
              style={{ borderRadius: 10 }}
            />
          ))}
        </div>
        <div
          className="h-6 bg-[var(--deal-status-warning)]/15"
          style={{ borderRadius: 10 }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-3 gap-1.5">
        {[0, 1, 2, 3, 4, 5].map((tile) => (
          <div
            key={tile}
            className="h-5 border bg-card"
            style={{ borderRadius: 6 }}
          />
        ))}
      </div>
      <div
        className="h-7 border border-[var(--deal-status-warning)]/50 bg-[var(--deal-status-warning)]/10"
        style={{ borderRadius: 6 }}
      />
    </div>
  );
};

/**
 * The skin picker. This is a personal display preference, stored per user in
 * the browser — unlike everything else on this page, it is not part of the
 * shared configuration record and applies the moment it is clicked, with
 * nothing to save.
 */
export const AppearanceSection = () => {
  const { skin: activeSkin, setSkin } = useSkin();

  return (
    <Card id="appearance">
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-muted-foreground">
            Apparence
          </h2>
          <p className="text-sm text-muted-foreground">
            Le style de l&apos;interface. Ce choix vous est propre : il est
            enregistré sur ce navigateur et ne change rien pour vos collègues.
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="Style de l'interface"
          className="grid gap-3 sm:grid-cols-3"
        >
          {SKINS.map((skin) => {
            const selected = skin.value === activeSkin;
            return (
              <button
                key={skin.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setSkin(skin.value)}
                className={`flex flex-col gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 ${
                  selected ? "border-ring ring-2 ring-ring/40" : "border-border"
                }`}
              >
                <div className="rounded-md bg-muted/60 p-2">
                  <SkinPreview skin={skin.value} />
                </div>
                <div className="space-y-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {skin.label}
                    {selected && (
                      <Check className="w-3.5 h-3.5 text-[var(--nosho-green-dark)]" />
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground leading-snug">
                    {skin.description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
