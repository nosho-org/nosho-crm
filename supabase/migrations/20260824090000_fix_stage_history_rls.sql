-- Hotfix: changing a deal's stage was blocked by RLS since 20260823140000
--
-- That migration created `deal_stage_history` with row level security enabled
-- and a single policy, on SELECT. The trigger that writes to it,
-- `log_deal_stage_change()`, was declared without SECURITY DEFINER, so it runs
-- with the caller's privileges — and RLS refuses an INSERT for which no policy
-- exists, GRANT or no GRANT.
--
-- Every stage change therefore failed:
--
--   1. UPDATE deals ... SET stage = 'qualified'   -- allowed
--   2. trigger fires, INSERT INTO deal_stage_history
--   3. RLS: no INSERT policy -> 42501 insufficient_privilege
--   4. the trigger raises, so the whole UPDATE is rolled back
--
-- Production went from 232 history rows (all seeded by the migration) to zero
-- further changes, and zero deals updated at all, for the ~19 hours this was
-- live. Drag & drop on the board, the deal form and the bulk stage edit were
-- all affected.
--
-- The fix is SECURITY DEFINER on the function rather than an INSERT policy.
-- This is an audit log: it must be written whatever the caller may do, and
-- nobody should be able to forge an entry by hand. Keeping SELECT as the only
-- policy is the correct posture — the history stays readable and unforgeable.
--
-- `SET search_path TO 'public'` was already on the function and is mandatory
-- here: without it, a SECURITY DEFINER function can be hijacked by a caller
-- who prepends a schema of their own.

CREATE OR REPLACE FUNCTION "public"."log_deal_stage_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_sales_id bigint;
BEGIN
  -- auth.uid() is NULL under service_role and under the Management API, so the
  -- row is left unattributed rather than the write failing.
  SELECT id INTO v_sales_id FROM sales WHERE user_id = auth.uid();

  INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, changed_by, source)
  VALUES (
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.stage END,
    NEW.stage,
    v_sales_id,
    coalesce(nullif(current_setting('app.change_source', true), ''), 'user')
  );
  RETURN NULL;
END;
$$;

-- The application never writes to this table directly — the trigger does, and
-- it now runs as the definer. Narrow the grant to match: read only.
revoke insert, update, delete, truncate on table public.deal_stage_history from authenticated;

-- ---------------------------------------------------------------------------
-- Verification — blocking
-- ---------------------------------------------------------------------------
--
-- Exercises the real path: an UPDATE that changes the stage, performed with the
-- `authenticated` role, must succeed and must leave exactly one history row.
-- Rolled back at the end so production data is untouched.

do $$
declare
    v_deal_id  bigint;
    v_stage    text;
    v_before   bigint;
    v_after    bigint;
begin
    select id, stage into v_deal_id, v_stage
      from public.deals
     where archived_at is null
     order by id
     limit 1;

    if v_deal_id is null then
        raise notice 'Aucune opportunité à tester';
        return;
    end if;

    select count(*) into v_before from public.deal_stage_history where deal_id = v_deal_id;

    -- The privilege check is what matters, so it has to run as the role the
    -- application uses, not as the migration's owner.
    set local role authenticated;
    update public.deals
       set stage = case when v_stage = 'lead' then 'qualified' else 'lead' end
     where id = v_deal_id;
    reset role;

    select count(*) into v_after from public.deal_stage_history where deal_id = v_deal_id;

    if v_after <> v_before + 1 then
        raise exception 'Historique des étapes : le trigger n''a pas écrit (avant %, après %)',
            v_before, v_after;
    end if;

    raise notice 'Changement d''étape vérifié sous le rôle authenticated : 1 entrée écrite';

    -- Undo the probe.
    raise exception 'ROLLBACK_SONDE';
exception
    when others then
        if sqlerrm = 'ROLLBACK_SONDE' then
            raise notice 'Sonde annulée, données de production intactes';
        else
            raise;
        end if;
end
$$;
