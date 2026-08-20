import jsonExport from "jsonexport/dist";
import { downloadCSV, type Exporter, type Identifier } from "ra-core";

import type { Contact, Deal } from "../types";
import { getContactRole } from "./dealContactRoles";

/**
 * CSV exporter for opportunities.
 *
 * Exists for one reason: `deals.contact_roles` is a `{contactId: role}` map, and
 * the default exporter would flatten it into one column *per contact id seen
 * anywhere in the export* — hundreds of near-empty columns. Here it becomes a
 * single readable `contact_roles` column, e.g.
 * `Nathalie Ginestrier: decideur | Frederic ROLLIN: influenceur`.
 */
export const dealExporter: Exporter<Deal> = async (
  records,
  fetchRelatedRecords,
) => {
  const contacts = await fetchRelatedRecords<Contact>(
    records,
    "contact_ids",
    "contacts",
  );

  const contactName = (contactId: Identifier) => {
    const contact = contacts[contactId as keyof typeof contacts];
    return contact
      ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() ||
          String(contactId)
      : String(contactId);
  };

  const deals = records.map((deal) => ({
    ...deal,
    contact_roles: (deal.contact_ids ?? [])
      .map((contactId) => {
        const role = getContactRole(deal.contact_roles, contactId);
        return role ? `${contactName(contactId)}: ${role}` : null;
      })
      .filter(Boolean)
      .join(" | "),
  }));

  return jsonExport(deals, {}, (_err: unknown, csv: string) => {
    downloadCSV(csv, "deals");
  });
};
