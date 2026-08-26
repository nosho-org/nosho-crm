import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useDataProvider, useGetMany, useRecordContext } from "ra-core";
import { Card } from "@/components/ui/card";

import { EmailItem } from "../../contacts/ContactEmailHistory";
import type { CrmDataProvider } from "../../providers/types";
import type { Contact, Deal } from "../../types";

const MAX_MESSAGES = 10;

/**
 * ---------------------------------------------------------------------------
 * Mails échangés avec les contacts de l'opportunité (NOS-1016)
 * ---------------------------------------------------------------------------
 * Simon envoyait un mail à un contact et ne le retrouvait nulle part sur
 * l'opportunité. Ce n'était pas un défaut d'affichage : **aucune surface mail
 * n'existait sur cette page**, et rien ne reliait Gmail à une opportunité. La
 * timeline d'activité n'interroge que `deal_notes`, `call_logs`, les tâches et
 * `deal_change_log` — son `kind: "email"` n'est qu'une note dont le type libre
 * contient « mail », donc une saisie manuelle.
 *
 * ## Pourquoi sans stockage
 *
 * Deux approches se présentaient. Stocker les mails en base permettrait la
 * recherche, l'export et une vraie timeline — mais c'est un chantier qui engage
 * l'équipe sur la rétention et le traitement du contenu de correspondances
 * privées. Cette décision-là ne se prend pas au détour d'un correctif
 * d'affichage.
 *
 * Ce bloc réutilise donc le proxy Gmail existant, celui-là même qui sert déjà
 * la fiche contact : sans état, filtré par `from:`/`to:` sur les adresses
 * fournies. Le besoin exprimé — « voir les mails de ce contact ici » — est
 * couvert, et la porte reste ouverte.
 *
 * ## Ce que ça n'apporte pas, et il faut le savoir
 *
 * Pas d'historique consultable hors ligne, pas de recherche, pas d'export, et
 * un appel Gmail à chaque ouverture de fiche — atténué par un `staleTime` de
 * cinq minutes, comme sur la fiche contact.
 *
 * Le bloc se tait complètement s'il n'y a rien à dire : pas de contact, pas
 * d'adresse, Gmail non connecté, ou aucun message. Une carte vide sur une fiche
 * ne fait que poser une question sans y répondre.
 */
export const DealEmailHistory = () => {
  const record = useRecordContext<Deal>();
  const dataProvider = useDataProvider<CrmDataProvider>();

  const contactIds = record?.contact_ids ?? [];
  const { data: contacts } = useGetMany<Contact>(
    "contacts_summary",
    { ids: contactIds },
    { enabled: contactIds.length > 0 },
  );

  const emails = (contacts ?? [])
    .flatMap((contact) => contact.email_jsonb ?? [])
    .map((entry) => entry.email)
    .filter((email): email is string => !!email);

  const { data, isPending, error } = useQuery({
    // Clé sur les adresses et non sur l'identifiant de l'opportunité : ajouter
    // un contact doit relancer la requête, et deux opportunités partageant les
    // mêmes contacts peuvent partager le résultat.
    queryKey: ["google-emails", "deal", [...emails].sort().join(",")],
    queryFn: () => dataProvider.getContactEmails(emails, MAX_MESSAGES),
    enabled: emails.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Gmail non connecté, ou aucune adresse : rien à montrer, donc rien à
  // afficher. Une erreur ici n'est pas une erreur de l'opportunité.
  if (!record || emails.length === 0 || error) return null;

  if (isPending) {
    return (
      <Card className="p-4 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  if (!data?.messages?.length) return null;

  return (
    <Card className="p-4 flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Mails
      </span>
      <div className="space-y-1">
        {data.messages.map((message) => (
          <EmailItem key={message.id} message={message} />
        ))}
      </div>
      {data.totalEstimate > MAX_MESSAGES && (
        <p className="text-xs text-muted-foreground">
          +{data.totalEstimate - MAX_MESSAGES} autres échanges avec les contacts
          de cette opportunité
        </p>
      )}
    </Card>
  );
};
