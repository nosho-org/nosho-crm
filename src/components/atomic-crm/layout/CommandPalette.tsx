import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGetList } from "ra-core";
import {
  Building2,
  LayoutDashboard,
  Plus,
  Target,
  User,
  Users,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import type { Company, Contact, Deal } from "../types";

/**
 * ---------------------------------------------------------------------------
 * La palette ⌘K (NOS-1168)
 * ---------------------------------------------------------------------------
 * L'audit du 29 août 2026 : « Chaque liste a son propre champ de recherche,
 * limité à son entité. Retrouver "Kersanté" suppose de savoir d'avance si
 * c'est une société, un contact ou un deal. »
 *
 * C'est le vrai coût : il ne s'agit pas de gagner deux clics mais de ne plus
 * avoir à deviner, avant de chercher, où la chose est rangée.
 *
 * ## Trois décisions
 *
 * **La recherche part à trois caractères.** En deçà, « Ka » ramènerait
 * l'essentiel de la base et la palette afficherait une liste au hasard. Sous
 * ce seuil, seules les commandes s'affichent — ce qui en fait aussi un menu de
 * navigation quand on l'ouvre sans rien taper.
 *
 * **Trois requêtes en parallèle, pas une recherche serveur unifiée.** Une vue
 * ou une fonction couvrant les trois tables serait plus élégante et coûterait
 * une migration ; les trois `getList` existent déjà, portent déjà le
 * plein-texte de chaque ressource, et se lancent en même temps. À l'échelle de
 * ce CRM la différence est invisible.
 *
 * **Aucune commande destructive.** On y trouve de quoi naviguer et créer, rien
 * qui supprime ou archive : une palette se pilote au clavier, souvent vite, et
 * la dernière chose qu'on veut est de valider une suppression par inadvertance
 * en tapant trop tôt sur Entrée.
 */

const MIN_QUERY = 3;

interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  to: string;
}

const COMMANDS: PaletteCommand[] = [
  {
    id: "dashboard",
    label: "Aller au tableau de bord",
    icon: <LayoutDashboard className="w-4 h-4" aria-hidden />,
    to: "/",
  },
  {
    id: "deals",
    label: "Aller aux opportunités",
    icon: <Target className="w-4 h-4" aria-hidden />,
    to: "/deals",
  },
  {
    id: "companies",
    label: "Aller aux sociétés",
    icon: <Building2 className="w-4 h-4" aria-hidden />,
    to: "/companies",
  },
  {
    id: "contacts",
    label: "Aller aux contacts",
    icon: <Users className="w-4 h-4" aria-hidden />,
    to: "/contacts",
  },
  {
    id: "new-deal",
    label: "Créer une opportunité",
    icon: <Plus className="w-4 h-4" aria-hidden />,
    to: "/deals/create",
  },
  {
    id: "new-company",
    label: "Créer une société",
    icon: <Plus className="w-4 h-4" aria-hidden />,
    to: "/companies/create",
  },
  {
    id: "new-contact",
    label: "Créer un contact",
    icon: <Plus className="w-4 h-4" aria-hidden />,
    to: "/contacts/create",
  },
];

export const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return;
      // Empêche le raccourci natif du navigateur — Ctrl+K met le focus dans la
      // barre d'adresse sur Chrome et Firefox.
      event.preventDefault();
      setOpen((current) => !current);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const search = query.trim();
  const enabled = open && search.length >= MIN_QUERY;

  const { data: deals } = useGetList<Deal>(
    "deals",
    { pagination: { page: 1, perPage: 6 }, filter: { q: search } },
    { enabled },
  );
  const { data: companies } = useGetList<Company>(
    "companies",
    { pagination: { page: 1, perPage: 6 }, filter: { q: search } },
    { enabled },
  );
  const { data: contacts } = useGetList<Contact>(
    "contacts",
    { pagination: { page: 1, perPage: 6 }, filter: { q: search } },
    { enabled },
  );

  const go = (to: string) => {
    setOpen(false);
    setQuery("");
    navigate(to);
  };

  const hasResults = useMemo(
    () =>
      (deals?.length ?? 0) +
        (companies?.length ?? 0) +
        (contacts?.length ?? 0) >
      0,
    [deals, companies, contacts],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Recherche et commandes"
      description="Cherchez une société, un contact ou une opportunité, ou lancez une commande."
      // `shouldFilter={false}` : cmdk filtrerait une seconde fois, côté client,
      // les résultats que PostgREST a déjà filtrés — et masquerait ceux qui
      // correspondent sur un champ non affiché, comme le nom d'un contact
      // rattaché à une opportunité.
      shouldFilter={false}
    >
      <CommandInput
        placeholder="Société, contact, opportunité…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {enabled && !hasResults && (
          <CommandEmpty>Aucun résultat pour « {search} ».</CommandEmpty>
        )}

        {!!deals?.length && (
          <CommandGroup heading="Opportunités">
            {deals.map((deal) => (
              <CommandItem
                key={`deal-${deal.id}`}
                value={`deal-${deal.id}`}
                onSelect={() => go(`/deals/${deal.id}/show`)}
              >
                <Target className="w-4 h-4" aria-hidden />
                <span className="truncate">{deal.name}</span>
                {deal.company_name && (
                  <span className="ml-auto text-xs text-muted-foreground truncate">
                    {deal.company_name}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!!companies?.length && (
          <CommandGroup heading="Sociétés">
            {companies.map((company) => (
              <CommandItem
                key={`company-${company.id}`}
                value={`company-${company.id}`}
                onSelect={() => go(`/companies/${company.id}/show`)}
              >
                <Building2 className="w-4 h-4" aria-hidden />
                <span className="truncate">{company.name}</span>
                {company.city && (
                  <span className="ml-auto text-xs text-muted-foreground truncate">
                    {company.city}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!!contacts?.length && (
          <CommandGroup heading="Contacts">
            {contacts.map((contact) => (
              <CommandItem
                key={`contact-${contact.id}`}
                value={`contact-${contact.id}`}
                onSelect={() => go(`/contacts/${contact.id}/show`)}
              >
                <User className="w-4 h-4" aria-hidden />
                <span className="truncate">
                  {contact.first_name} {contact.last_name}
                </span>
                {contact.company_name && (
                  <span className="ml-auto text-xs text-muted-foreground truncate">
                    {contact.company_name}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Les commandes restent visibles pendant la recherche : « créer une
            société » est souvent ce qu'on veut faire précisément parce que la
            recherche n'a rien donné. */}
        <CommandGroup heading="Commandes">
          {COMMANDS.filter((command) =>
            search.length < MIN_QUERY
              ? true
              : command.label.toLowerCase().includes(search.toLowerCase()),
          ).map((command) => (
            <CommandItem
              key={command.id}
              value={command.id}
              onSelect={() => go(command.to)}
            >
              {command.icon}
              <span>{command.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
