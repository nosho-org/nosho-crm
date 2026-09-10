-- Exposer motion dans deals_summary (NOS-1485).
--
-- Defaut attrape en verifiant la production juste apres la migration
-- precedente : la colonne etait bien sur public.deals, et absente de
-- public.deals_summary.
--
-- ## Pourquoi "select d.*" ne suffit pas
--
-- Postgres developpe l'etoile AU MOMENT de la creation de la vue et fige la
-- liste des colonnes. Une colonne ajoutee ensuite a la table n'apparait jamais
-- dans la vue, quoi qu'en dise le texte du fichier de schema.
--
-- La liste des opportunites lit deals_summary, pas deals : sans cette
-- migration, la colonne Motion serait restee vide sur toutes les lignes et le
-- filtre aurait echoue cote PostgREST, sur une base pourtant correcte.
--
-- ## Pourquoi un DROP et pas un CREATE OR REPLACE
--
-- "create or replace view" n'autorise que l'ajout de colonnes EN FIN de liste.
-- Ici motion se glisse au milieu -- l'etoile la place parmi les colonnes de
-- deals, avant les colonnes calculees -- ce que le moteur refuse.
--
-- Verifie avant d'ecrire : aucun objet ne depend de cette vue. Le DROP et le
-- CREATE sont dans la meme transaction, donc aucun lecteur ne la voit absente.
-- Les droits ne survivent pas a un DROP et sont donc reposes, y compris celui
-- de metabase_reader, qui n'est declare nulle part dans les schemas et se
-- serait perdu en silence.
--
-- Le corps est celui de supabase/schemas/03_views.sql, a l'identique, aux
-- caracteres non ASCII pres : supabase-push.sh les corrompt.

drop view if exists public.deals_summary;

create view public.deals_summary with (security_invoker = on) as
select
    d.*,
    -- Filterable mirror of company_type with NULL folded to '' (NOS-797).
    -- PostgREST evaluates `not.in.(...)` as NULL for a NULL column and drops
    -- the row, which would have hidden every untyped opportunity - exactly the
    -- ones the commercial pipeline is made of.
    coalesce(d.company_type, '')                                                                                       as company_type_key,
    comp.name                                                                                                          as company_name,
    replace(lower(immutable_unaccent(coalesce(comp.name, ''))), ' ', '')                                                as company_name_search,
    coalesce(string_agg((c.first_name || ' ' || c.last_name), ' '), '')                                                as contact_names,
    -- L email des contacts, mis a plat (NOS-1235). La sous-requete est
    -- correlee au contact de la jointure : un jsonb_array_elements dans le
    -- FROM multiplierait les lignes et repeterait chaque nom autant de fois
    -- que le contact a d adresses.
    coalesce(string_agg((select string_agg(e.value ->> 'email', ' ') from jsonb_array_elements(coalesce(c.email_jsonb, '[]'::jsonb)) e), ' '), '')  as contact_emails,
    replace(lower(immutable_unaccent(coalesce(string_agg((select string_agg(e.value ->> 'email', ' ') from jsonb_array_elements(coalesce(c.email_jsonb, '[]'::jsonb)) e), ' '), ''))), ' ', '') as contact_emails_search,
    replace(lower(immutable_unaccent(coalesce(string_agg((c.first_name || ' ' || c.last_name), ' '), ''))), ' ', '')    as contact_names_search,
    -- Real last activity, replacing the `updated_at` proxy the cockpit used to
    -- read. Computed rather than materialised: a denormalised column kept in
    -- sync by four triggers is exactly the kind of value that drifts unnoticed.
    --
    -- Scalar subqueries, NOT joins - a 1-N join would multiply the rows feeding
    -- the string_agg above and repeat every contact name once per note.
    -- GREATEST ignores NULLs, so a deal with no note and no call falls back to
    -- updated_at on its own.
    greatest(
        d.updated_at,
        (select max(dn.date)       from public.deal_notes dn where dn.deal_id = d.id),
        (select max(cl.started_at) from public.call_logs cl  where cl.deal_id = d.id)
    )                                                                                                                  as last_activity_at,
    -- Next action derived from the task backlog (issue #108).
    --
    -- `deals.next_action`/`next_action_date` are columns someone has to type
    -- into, and nobody ever has: 0 of 215 opportunities carried one in
    -- production while 100 pending tasks existed. The sales team records its
    -- next steps as tasks, so that is where the list must read them from.
    --
    -- A task reaches a deal either directly (`tasks.deal_id`, the link the
    -- Tasks UI does not create yet) or through one of the deal's contacts -
    -- which is how all 124 production tasks are attached today.
    --
    -- Scalar subqueries for the same reason as above: joining `tasks` here
    -- would multiply the rows feeding `string_agg` and repeat every contact
    -- name once per task. Ordering by `due_date nulls last` makes an undated
    -- task a fallback rather than a winner.
    (
        select t.due_date from public.tasks t
        where t.done_date is null
          and (t.deal_id = d.id or t.contact_id = any(d.contact_ids))
        order by t.due_date asc nulls last, t.id asc
        limit 1
    )                                                                                                                  as next_task_date,
    (
        select t.text from public.tasks t
        where t.done_date is null
          and (t.deal_id = d.id or t.contact_id = any(d.contact_ids))
        order by t.due_date asc nulls last, t.id asc
        limit 1
    )                                                                                                                  as next_task_text
from public.deals d
    left join public.contacts c on c.id = any(d.contact_ids)
    left join public.companies comp on comp.id = d.company_id
group by d.id, comp.name;

alter view public.deals_summary owner to postgres;

grant select, insert, update, delete, truncate, references, trigger
  on public.deals_summary to authenticated;
grant select, insert, update, delete, truncate, references, trigger
  on public.deals_summary to service_role;
grant select on public.deals_summary to metabase_reader;

do $$
declare
  v_colonne int;
  v_lignes  int;
  v_deals   int;
begin
  select count(*) into v_colonne
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'deals_summary'
     and column_name = 'motion';

  if v_colonne <> 1 then
    raise exception 'deals_summary n''expose toujours pas motion';
  end if;

  -- La vue doit rendre exactement les memes lignes qu'avant : une jointure
  -- abimee au passage se verrait ici, pas a l'ecran trois jours plus tard.
  select count(*) into v_lignes from public.deals_summary;
  select count(*) into v_deals  from public.deals;

  if v_lignes <> v_deals then
    raise exception 'deals_summary rend % lignes pour % opportunites',
      v_lignes, v_deals;
  end if;
end $$;
