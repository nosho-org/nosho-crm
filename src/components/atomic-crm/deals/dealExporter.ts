import type { Exporter, Identifier } from "ra-core";
import { downloadCSV } from "ra-core";
import jsonExport from "jsonexport/dist";

import type {
  Company,
  Contact,
  Deal,
  DealPriority,
  LabeledValue,
  Sale,
} from "../types";
import { arrToMrr } from "../misc/formatCurrency";
import { getContactRole } from "./dealContactRoles";
import { getDealPriority } from "./dealUtils";

const labelOf = (choices: LabeledValue[], value: string | null | undefined) =>
  value ? (choices.find((c) => c.value === value)?.label ?? value) : "";

const saleName = (sale: Sale | undefined) =>
  sale ? `${sale.first_name} ${sale.last_name}` : "";

/**
 * CSV export of the opportunities.
 *
 * Exports labels and names rather than the internal slugs and foreign keys, so
 * the file is readable outside the CRM. `legacy_stage` is kept on purpose: it
 * is the audit trail of the migration to the canonical pipeline (NOS-796).
 * Internal search/aggregate helper columns are dropped.
 *
 * `roles_contacts` is collapsed into a single readable column on purpose: the
 * underlying `deals.contact_roles` is a {contactId: role} map, and letting the
 * default exporter flatten it would emit one near-empty column per contact id
 * seen anywhere in the export (issue #99).
 */
export const createDealExporter =
  (
    dealStages: LabeledValue[],
    dealCategories: LabeledValue[],
    leadSources: LabeledValue[],
    dealPriorities: DealPriority[],
  ): Exporter<Deal> =>
  async (records, fetchRelatedRecords) => {
    const companies = await fetchRelatedRecords<Company>(
      records,
      "company_id",
      "companies",
    );
    const sales = await fetchRelatedRecords<Sale>(records, "sales_id", "sales");
    const contacts = await fetchRelatedRecords<Contact>(
      records,
      "contact_ids",
      "contacts",
    );
    const referrers = await fetchRelatedRecords<Sale>(
      records,
      "referrer_id",
      "sales",
    );

    const contactName = (contactId: Identifier) => {
      const contact = contacts[contactId as keyof typeof contacts];
      return contact
        ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() ||
            String(contactId)
        : String(contactId);
    };

    const deals = records.map((deal) => ({
      id: deal.id,
      nom: deal.name,
      societe: deal.company_id != null ? companies[deal.company_id]?.name : "",
      etape: labelOf(dealStages, deal.stage),
      etape_historique: deal.legacy_stage ?? "",
      priorite: getDealPriority(deal.priority, dealPriorities)?.label ?? "",
      categorie: labelOf(dealCategories, deal.category),
      arr_eur: deal.amount ?? "",
      mrr_eur: deal.mrr ?? arrToMrr(deal.amount) ?? "",
      arr_saisi_manuellement: deal.arr_is_manual ? "oui" : "non",
      source_du_lead: labelOf(leadSources, deal.lead_source),
      responsable: saleName(sales[deal.sales_id as number]),
      apporteur:
        deal.referrer_id != null
          ? saleName(referrers[deal.referrer_id as number])
          : "",
      date_entree: deal.entered_at ?? "",
      date_cloture_prevue: deal.expected_closing_date ?? "",
      date_signature: deal.won_at ?? "",
      type_de_societe: deal.company_type ?? "",
      type_opportunite: deal.opportunity_type ?? "",
      roles_contacts: (deal.contact_ids ?? [])
        .map((contactId) => {
          const role = getContactRole(deal.contact_roles, contactId);
          return role ? `${contactName(contactId)}: ${role}` : null;
        })
        .filter(Boolean)
        .join(" | "),
      description: deal.description,
      cree_le: deal.created_at,
      archive_le: deal.archived_at ?? "",
    }));

    return jsonExport(deals, {}, (_err: any, csv: string) => {
      downloadCSV(csv, "opportunites");
    });
  };
