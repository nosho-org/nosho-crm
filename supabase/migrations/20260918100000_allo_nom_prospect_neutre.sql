-- Un prospect cree par Allo ne porte plus le nom du commercial (NOS-1624).
--
-- Simon, le 18/09/2026, en apprenant que la ligne 0757903109 est libellee
-- "Marc-Henri Bonamy" dans Allo : "modifie et change le libelle en Alexandre
-- Cavaillon, car c'est bien ce user qui utilise la ligne".
--
-- ## Le libelle de la ligne avait deteint sur les contacts
--
-- `process_allo_call` nomme le contact cree automatiquement ainsi :
--
--     first_name = coalesce(v_from_name, 'Allo')
--
-- Sur un appel ENTRANT, `from_name` est le correspondant : l'intention est
-- juste. Sur un appel SORTANT, `from_name` est le libelle de la ligne Allo,
-- donc le nom du commercial -- et le contact qui represente le PROSPECT herite
-- du nom de celui qui l'a appele.
--
-- Mesure avant ecriture : 26 des 39 contacts crees par Allo portaient le nom
-- d'un commercial de la maison -- Marc-Henri 15, Benjamin 8, Thomas 3. Vingt-six
-- prospects distincts, chacun avec son propre numero, tous affiches sous le nom
-- d'un collegue.
--
-- ## Ce que cette migration ne fait pas
--
-- Elle ne renomme pas ces contacts "Alexandre Cavaillon". Ce serait remplacer
-- une erreur par la meme : ces fiches sont des prospects, pas Alexandre, et le
-- repertoire afficherait vingt-six homonymes. Le libelle dans Allo, lui, ne se
-- change que depuis Allo -- c'est de la qu'il arrive a chaque webhook.
--
-- Cote CRM la ligne est deja attribuee a Alexandre (NOS-1623), et les appels
-- qu'il a reellement passes lui sont attribues.
--
-- ## Pourquoi un declencheur
--
-- Meme raison qu'en NOS-1623 : la ligne fautive vit au milieu de deux cents
-- lignes de `process_allo_call`, et il faudrait en recopier 194 pour en changer
-- une. Le declencheur porte la regle a un seul endroit et couvre tous les
-- chemins d'ecriture.

-- 1. La regle : un prospect ne peut pas s'appeler comme un commercial.
create or replace function public.allo_nom_prospect_neutre()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Ne concerne QUE les contacts nes du webhook Allo. Un homonyme saisi a la
  -- main -- un prospect qui porterait vraiment le nom d'un collegue -- n'est
  -- pas de notre ressort.
  if new._sync_origin is distinct from 'allo' then
    return new;
  end if;

  if nullif(btrim(new.first_name), '') is null then
    return new;
  end if;

  if exists (
    select 1 from public.sales s
     where lower(btrim(s.first_name || ' ' || s.last_name))
         = lower(btrim(new.first_name))
  ) then
    -- La forme neutre que portent deja les contacts crees avant que le libelle
    -- de ligne ne soit repris : "Allo <numero>", le numero etant en last_name.
    new.first_name := 'Allo';
  end if;

  return new;
end;
$$;

grant all on function public.allo_nom_prospect_neutre() to service_role;

drop trigger if exists trg_allo_nom_prospect_neutre on public.contacts;
create trigger trg_allo_nom_prospect_neutre
  before insert on public.contacts
  for each row execute function public.allo_nom_prospect_neutre();

-- 2. Reprise des 26 contacts deja crees.
--
-- Le declencheur ne s'applique qu'aux insertions : la reprise est explicite, et
-- son perimetre se lit dans le WHERE. `_sync_origin = 'allo'` la borne aux
-- contacts nes du webhook -- aucun contact saisi a la main n'est touche.
update public.contacts c
   set first_name = 'Allo'
 where c._sync_origin = 'allo'
   and exists (
     select 1 from public.sales s
      where lower(btrim(s.first_name || ' ' || s.last_name))
          = lower(btrim(c.first_name))
   );

-- 3. Assertions.
do $$
declare
  v_restants int;
  v_fantomes int;
begin
  select count(*) into v_restants
    from public.contacts c
   where c._sync_origin = 'allo'
     and exists (select 1 from public.sales s
                  where lower(btrim(s.first_name || ' ' || s.last_name))
                      = lower(btrim(c.first_name)));

  if v_restants > 0 then
    raise exception '% prospect(s) portent encore le nom d''un commercial', v_restants;
  end if;

  -- Aucun contact ne doit avoir disparu : on renomme, on ne supprime pas.
  select count(*) into v_fantomes
    from public.contacts where _sync_origin = 'allo';

  if v_fantomes <> 39 then
    raise exception 'le nombre de contacts Allo a change : % au lieu de 39', v_fantomes;
  end if;
end $$;
