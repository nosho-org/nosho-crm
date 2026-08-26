-- La réaffectation des tâches respecte les assignations délibérées (NOS-1038)
--
-- ---------------------------------------------------------------------------
-- Ce que cette migration corrige, et pourquoi
-- ---------------------------------------------------------------------------
--
-- `20260826120000_tasks_follow_deal_owner.sql` (livrée ce matin, NOS-1017) fait
-- suivre les tâches ouvertes au nouveau responsable d'une opportunité. Elle
-- s'autorisait à réécrire `tasks.sales_id` sans condition sur sa valeur, et le
-- justifiait ainsi :
--
--   « `sales_id` est un *tampon de créateur*, pas une assignation délibérée :
--     il n'y a aucun choix explicite d'un tiers à préserver ici, ce qui est la
--     raison pour laquelle ce trigger peut réécrire la colonne sans rien
--     détruire. »
--
-- C'était vrai tant que `TaskFormContent.tsx` n'exposait aucun sélecteur de
-- responsable. NOS-1038 en ajoute un. **La prémisse tombe**, et avec elle
-- l'autorisation : réaffecter une opportunité retirerait sa tâche au collègue à
-- qui un commercial vient délibérément de la confier, sans trace ni notification.
--
-- C'est exactement le piège que `20260823090000` avait identifié pour la next
-- action — au point de lui donner sa propre colonne `next_action_owner_id` pour
-- que réaffecter une opportunité ne réaffecte pas silencieusement l'action en
-- cours. La même prudence s'applique maintenant aux tâches.
--
-- ---------------------------------------------------------------------------
-- La règle
-- ---------------------------------------------------------------------------
--
-- Ne suivent le responsable de l'opportunité que les tâches qui étaient portées
-- par l'**ancien** responsable, ou qui n'étaient assignées à personne :
--
--     and (t.sales_id is null or t.sales_id = old.sales_id)
--
-- Le cas de l'issue #125 continue donc de fonctionner — les tâches de Simon
-- suivent quand l'opportunité passe à Marc-Henri, parce qu'elles portaient bien
-- l'ancien responsable. Une tâche confiée à un tiers, elle, reste chez lui.
--
-- `old` est disponible : le trigger est déclaré `after update of sales_id` avec
-- une clause WHEN sur `old.sales_id is distinct from new.sales_id`.
--
-- Aucune reprise de données : celle de `20260826120000` est déjà passée (21
-- tâches réaffectées, toutes par le chemin contact). Cette migration ne change
-- que le comportement futur du trigger.

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
    -- NOS-1038 : ne déplacer que ce qui appartenait à l'ancien responsable, ou
    -- ce qui n'appartenait à personne. Une tâche assignée à la main à un tiers
    -- n'est pas un effet de bord du créateur, c'est une décision.
    and (t.sales_id is null or t.sales_id = old.sales_id)
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
    raise notice 'reassign_deal_tasks_to_owner(deal %): % tâche(s) % -> %',
      new.id, v_count, old.sales_id, new.sales_id;
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
