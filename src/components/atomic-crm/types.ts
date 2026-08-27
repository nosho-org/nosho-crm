import type { Identifier, RaRecord } from "ra-core";
import type { ComponentType } from "react";

import type {
  COMPANY_CREATED,
  CONTACT_CREATED,
  CONTACT_NOTE_CREATED,
  DEAL_CREATED,
  DEAL_NOTE_CREATED,
} from "./consts";

export type SignUpData = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
};

export type SalesFormData = {
  avatar?: string;
  email: string;
  password?: string;
  first_name: string;
  last_name: string;
  administrator: boolean;
  disabled: boolean;
};

export type Sale = {
  first_name: string;
  last_name: string;
  administrator: boolean;
  avatar?: RAFile;
  disabled?: boolean;
  user_id: string;

  /**
   * This is a copy of the user's email, to make it easier to handle by react admin
   * DO NOT UPDATE this field directly, it should be updated by the backend
   */
  email: string;

  /**
   * This is used by the fake rest provider to store the password
   * DO NOT USE this field in your code besides the fake rest provider
   * @deprecated
   */
  password?: string;
} & Pick<RaRecord, "id">;

export type Company = {
  /**
   * Optional parent company (NOS-957 §4). A self-reference: a parent company
   * is a company. Never inferred from the name — the relation must come from
   * explicit CRM data.
   */
  parent_company_id?: Identifier | null;
  name: string;
  logo: RAFile;
  sector: string;
  type?: string | null;
  /** Drives the ARR tier suggested on the company's deals. */
  establishment_type?: string | null;
  size: 1 | 10 | 50 | 250 | 500;
  linkedin_url: string;
  website: string;
  phone_number: string;
  address: string;
  zipcode: string;
  city: string;
  state_abbr: string;
  sales_id?: Identifier | null;
  created_at: string;
  description: string;
  revenue: string;
  tax_identifier: string;
  country: string;
  context_links?: string[];
  nb_contacts?: number;
  nb_deals?: number;
} & Pick<RaRecord, "id">;

export type EmailAndType = {
  email: string;
  type: "Work" | "Home" | "Other";
};

export type PhoneNumberAndType = {
  number: string;
  type: "Work" | "Home" | "Other";
};

export type Contact = {
  first_name: string;
  last_name: string;
  title: string;
  company_id?: Identifier | null;
  email_jsonb: EmailAndType[];
  avatar?: Partial<RAFile>;
  linkedin_url?: string | null;
  first_seen: string;
  last_seen: string;
  has_newsletter: boolean;
  tags: Identifier[];
  gender: string;
  sales_id?: Identifier | null;
  status: string;
  background: string;
  phone_jsonb: PhoneNumberAndType[];
  nb_tasks?: number;
  company_name?: string;
  /** Sector of the linked company, exposed by the `contacts_summary` view. */
  company_sector?: string;
} & Pick<RaRecord, "id">;

export type ContactNote = {
  contact_id: Identifier;
  text: string;
  date: string;
  sales_id: Identifier;
  status: string;
  attachments?: AttachmentNote[];
} & Pick<RaRecord, "id">;

/**
 * Decision-making role of a contact **on a given deal**.
 *
 * Keyed by contact id, so the same person can be the decision maker on one
 * opportunity and a mere influencer on another. Values come from
 * `dealContactRoles` in the configuration.
 */
export type DealContactRoles = Record<string, string>;

export type Deal = {
  name: string;
  company_id: Identifier;
  /** Pipeline view the deal belongs to — NOT the growth source. */
  company_type?: string;
  /** Growth source: nouveau client / extension / renouvellement. */
  opportunity_type?: string | null;
  contact_roles?: DealContactRoles;
  /** Next commercial action, free text. Real column — see 20260820120000. */
  next_action?: string | null;
  /** Day the next action is due. Real column — see 20260820120000. */
  next_action_date?: string | null;
  /**
   * Who owns the next action. `null` means "same as the deal owner", so
   * reassigning a deal does not silently reassign its pending action.
   * See 20260823090000.
   */
  next_action_owner_id?: Identifier | null;
  /**
   * Due date of the deal's oldest pending task, computed by `deals_summary`
   * (see 20260824150000). The typed `next_action_date` above is what the sales
   * team *should* fill in; this is what it actually does — records a task. Used
   * as a fallback so the pipeline shows a real next step instead of nothing.
   *
   * Absent from any record read outside the view (FakeRest, fixtures,
   * optimistic updates), hence optional.
   */
  next_task_date?: string | null;
  /** Text of that same task. See `next_task_date`. */
  next_task_text?: string | null;
  contact_ids: Identifier[];
  category: string;
  /**
   * Products the deal covers (`no-show` / `entrant` / `data`). A set: a deal can
   * carry several at once. Never null in the database — `'{}'` is the default,
   * because PostgREST's `ov.`/`cs.` operators evaluate to NULL against a NULL
   * array and drop the row.
   */
  products?: string[];
  stage: string;
  /** Original stage value before the migration to the canonical 8-stage pipeline. */
  legacy_stage?: string | null;
  /** Original category value before the 20 -> 7 category migration. */
  legacy_category?: string | null;
  description: string;
  /** Annual Recurring Revenue, in euros. Stored as-is, never converted. */
  amount: number;
  /** Monthly Recurring Revenue, derived from `amount` by the database (amount / 12). */
  mrr?: number;
  /**
   * True once someone typed an ARR by hand. Automatic prefill from the company
   * establishment type must never overwrite the value while this is true.
   */
  arr_is_manual?: boolean;
  priority?: DealPriorityValue;
  /**
   * Numeric mirror of `priority`, generated and indexed in PostgreSQL:
   * urgent = 2, important = 1, normal = 0.
   *
   * Read-only — writing it is rejected by the database. It exists so a query
   * can sort by urgency: ordering on `priority` itself would be alphabetical,
   * `important` < `normal` < `urgent`, which reads P1, P2, P0.
   */
  priority_rank?: number;
  /**
   * Per-deal win probability override, 0-100 (NOS-817). `null`/undefined means
   * no exception was recorded and the weighting cascade falls back to the stage
   * probability — which is a different claim from "0 % chance".
   */
  probability?: number | null;
  lead_source?: string | null;
  /** Sales who brought the lead in — distinct from `sales_id`, who owns it. */
  referrer_id?: Identifier | null;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  /** Date the deal entered the pipeline. */
  entered_at?: string | null;
  expected_closing_date: string;
  trial_start_date?: string;
  /** Signature date, set when the deal reaches the "Contrat signé" stage. */
  won_at?: string;
  sales_id: Identifier;
  index: number;
  proposal_edit_url?: string;
  proposal_public_url?: string;
  /**
   * Last real activity: the latest of `updated_at`, the newest deal note and
   * the newest linked call. Computed by `deals_summary`, so it is present on
   * every read through the data provider but never writable.
   *
   * Prefer this over `updated_at` for dormancy: until 20260823110000 no trigger
   * maintained `updated_at`, so historical rows still carry their creation date.
   */
  last_activity_at?: string;
} & Pick<RaRecord, "id">;

export type DealNote = {
  deal_id: Identifier;
  /**
   * Activity kind, backing the deal timeline filters (Notes / Appels /
   * Meetings / Emails). The column has existed since the table was created; it
   * was simply never typed here.
   */
  type?: string | null;
  text: string;
  date: string;
  sales_id: Identifier;
  attachments?: AttachmentNote[];

  // This is defined for compatibility with `ContactNote`
  status?: undefined;
} & Pick<RaRecord, "id">;

export type Tag = {
  id: number;
  name: string;
  color: string;
};

/**
 * A task hangs off a contact OR an opportunity — `tasks_owner_check` requires
 * one of the two and accepts either. `contact_id` stopped being mandatory in
 * migration 20260823140000, which added `deal_id`; this type never followed.
 */
export type Task = {
  /**
   * Nullable since 20260823140000: a task belongs to a contact OR to an
   * opportunity, and `tasks_owner_check` only requires one of the two.
   */
  contact_id?: Identifier | null;
  /**
   * The opportunity the task belongs to. Reading a deal's tasks by this column
   * alone misses every task attached through one of its contacts, which is how
   * the sales team has always recorded them — see `buildDealTaskFilter`.
   */
  deal_id?: Identifier | null;
  type: string;
  text: string;
  due_date: string;
  done_date?: string | null;
  sales_id?: Identifier;
} & Pick<RaRecord, "id">;

export type ActivityCompanyCreated = {
  type: typeof COMPANY_CREATED;
  company_id: Identifier;
  company: Company;
  sales_id: Identifier;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityContactCreated = {
  type: typeof CONTACT_CREATED;
  company_id: Identifier;
  sales_id?: Identifier;
  contact: Contact;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityContactNoteCreated = {
  type: typeof CONTACT_NOTE_CREATED;
  sales_id?: Identifier;
  contactNote: ContactNote;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityDealCreated = {
  type: typeof DEAL_CREATED;
  company_id: Identifier;
  sales_id?: Identifier;
  deal: Deal;
  date: string;
};

export type ActivityDealNoteCreated = {
  type: typeof DEAL_NOTE_CREATED;
  sales_id?: Identifier;
  dealNote: DealNote;
  date: string;
};

export type Activity = RaRecord &
  (
    | ActivityCompanyCreated
    | ActivityContactCreated
    | ActivityContactNoteCreated
    | ActivityDealCreated
    | ActivityDealNoteCreated
  );

export interface RAFile {
  src: string;
  title: string;
  path?: string;
  rawFile: File;
  type?: string;
}

export type AttachmentNote = RAFile;

export interface LabeledValue {
  value: string;
  label: string;
}

export type DealStage = LabeledValue;

/**
 * A company type, used to classify what a deal is really about. Types flagged
 * `commercial: false` (investors, partners, press…) keep their own views but
 * stay out of the Opportunités pipeline and out of the ARR aggregates.
 * Missing flag means commercial, so existing configurations keep working.
 */
export interface CompanyType extends LabeledValue {
  commercial?: boolean;
}

export type DealPriorityValue = "normal" | "important" | "urgent";

export interface DealPriority extends LabeledValue {
  value: DealPriorityValue;
  /** Tailwind classes for the coloured dot shown in lists and on cards. */
  dotClassName: string;
  /** Sort weight, highest first. */
  weight: number;
}

/**
 * An establishment type (Cabinet, Clinique, Hôpital…) and the ARR it suggests.
 * The grid is editable in the settings; the suggested ARR is only ever used to
 * prefill an empty (or never manually edited) deal amount.
 */
export interface EstablishmentType extends LabeledValue {
  /** Suggested ARR in euros. */
  arr: number;
}

export interface NoteStatus extends LabeledValue {
  color: string;
}

export interface ContactGender {
  value: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}
