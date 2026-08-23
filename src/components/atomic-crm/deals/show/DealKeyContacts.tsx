import { Mail, Phone, Plus, Linkedin } from "lucide-react";
import { Link } from "react-router-dom";
import { useGetMany, useRecordContext } from "ra-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { Avatar } from "../../contacts/Avatar";
import { useConfigurationContext } from "../../root/ConfigurationContext";
import type { Contact, Deal } from "../../types";
import { getContactRole } from "../dealContactRoles";

/**
 * ---------------------------------------------------------------------------
 * Contacts clés & rôles décisionnels (NOS-958 §5)
 * ---------------------------------------------------------------------------
 * "Le bloc actuel de contacts est insuffisant parce qu'il dit qui est là, mais
 * pas qui compte dans le deal." The decision role is the point of this block —
 * the spec marks it P0.
 *
 * Roles live on the deal↔contact relation (`deals.contact_roles`), not on the
 * contact: the same person can decide on one opportunity and merely influence
 * another.
 *
 * Email, phone and LinkedIn are shown only when the contact actually has them:
 * "Ne pas inventer ces données lorsqu'elles n'existent pas."
 */

const ROLE_STYLE: Record<string, string> = {
  decideur: "bg-violet-50 text-violet-700 border-violet-200",
  influenceur: "bg-orange-50 text-orange-700 border-orange-200",
  prescripteur: "bg-sky-50 text-sky-700 border-sky-200",
  utilisateur: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

/** Decision makers first, then influencers, then the rest. */
const ROLE_ORDER = ["decideur", "influenceur", "prescripteur", "utilisateur"];

const firstEmail = (contact: Contact): string | null =>
  contact.email_jsonb?.find((entry) => entry?.email)?.email ?? null;

const firstPhone = (contact: Contact): string | null =>
  contact.phone_jsonb?.find((entry) => entry?.number)?.number ?? null;

export const DealKeyContacts = () => {
  const record = useRecordContext<Deal>();
  const { dealContactRoles, archivedDealContactRoles } =
    useConfigurationContext();

  const ids = record?.contact_ids ?? [];
  const { data: contacts } = useGetMany<Contact>(
    "contacts_summary",
    { ids },
    { enabled: ids.length > 0 },
  );

  if (!record) return null;

  const roleLabel = (slug: string | null) => {
    if (!slug) return "Non défini";
    return (
      dealContactRoles.find((r) => r.value === slug)?.label ??
      archivedDealContactRoles?.find((r) => r.value === slug)?.label ??
      slug
    );
  };

  const sorted = [...(contacts ?? [])].sort((a, b) => {
    const rank = (contact: Contact) => {
      const role = getContactRole(record.contact_roles, contact.id) ?? "";
      const index = ROLE_ORDER.indexOf(role);
      return index === -1 ? ROLE_ORDER.length : index;
    };
    return rank(a) - rank(b);
  });

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Contacts clés &amp; rôles décisionnels
        </span>
        <Button asChild size="sm" variant="outline">
          <a href={`#/deals/${record.id}`}>
            <Plus className="w-3.5 h-3.5" aria-hidden />
            Ajouter un contact
          </a>
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun contact associé à cette opportunité.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {sorted.map((contact) => {
            const role =
              getContactRole(record.contact_roles, contact.id) ?? null;
            const email = firstEmail(contact);
            const phone = firstPhone(contact);
            return (
              <li
                key={contact.id}
                className="flex items-center gap-3 py-2 flex-wrap"
              >
                <Avatar record={contact} width={25} height={25} />

                <span className="min-w-0 flex-1">
                  <Link
                    to={`/contacts/${contact.id}/show`}
                    className="text-sm font-medium hover:underline block truncate"
                  >
                    {contact.first_name} {contact.last_name}
                  </Link>
                  {contact.title && (
                    <span className="text-xs text-muted-foreground block truncate">
                      {contact.title}
                    </span>
                  )}
                </span>

                <Badge
                  variant="outline"
                  className={`shrink-0 ${
                    ROLE_STYLE[role ?? ""] ??
                    "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  {roleLabel(role)}
                </Badge>

                <span className="flex items-center gap-1 shrink-0">
                  {email && (
                    <Button asChild size="sm" variant="ghost" title={email}>
                      <a href={`mailto:${email}`}>
                        <Mail className="w-3.5 h-3.5" aria-hidden />
                        <span className="sr-only">Envoyer un email</span>
                      </a>
                    </Button>
                  )}
                  {phone && (
                    <Button asChild size="sm" variant="ghost" title={phone}>
                      <a href={`tel:${phone}`}>
                        <Phone className="w-3.5 h-3.5" aria-hidden />
                        <span className="sr-only">Appeler</span>
                      </a>
                    </Button>
                  )}
                  {contact.linkedin_url && (
                    <Button asChild size="sm" variant="ghost" title="LinkedIn">
                      <a
                        href={contact.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Linkedin className="w-3.5 h-3.5" aria-hidden />
                        <span className="sr-only">Profil LinkedIn</span>
                      </a>
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};
