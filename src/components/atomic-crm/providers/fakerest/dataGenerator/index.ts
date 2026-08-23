import { generateCompanies } from "./companies";
import { generateContactNotes } from "./contactNotes";
import { generateContacts } from "./contacts";
import { generateDealNotes } from "./dealNotes";
import { generateDeals } from "./deals";
import { finalize } from "./finalize";
import { generateSales } from "./sales";
import { generateTags } from "./tags";
import { generateTasks } from "./tasks";
import type { Db } from "./types";

export default (): Db => {
  const db = {} as Db;
  db.sales = generateSales(db);
  db.tags = generateTags(db);
  db.companies = generateCompanies(db);
  db.contacts = generateContacts(db);
  db.contact_notes = generateContactNotes(db);
  db.deals = generateDeals(db);
  db.deal_notes = generateDealNotes(db);
  db.tasks = generateTasks(db);
  // No call integration in demo mode, but the collection must exist.
  db.call_logs = [];
  // One entry per deal, mirroring what the migration seeded in production.
  db.deal_stage_history = db.deals.map((deal, index) => ({
    id: index,
    deal_id: deal.id,
    from_stage: deal.legacy_stage ?? null,
    to_stage: deal.stage,
    changed_at: deal.created_at,
    changed_by: deal.sales_id,
    source: "migration",
  }));
  db.configuration = [
    {
      id: 1,
      config: {} as Db["configuration"][number]["config"],
    },
  ];
  finalize(db);

  return db;
};
