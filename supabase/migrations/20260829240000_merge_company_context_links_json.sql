-- Corrige `merge_company_into` : `context_links` est du json, pas un text[].
--
-- Fichier en ASCII pur -- `scripts/supabase-push.sh` le verifie.
--
-- ---------------------------------------------------------------------------
-- L'erreur, et ce qu'elle enseigne
-- ---------------------------------------------------------------------------
-- La version de 20260829230000 fusionnait `context_links` avec l'operateur de
-- concatenation de tableaux :
--
--     coalesce(c.context_links, '{}') || coalesce(loser.context_links, '{}')
--
-- Le type TypeScript le declare `string[]`, mais la colonne est `json`. D'ou :
--
--     ERROR: operator does not exist: json || json
--
-- La fusion echouait donc entierement, sur chaque groupe -- sans rien casser,
-- puisqu'une exception annule la transaction. Mais la boucle avait ete lancee
-- sur les 83 groupes en croyant les traiter.
--
-- Deux lecons, notees ici parce qu'elles se reproduiront :
--
-- 1. Le type d'un champ cote TypeScript ne dit rien du type de la colonne.
--    `string[]` peut etre un `text[]`, un `json` ou un `jsonb`.
--
-- 2. Un script qui annonce "fusion executee" sans lire la reponse de l'API
--    ment. C'est le comptage d'apres -- 462 societes, inchange -- qui a
--    revele l'echec, pas le message de succes.
--
-- ---------------------------------------------------------------------------
-- L'union en json
-- ---------------------------------------------------------------------------
-- On developpe les deux tableaux en lignes, on deduplique, on reconstruit.
-- Plus verbeux qu'un `||`, mais c'est ce que json impose -- et ca preserve la
-- propriete qui compte : aucun lien de contexte n'est perdu.
--
-- Le `coalesce` final rend `'[]'` quand les deux sont vides, jamais NULL : une
-- fiche sans lien doit porter une liste vide, pas une absence.
create or replace function public.merge_company_into(
  loser_id bigint,
  winner_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  winner public.companies;
  loser public.companies;
begin
  if loser_id = winner_id then
    raise exception 'Une societe ne peut pas etre fusionnee avec elle-meme (%)', loser_id;
  end if;

  select * into winner from public.companies where id = winner_id;
  select * into loser from public.companies where id = loser_id;
  if winner is null or loser is null then
    raise exception 'Societe introuvable : % ou %', winner_id, loser_id;
  end if;

  -- Les quatre tables qui referencent `companies` par `company_id`.
  update public.contacts  set company_id = winner_id where company_id = loser_id;
  update public.deals     set company_id = winner_id where company_id = loser_id;
  update public.contracts set company_id = winner_id where company_id = loser_id;
  update public.prospects set company_id = winner_id where company_id = loser_id;

  -- Les filles de la perdante passent a la gagnante -- sauf la gagnante
  -- elle-meme, qui deviendrait sa propre fille.
  update public.companies
     set parent_company_id = winner_id
   where parent_company_id = loser_id and id <> winner_id;

  -- Et si la perdante etait le parent de la gagnante, le lien disparait :
  -- une societe qui se declare son propre parent fait boucler l'affichage de
  -- groupe a l'infini.
  update public.companies
     set parent_company_id = null
   where id = winner_id and parent_company_id = loser_id;

  -- Les champs vides de la gagnante se remplissent depuis la perdante. Une
  -- fusion ne doit jamais faire PERDRE une information.
  update public.companies c set
    sector             = coalesce(nullif(trim(c.sector), ''), loser.sector),
    type               = coalesce(c.type, loser.type),
    establishment_type = coalesce(c.establishment_type, loser.establishment_type),
    linkedin_url       = coalesce(nullif(trim(c.linkedin_url), ''), loser.linkedin_url),
    website            = coalesce(nullif(trim(c.website), ''), loser.website),
    phone_number       = coalesce(nullif(trim(c.phone_number), ''), loser.phone_number),
    address            = coalesce(nullif(trim(c.address), ''), loser.address),
    zipcode            = coalesce(nullif(trim(c.zipcode), ''), loser.zipcode),
    city               = coalesce(nullif(trim(c.city), ''), loser.city),
    country            = coalesce(nullif(trim(c.country), ''), loser.country),
    revenue            = coalesce(nullif(trim(c.revenue), ''), loser.revenue),
    tax_identifier     = coalesce(nullif(trim(c.tax_identifier), ''), loser.tax_identifier),
    vat_number         = coalesce(nullif(trim(c.vat_number), ''), loser.vat_number),
    size               = coalesce(c.size, loser.size),
    sales_id           = coalesce(c.sales_id, loser.sales_id),
    context_links      = coalesce(
      (
        select json_agg(distinct value)
        from (
          select value from json_array_elements_text(
            case when json_typeof(coalesce(c.context_links, '[]'::json)) = 'array'
                 then c.context_links else '[]'::json end)
          union
          select value from json_array_elements_text(
            case when json_typeof(coalesce(loser.context_links, '[]'::json)) = 'array'
                 then loser.context_links else '[]'::json end)
        ) links
      ),
      '[]'::json
    ),
    -- Le descriptif et sa provenance voyagent ENSEMBLE. Prendre le texte de la
    -- perdante en gardant la source de la gagnante presenterait une inference
    -- comme une donnee verifiee -- exactement ce que cette colonne evite.
    description        = case when nullif(trim(c.description), '') is not null
                              then c.description else loser.description end,
    description_source = case when nullif(trim(c.description), '') is not null
                              then c.description_source else loser.description_source end
  where c.id = winner_id;

  delete from public.companies where id = loser_id;
end;
$$;
