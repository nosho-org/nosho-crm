import { generateCompanies } from "./companies";
import { generateContactNotes } from "./contactNotes";
import { generateContacts } from "./contacts";
import { generateContracts } from "./contracts";
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
  db.contracts = generateContracts(db);
  db.tasks = generateTasks(db);
  // No call integration in demo mode, but the collection must exist.
  db.call_logs = [];
  // One entry per deal, mirroring what the migration seeded in production.
  //
  // `deal_stage_history` is a view over `deal_change_log` there
  // (20260825120000); FakeRest has no views, so both collections are generated
  // from the same rows. Without the journal the deal page's timeline raised
  // "Undefined collection" in demo mode.
  db.deal_change_log = db.deals.map((deal, index) => ({
    id: index,
    deal_id: deal.id,
    operation: deal.legacy_stage ? "update" : "insert",
    field: "stage",
    old_value: deal.legacy_stage ?? null,
    new_value: deal.stage,
    changed_at: deal.created_at,
    changed_by: deal.sales_id,
    source: "migration",
  }));
  db.deal_stage_history = db.deal_change_log.map((change) => ({
    id: change.id,
    deal_id: change.deal_id,
    from_stage: change.old_value,
    to_stage: change.new_value,
    changed_at: change.changed_at,
    changed_by: change.changed_by,
    source: change.source,
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
