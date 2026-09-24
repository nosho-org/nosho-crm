-- Deux produits de plus : Reactivation client et Marketing.
--
-- Simon, le 24/09/2026 : "dans la partie concernant les produits ou on peut
-- retrouver No-show, Entrant et Data, je voudrais que tu ajoutes egalement
-- Reactivation client et Marketing".
--
-- ## Les slugs restent sans accent
--
-- `reactivation-client` et `marketing`, en minuscules avec tiret, comme les
-- trois existantes. C'est le slug qui est stocke dans le tableau
-- `deals.products` : un accent s'y paierait au premier filtre mal encode.
-- Le libelle, lui, s'ecrit correctement -- d'ou chr(233) pour le "e" accent
-- aigu de "Reactivation", `scripts/supabase-push.sh` corrompant le non-ASCII.
--
-- ## Aucune opportunite n'est touchee
--
-- On ajoute des choix, on n'en retire aucun. Usage mesure avant d'ecrire :
-- No-show 196, Entrant 171, Data 5, et 91 opportunites sur 303 sans produit.

update public.configuration
set config = jsonb_set(
  config,
  '{dealProducts}',
  jsonb_build_array(
    jsonb_build_object('value', 'no-show',             'label', 'No-show'),
    jsonb_build_object('value', 'entrant',             'label', 'Entrant'),
    jsonb_build_object('value', 'data',                'label', 'Data'),
    jsonb_build_object('value', 'reactivation-client',
      'label', ('R' || chr(233) || 'activation client')),
    jsonb_build_object('value', 'marketing',           'label', 'Marketing')
  )
);

do $$
declare
  v_valeurs  text[];
  v_orphelins int;
begin
  select array_agg(p ->> 'value' order by p ->> 'value')
    into v_valeurs
    from public.configuration, jsonb_array_elements(config -> 'dealProducts') as p;

  if v_valeurs is distinct from
     array['data','entrant','marketing','no-show','reactivation-client'] then
    raise exception 'dealProducts inattendu : %', v_valeurs;
  end if;

  -- Aucune opportunite ne doit porter un produit absent de la liste : ce serait
  -- le signe qu'on a retire un choix encore utilise.
  select count(*) into v_orphelins
    from public.deals d
   where d.products is not null
     and exists (
       select 1 from unnest(d.products) as produit
        where not (produit = any(v_valeurs))
     );

  if v_orphelins > 0 then
    raise exception '% opportunite(s) portent un produit hors liste', v_orphelins;
  end if;
end $$;
