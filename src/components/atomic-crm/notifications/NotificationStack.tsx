import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Bell, Info, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AnimatedListItem } from "@/components/ui/motion";

import {
  type AppNotification,
  type NotificationSeverity,
  applyDismissals,
  readDismissed,
  sortNotifications,
  writeDismissed,
} from "./notifications";

/**
 * ---------------------------------------------------------------------------
 * La pile de notifications (NOS-1172)
 * ---------------------------------------------------------------------------
 * Remplace la carte « À faire maintenant » et la bande « Ma journée », qui
 * occupaient chacune une pleine largeur pour une phrase.
 *
 * ## Elles se ferment, et reviennent demain
 *
 * Voir `notifications.ts` : ce ne sont pas des événements mais des états
 * dérivés de la donnée. Fermer vaut pour la journée.
 *
 * ## Trois au maximum
 *
 * Au-delà, ce n'est plus une notification mais une liste — et l'écran en a
 * déjà une, juste en dessous, qui est faite pour ça. Le compte des suivantes
 * est écrit, sans les déplier : savoir qu'il en reste suffit à aller voir.
 */

const SEVERITY_STYLES: Record<
  NotificationSeverity,
  { border: string; icon: React.ReactNode; text: string }
> = {
  action: {
    border: "border-l-4 border-l-[var(--deal-series-potential)]",
    text: "text-[var(--deal-series-potential)]",
    icon: <Zap className="w-3.5 h-3.5" aria-hidden />,
  },
  warning: {
    border: "border-l-4 border-l-[var(--deal-status-warning)]",
    text: "text-[var(--deal-status-warning)]",
    icon: <AlertTriangle className="w-3.5 h-3.5" aria-hidden />,
  },
  info: {
    border: "border-l-4 border-l-border",
    text: "text-muted-foreground",
    icon: <Info className="w-3.5 h-3.5" aria-hidden />,
  },
};

const MAX_SHOWN = 3;

export const NotificationStack = ({
  notifications,
}: {
  notifications: AppNotification[];
}) => {
  /*
   * L'état des fermetures est en mémoire ET en `localStorage`.
   *
   * En mémoire pour que la disparition soit immédiate ; en stockage pour
   * qu'elle survive à un rechargement. Relire le stockage à chaque rendu
   * coûterait un accès disque par image.
   */
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    readDismissed(),
  );

  const dismiss = useCallback((key: string) => {
    writeDismissed(key);
    setDismissed((current) => new Set(current).add(key));
  }, []);

  const visible = useMemo(
    () => sortNotifications(applyDismissals(notifications, dismissed)),
    [notifications, dismissed],
  );

  if (visible.length === 0) return null;

  const shown = visible.slice(0, MAX_SHOWN);
  const hidden = visible.length - shown.length;

  return (
    <section aria-label="Notifications" className="flex flex-col gap-2">
      {shown.map((notification, index) => {
        const style = SEVERITY_STYLES[notification.severity];
        return (
          <AnimatedListItem key={notification.id} index={index}>
            <Card className={`p-3 flex items-start gap-3 ${style.border}`}>
              <span className={`mt-0.5 shrink-0 ${style.text}`}>
                {style.icon}
              </span>

              <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {notification.title}
                </span>
                {notification.body && (
                  <span className="text-sm text-muted-foreground">
                    {notification.body}
                  </span>
                )}
                {notification.detail && (
                  /* Le détail chiffré — le score, le calcul — en mono : il se
                     lit comme une justification, pas comme une phrase. */
                  <span className="text-xs text-muted-foreground font-mono">
                    {notification.detail}
                  </span>
                )}
              </div>

              {notification.to && (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                >
                  <Link to={notification.to}>
                    {notification.actionLabel ?? "Ouvrir"}
                  </Link>
                </Button>
              )}

              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                onClick={() => dismiss(notification.dismissKey)}
                aria-label={`Masquer pour aujourd'hui : ${notification.title}`}
                title="Masquer pour aujourd'hui"
              >
                <X className="w-3.5 h-3.5" aria-hidden />
              </Button>
            </Card>
          </AnimatedListItem>
        );
      })}

      {hidden > 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Bell className="w-3 h-3" aria-hidden />
          {hidden} autre{hidden > 1 ? "s" : ""} notification
          {hidden > 1 ? "s" : ""} — traitez celles-ci d'abord.
        </p>
      )}
    </section>
  );
};
