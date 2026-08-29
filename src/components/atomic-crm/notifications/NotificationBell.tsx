import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Bell, Info, X, Zap } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  type AppNotification,
  type NotificationSeverity,
  applyDismissals,
  readDismissed,
  sortNotifications,
  writeDismissed,
} from "./notifications";
import { useAppNotifications } from "./useAppNotifications";

/**
 * ---------------------------------------------------------------------------
 * La cloche de notifications (NOS-1172)
 * ---------------------------------------------------------------------------
 * Remplace la pile de cartes du tableau de bord. Celle-ci prenait la moitié de
 * l'écran pour trois phrases — et, plus bêtement, rendait de travers : le
 * `<Card>` de shadcn porte `flex-col gap-6 py-6`, que la classe `flex
 * items-start gap-3` ne pouvait pas défaire. D'où des boutons empilés sur
 * trois lignes.
 *
 * Ici, plus de `<Card>` du tout : des lignes de liste dans un popover.
 *
 * ## Elle s'ouvre seule, une fois par session
 *
 * « À chaque ouverture du CRM » : à l'arrivée sur l'application, pas à chaque
 * changement de page. D'où `sessionStorage` et non un état de composant —
 * l'en-tête se remonte à chaque navigation, et la cloche se rouvrirait à
 * chaque clic.
 *
 * Elle ne s'ouvre pas quand il n'y a rien à dire : un popover vide qui
 * s'affiche tout seul est une interruption sans contenu.
 */

const OPENED_KEY = "nosho.notifications.opened";

const SEVERITY: Record<
  NotificationSeverity,
  { icon: React.ReactNode; className: string }
> = {
  action: {
    icon: <Zap className="w-3.5 h-3.5" aria-hidden />,
    className: "text-[var(--deal-series-potential)]",
  },
  warning: {
    icon: <AlertTriangle className="w-3.5 h-3.5" aria-hidden />,
    className: "text-[var(--deal-status-warning)]",
  },
  info: {
    icon: <Info className="w-3.5 h-3.5" aria-hidden />,
    className: "text-muted-foreground",
  },
};

const NotificationRow = ({
  notification,
  onOpen,
  onDismiss,
}: {
  notification: AppNotification;
  onOpen: () => void;
  onDismiss: () => void;
}) => {
  const style = SEVERITY[notification.severity];

  const content = (
    <>
      <span className={`mt-0.5 shrink-0 ${style.className}`}>{style.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium leading-snug truncate">
          {notification.title}
        </span>
        {notification.body && (
          <span className="block text-[11px] text-muted-foreground leading-snug truncate">
            {notification.body}
          </span>
        )}
        {notification.detail && (
          /* Le calcul, en mono : il se lit comme une justification, pas comme
             une phrase. C'est lui qui rend le classement contestable. */
          <span className="block text-[10px] text-muted-foreground/80 font-mono leading-snug truncate">
            {notification.detail}
          </span>
        )}
      </span>
    </>
  );

  return (
    <li className="group flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-accent">
      {notification.to ? (
        <Link
          to={notification.to}
          onClick={onOpen}
          className="flex items-start gap-2 min-w-0 flex-1 no-underline text-foreground"
        >
          {content}
        </Link>
      ) : (
        <span className="flex items-start gap-2 min-w-0 flex-1">{content}</span>
      )}

      {/*
        Le bouton n'apparaît qu'au survol, mais reste dans le flux — `invisible`
        et non `hidden` : le faire apparaître déplacerait le texte sous le
        curseur au moment où on le lit.

        `focus-within` le révèle aussi au clavier, où il n'y a pas de survol.
      */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Masquer pour aujourd'hui : ${notification.title}`}
        title="Masquer pour aujourd'hui"
        className="shrink-0 mt-0.5 p-0.5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground transition-opacity"
      >
        <X className="w-3 h-3" aria-hidden />
      </button>
    </li>
  );
};

export const NotificationBell = () => {
  const notifications = useAppNotifications();
  const [open, setOpen] = useState(false);
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

  /*
   * Ouverture automatique à l'arrivée sur le CRM.
   *
   * Le drapeau est posé AVANT d'ouvrir, et posé même quand il n'y a rien à
   * montrer : sans cela, une session sans notification au chargement verrait
   * la cloche s'ouvrir toute seule dix minutes plus tard, à la première
   * requête qui en produit une.
   */
  useEffect(() => {
    if (visible.length === 0) return;
    try {
      if (window.sessionStorage.getItem(OPENED_KEY)) return;
      window.sessionStorage.setItem(OPENED_KEY, "1");
    } catch {
      // Stockage indisponible : on n'ouvre pas plutôt que d'ouvrir à chaque
      // navigation.
      return;
    }
    setOpen(true);
  }, [visible.length]);

  const count = visible.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            count > 0 ? `${count} notification(s)` : "Aucune notification"
          }
          className="relative flex items-center justify-center w-8 h-8 rounded-full text-header-foreground/70 hover:text-header-foreground hover:bg-header-foreground/10 transition-colors cursor-pointer"
        >
          <Bell className="w-4 h-4" aria-hidden />
          {count > 0 && (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-[var(--nosho-orange)] text-[10px] font-semibold leading-4 text-white text-center"
            >
              {count}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-2">
        <div className="flex items-center justify-between px-2 pb-1.5 mb-1 border-b">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Notifications
          </span>
          {count > 0 && (
            <span className="text-[11px] text-muted-foreground">{count}</span>
          )}
        </div>

        {count === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Rien à signaler. Les notifications masquées reviennent demain.
          </p>
        ) : (
          <ul className="flex flex-col">
            {visible.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onOpen={() => setOpen(false)}
                onDismiss={() => dismiss(notification.dismissKey)}
              />
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
};
