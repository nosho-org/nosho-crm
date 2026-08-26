-- Réaffectation des tâches au responsable de l'opportunité (issue #125)
--
-- Demande : quand le responsable d'une opportunité change, ses tâches doivent
-- suivre. Aujourd'hui elles restent au créateur — `set_task_sales_id_trigger`
-- (04_triggers.sql) remplit `tasks.sales_id` avec l'utilisateur courant à
-- l'insert, et le formulaire de tâche n'expose aucun sélecteur d'assigné
-- (TaskFormContent.tsx). `sales_id` est donc un *tampon de créateur*, pas une
-- assignation délibérée : il n'y a aucun choix explicite d'un tiers à préserver
-- ici, ce qui est la raison pour laquelle ce trigger peut réécrire la colonne
-- sans rien détruire.
--
-- ---------------------------------------------------------------------------
-- Pourquoi en base et pas dans le front
-- ---------------------------------------------------------------------------
--
-- Même raison que `deal_change_log` : le responsable d'une opportunité bouge
-- par le formulaire d'édition, mais aussi par le drag & drop du board et par
-- l'agent n8n (VITE_N8N_CRM_AGENT_WEBHOOK_URL), qui écrivent tous les deux en
-- direct via le data provider. Une réaffectation côté application en raterait
-- deux sur trois.
--
-- ---------------------------------------------------------------------------
-- Quelles tâches suivent — et lesquelles ne suivent pas
-- ---------------------------------------------------------------------------
--
-- Une tâche atteint une opportunité par deux chemins (cf. `buildDealTaskFilter`
-- côté front, et `deals_summary` en base) :
--
--   1. directement, par `tasks.deal_id` ;
--   2. par un contact de l'opportunité, `tasks.contact_id = any(contact_ids)`.
--
-- Le second chemin porte l'historique : `deal_id` était NULL sur les 129 tâches
-- de production avant 20260823140000. L'ignorer reviendrait à livrer une
-- fonctionnalité qui ne corrige aucun des cas qui l'ont motivée.
--
-- Mais un contact peut figurer sur plusieurs opportunités, et sa tâche n'est
-- alors pas prouvablement rattachée à celle-ci (même limite que
-- `nextMeetingTask.ts` documente pour le prochain meeting). D'où la règle
-- retenue : par contact, **uniquement si ce contact n'est rattaché qu'à cette
-- seule opportunité**. Un contact partagé garde ses tâches où elles sont.
--
-- Trois garde-fous supplémentaires :
--
--   * `done_date is null` — réaffecter une tâche terminée réécrirait qui a fait
--     le travail, et fausserait toute statistique par commercial ;
--   * `t.deal_id is null` sur la branche « par contact » — une tâche portant
--     explicitement le `deal_id` d'une *autre* opportunité appartient à cette
--     autre opportunité, quel que soit son contact ;
--   * le décompte d'opportunités ignore les archivées (`archived_at`), sauf
--     l'opportunité courante elle-même : sans cette exception, réaffecter une
--     opportunité archivée donnerait un décompte de 0 et la branche « par
--     contact » ne se déclencherait jamais.
--
-- ---------------------------------------------------------------------------
-- Rapport avec `next_action_owner_id`
-- ---------------------------------------------------------------------------
--
-- 20260823090000 a délibérément tranché l'inverse pour la next action : elle a
-- gagné sa propre colonne pour que réaffecter une opportunité ne réaffecte pas
-- silencieusement l'action en cours. Ce n'est pas contradictoire, c'est le même
-- critère appliqué à deux champs de nature différente : `next_action_owner_id`
-- est saisi à la main par un commercial (c'est une décision), `tasks.sales_id`
-- est écrit par un trigger à l'insert (c'est un effet de bord). On ne réécrit
-- que le second. La next action reste hors de portée de cette migration.

-- ---------------------------------------------------------------------------
-- 1. La fonction trigger
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER : les policies de `tasks` (05_policies.sql) autorisent
-- aujourd'hui `update ... using (true)` à tout authentifié, donc un trigger en
-- droits appelant passerait. Le choix est quand même volontaire — le 2026-08-23,
-- `log_deal_change` livrée sans a bloqué tout changement d'étape pendant ~19 h,
-- et comme PostgREST renvoie 403 sur violation RLS, ra-supabase déconnectait
-- l'utilisateur au lieu d'afficher une erreur (cf. 20260824090000). Un
-- resserrement futur des policies de `tasks` reproduirait exactement ça, sur le
-- chemin le plus visible du CRM.
--
-- Le bloc EXCEPTION est l'autre moitié de la même leçon : la réaffectation vaut
-- moins que l'opportunité. Un échec devient un WARNING, jamais un rollback du
-- changement de responsable que l'utilisateur vient de demander.

create or replace function public.reassign_deal_tasks_to_owner() returns trigger
    language plpgsql
    security definer
    set search_path to 'public'
    as $$
declare
  v_count integer;
begin
  update public.tasks t
  set sales_id = new.sales_id
  where t.done_date is null
    -- Rien à faire si la tâche est déjà au bon nom : évite d'écrire pour écrire.
    and t.sales_id is distinct from new.sales_id
    and (
      t.deal_id = new.id
      or (
        t.deal_id is null
        and t.contact_id = any (coalesce(new.contact_ids, '{}'::bigint[]))
        and (
          select count(*)
          from public.deals d
          where (d.archived_at is null or d.id = new.id)
            and t.contact_id = any (coalesce(d.contact_ids, '{}'::bigint[]))
        ) = 1
      )
    );

  get diagnostics v_count = row_count;

  if v_count > 0 then
    raise notice 'reassign_deal_tasks_to_owner(deal %): % tâche(s) -> sales %',
      new.id, v_count, new.sales_id;
  end if;

  return null;
exception
  when others then
    raise warning 'reassign_deal_tasks_to_owner(deal %): %', new.id, sqlerrm;
    return null;
end;
$$;

grant all on function public.reassign_deal_tasks_to_owner() to authenticated;
grant all on function public.reassign_deal_tasks_to_owner() to service_role;

-- ---------------------------------------------------------------------------
-- 2. Le trigger
-- ---------------------------------------------------------------------------
--
-- Clause WHEN ici, contrairement à `deal_change_log_on_update` : cette fonction
-- n'a qu'un seul champ déclencheur, donc la condition ne peut pas dériver d'une
-- liste blanche qui vivrait ailleurs. `is distinct from` et non `<>` pour
-- couvrir le passage depuis/vers NULL.
--
-- AFTER : on écrit dans une autre table que celle qui déclenche. Aucun risque
-- de récursion, aucun trigger de `tasks` n'écrit dans `deals`.

create or replace trigger deal_tasks_follow_owner
    after update of sales_id on public.deals
    for each row
    when (old.sales_id is distinct from new.sales_id and new.sales_id is not null)
    execute function public.reassign_deal_tasks_to_owner();

-- ---------------------------------------------------------------------------
-- 3. Reprise de l'existant
-- ---------------------------------------------------------------------------
--
-- Le trigger ne couvre que les réaffectations futures. Les tâches déjà au nom
-- d'un ancien responsable — le cas qui a ouvert l'issue — resteraient telles
-- quelles jusqu'à la prochaine réaffectation de leur opportunité.
--
-- Mêmes règles que le trigger, à l'identique : tâches non terminées seulement,
-- `deal_id` direct ou contact mono-opportunité. Les opportunités archivées sont
-- incluses côté cible (une tâche ouverte sur une opportunité archivée est de
-- toute façon à traiter), mais restent exclues du décompte de partage.
--
-- Une tâche ne peut correspondre qu'à une seule opportunité `d` : la branche
-- « par contact » exige `t.deal_id is null`, donc elle ne peut pas croiser la
-- branche directe, et elle exige un décompte de 1. Le `update ... from` est
-- donc déterministe.

do $$
declare
  v_count integer;
begin
  with reaffectees as (
    update public.tasks t
    set sales_id = d.sales_id
    from public.deals d
    where t.done_date is null
      and d.sales_id is not null
      and t.sales_id is distinct from d.sales_id
      and (
        t.deal_id = d.id
        or (
          t.deal_id is null
          and t.contact_id = any (coalesce(d.contact_ids, '{}'::bigint[]))
          and (
            select count(*)
            from public.deals d2
            where (d2.archived_at is null or d2.id = d.id)
              and t.contact_id = any (coalesce(d2.contact_ids, '{}'::bigint[]))
          ) = 1
        )
      )
    returning t.id
  )
  select count(*) into v_count from reaffectees;

  raise notice 'Reprise issue #125 : % tâche(s) ouverte(s) réaffectée(s)', v_count;
end $$;
