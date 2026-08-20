import { add } from "date-fns";
import { datatype, lorem, random } from "faker/locale/en_US";

import {
  defaultDealCategories,
  defaultDealPriorities,
  defaultDealStages,
  defaultLeadSources,
} from "../../../root/defaultConfiguration";
import { SIGNED_DEAL_STAGE } from "../../../deals/dealUtils";
import { arrToMrr } from "../../../misc/formatCurrency";
import type { Deal } from "../../../types";
import type { Db } from "./types";
import { randomDate } from "./utils";

export const generateDeals = (db: Db): Deal[] => {
  const deals = Array.from(Array(50).keys()).map((id) => {
    const company = random.arrayElement(db.companies);
    company.nb_deals++;
    const contacts = random.arrayElements(
      db.contacts.filter((contact) => contact.company_id === company.id),
      datatype.number({ min: 1, max: 3 }),
    );
    const lowercaseName = lorem.words();
    const created_at = randomDate(new Date(company.created_at)).toISOString();

    const expected_closing_date = randomDate(
      new Date(created_at),
      add(new Date(created_at), { months: 6 }),
    )
      .toISOString()
      .split("T")[0];

    const contact_ids = contacts.map((contact) => contact.id);
    const contact_names = contacts
      .map((contact) => `${contact.first_name} ${contact.last_name}`)
      .join(" ");

    const stage = random.arrayElement(defaultDealStages).value;
    // The ARR grid works in whole euros, so keep the generated amounts in the
    // same order of magnitude as the real tiers (800 → 15 000 €).
    const amount = datatype.number({ min: 1, max: 40 }) * 500;

    return {
      id,
      name: lowercaseName[0].toUpperCase() + lowercaseName.slice(1),
      company_id: company.id,
      company_name: company.name,
      // Generated deals are plain commercial opportunities. `company_type_key`
      // emulates deals_summary.company_type_key: coalesce(company_type, '').
      company_type: null,
      company_type_key: "",
      contact_ids,
      contact_names,
      category: random.arrayElement(defaultDealCategories).value,
      stage,
      priority: random.arrayElement(defaultDealPriorities).value,
      lead_source: random.arrayElement(defaultLeadSources).value,
      description: lorem.paragraphs(datatype.number({ min: 1, max: 4 })),
      amount,
      // Mirrors the generated column of the same name in PostgreSQL.
      mrr: arrToMrr(amount),
      arr_is_manual: datatype.boolean(),
      created_at,
      updated_at: randomDate(new Date(created_at)).toISOString(),
      entered_at: created_at.split("T")[0],
      expected_closing_date,
      won_at: stage === SIGNED_DEAL_STAGE ? expected_closing_date : undefined,
      sales_id: company.sales_id,
      referrer_id: random.arrayElement(db.sales).id,
      index: 0,
    };
  });
  // compute index based on stage
  defaultDealStages.forEach((stage) => {
    deals
      .filter((deal) => deal.stage === stage.value)
      .forEach((deal, index) => {
        deals[deal.id].index = index;
      });
  });
  return deals;
};
