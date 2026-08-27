import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useDataProvider, useGetMany, useRecordContext } from "ra-core";
import { Card } from "@/components/ui/card";

import { EmailItem } from "../../contacts/ContactEmailHistory";
import { useGoogleConnectionStatus } from "../../google/useGoogleConnectionStatus";
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
 * ## Les états vides disent pourquoi (NOS-1069)
 *
 * La première version se taisait dès qu'il n'y avait rien à montrer, pour ne
 * pas poser une question sans y répondre. Elle a produit l'inverse : Simon a
 * signalé que ses mails ne remontaient pas, alors que le seul contact de son
 * opportunité n'avait **aucune adresse enregistrée**. Quatre situations très
 * différentes donnaient le même écran vide, et la seule réparable était
 * indiscernable d'une panne.
 *
 * Chaque cas a donc sa phrase — sauf l'échec de l'appel Gmail, qui reste
 * silencieux : il ne dit rien d'utile au commercial, et une carte en erreur sur
 * chaque fiche serait du bruit.
 */
/** Le bloc garde son titre même vide : sinon il semble avoir disparu. */
const EmptyState = ({ children }: { children: React.ReactNode }) => (
  <Card className="p-4 flex flex-col gap-2">
    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      Mails
    </span>
    <p className="text-sm text-muted-foreground">{children}</p>
  </Card>
);

export const DealEmailHistory = () => {
  const record = useRecordContext<Deal>();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { data: googleStatus } = useGoogleConnectionStatus();

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

  if (!record) return null;

  // Gmail pas branché : le dire, une fois, sans insister. Ce n'est pas une
  // erreur de l'opportunité, c'est un réglage de compte.
  if (googleStatus && !googleStatus.connected) {
    return (
      <EmptyState>
        Connectez votre compte Google dans les Paramètres pour voir ici les
        échanges avec les contacts de cette opportunité.
      </EmptyState>
    );
  }

  if (contactIds.length === 0) {
    return (
      <EmptyState>
        Aucun contact rattaché à cette opportunité — rien à rapprocher d'une
        boîte mail.
      </EmptyState>
    );
  }

  /*
   * Le cas qui a motivé NOS-1069.
   *
   * L'opportunité 241 n'avait qu'un contact, sans adresse enregistrée : le
   * bloc se taisait, et rien ne distinguait « aucun échange » de « aucune
   * adresse saisie ». 99 contacts sur 458 sont dans ce cas en production.
   *
   * C'est le seul état vide réparable en trente secondes par le commercial.
   * Se taire ici, c'est lui laisser croire que Gmail est en panne.
   */
  if (emails.length === 0) {
    return (
      <EmptyState>
        Aucune adresse email sur {contactIds.length > 1 ? "les" : "le"} contact
        {contactIds.length > 1 ? "s" : ""} de cette opportunité. Ajoutez-en une
        sur la fiche du contact pour retrouver les échanges ici.
      </EmptyState>
    );
  }

  if (isPending) {
    return (
      <Card className="p-4 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  // Une panne de l'appel Gmail reste silencieuse : elle ne dit rien d'utile au
  // commercial, et une carte en erreur sur chaque fiche serait du bruit.
  if (error) return null;

  if (!data?.messages?.length) {
    return <EmptyState>Aucun échange trouvé avec ces contacts.</EmptyState>;
  }

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
