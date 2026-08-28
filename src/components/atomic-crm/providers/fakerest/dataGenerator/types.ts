import type {
  Company,
  Contact,
  ContactNote,
  Contract,
  Deal,
  DealNote,
  Sale,
  Tag,
  Task,
} from "../../../types";
import type { ConfigurationContextValue } from "../../../root/ConfigurationContext";

export interface Db {
  companies: Required<Company>[];
  contacts: Required<Contact>[];
  contact_notes: ContactNote[];
  deals: Deal[];
  deal_notes: DealNote[];
  /*
   * Vide à la génération : un contrat se crée depuis une opportunité, il ne se
   * fabrique pas au hasard. La collection doit néanmoins exister — FakeRest
   * lève « Undefined collection » sur tout ce qui est absent, et
   * l'enregistrement échouerait en démo (NOS-1156).
   */
  contracts: Contract[];
  sales: Sale[];
  tags: Tag[];
  tasks: Task[];
  // Emulate the two tables the deal page reads. FakeRest raises
  // "Undefined collection" for anything absent, so the timeline and the stage
  // history simply failed in demo mode without them.
  call_logs: Record<string, unknown>[];
  deal_stage_history: Record<string, unknown>[];
  // In production this is the real table and `deal_stage_history` is a view
  // over it (20260825120000). FakeRest has no views, so both are generated.
  deal_change_log: Record<string, any>[];
  configuration: Array<{ id: number; config: ConfigurationContextValue }>;
}
