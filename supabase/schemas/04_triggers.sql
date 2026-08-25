--
-- Triggers
-- This file declares all triggers.
--

-- Auto-populate sales_id from current auth user on insert
create or replace trigger set_company_sales_id_trigger
    before insert on public.companies
    for each row execute function public.set_sales_id_default();

create or replace trigger set_contact_sales_id_trigger
    before insert on public.contacts
    for each row execute function public.set_sales_id_default();

create or replace trigger set_contact_notes_sales_id_trigger
    before insert on public.contact_notes
    for each row execute function public.set_sales_id_default();

create or replace trigger set_deal_sales_id_trigger
    before insert on public.deals
    for each row execute function public.set_sales_id_default();

-- Auto-set deal.won_at when stage transitions to/from closed-won
create or replace trigger deal_stage_won_at
    before update on public.deals
    for each row
    when (old.stage is distinct from new.stage)
    execute function public.set_deal_won_at();

-- Until 20260823110000 this trigger did not exist and nothing else wrote
-- deals.updated_at, so every production row had updated_at = created_at. The
-- cockpit read it as a last-activity proxy, which made the "dormant deal" alert
-- measure age since creation. deals_summary.last_activity_at now derives the
-- real value; this keeps updated_at honest going forward.
create or replace trigger deals_set_updated_at
    before update on public.deals
    for each row execute function public.set_updated_at();

-- Change journal (NOS-819, then issue #114 for every other field). Written by
-- trigger because the board moves deals by drag & drop straight through the
-- data provider and the bulk edit goes through updateMany: an application-side
-- write would miss both.
create or replace trigger deal_change_log_on_insert
    after insert on public.deals
    for each row execute function public.log_deal_change();

-- No WHEN clause on purpose: the tracked-column whitelist lives in the
-- function. Repeating it here as `old.a is distinct from new.a or ...` would be
-- a second copy that drifts. The function writes nothing when no tracked column
-- moved, which is the same outcome at a negligible cost.
create or replace trigger deal_change_log_on_update
    after update on public.deals
    for each row execute function public.log_deal_change();

-- A company cannot be its own ancestor: a cycle makes every recursive read of
-- the hierarchy hang, and the deal page walks it to render the breadcrumb.
create or replace trigger company_parent_cycle_guard
    before insert or update on public.companies
    for each row
    when (new.parent_company_id is not null)
    execute function public.check_company_parent_cycle();

create or replace trigger set_deal_notes_sales_id_trigger
    before insert on public.deal_notes
    for each row execute function public.set_sales_id_default();

create or replace trigger set_task_sales_id_trigger
    before insert on public.tasks
    for each row execute function public.set_sales_id_default();

-- Auto-fetch company logo from website favicon on save
create or replace trigger company_saved
    before insert or update on public.companies
    for each row execute function public.handle_company_saved();

-- Auto-fetch contact avatar from email on save
create or replace trigger contact_saved
    before insert or update on public.contacts
    for each row execute function public.handle_contact_saved();

-- Update contact.last_seen when a contact note is created
create or replace trigger on_public_contact_notes_created_or_updated
    after insert on public.contact_notes
    for each row execute function public.handle_contact_note_created_or_updated();

-- Cleanup storage attachments when contact notes are updated or deleted
create or replace trigger on_contact_notes_attachments_updated_delete_note_attachments
    after update on public.contact_notes
    for each row
    when (old.attachments is distinct from new.attachments)
    execute function public.cleanup_note_attachments();

create or replace trigger on_contact_notes_deleted_delete_note_attachments
    after delete on public.contact_notes
    for each row execute function public.cleanup_note_attachments();

-- Cleanup storage attachments when deal notes are updated or deleted
create or replace trigger on_deal_notes_attachments_updated_delete_note_attachments
    after update on public.deal_notes
    for each row
    when (old.attachments is distinct from new.attachments)
    execute function public.cleanup_note_attachments();

create or replace trigger on_deal_notes_deleted_delete_note_attachments
    after delete on public.deal_notes
    for each row execute function public.cleanup_note_attachments();

-- Auto-update prospects.updated_at on every row modification
create or replace trigger prospects_set_updated_at
    before update on public.prospects
    for each row execute function public.set_updated_at();

-- Auth triggers: sync auth.users to public.sales
create or replace trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

create or replace trigger on_auth_user_updated
    after update on auth.users
    for each row execute function public.handle_update_user();
