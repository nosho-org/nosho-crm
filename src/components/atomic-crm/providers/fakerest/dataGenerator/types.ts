import type {
  Company,
  Contact,
  ContactNote,
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
  sales: Sale[];
  tags: Tag[];
  tasks: Task[];
  // Emulate the two tables the deal page reads. FakeRest raises
  // "Undefined collection" for anything absent, so the timeline and the stage
  // history simply failed in demo mode without them.
  call_logs: Record<string, unknown>[];
  deal_stage_history: Record<string, unknown>[];
  configuration: Array<{ id: number; config: ConfigurationContextValue }>;
}
