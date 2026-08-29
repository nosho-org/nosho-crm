-- Fusion des societes en double (NOS-1176).
--
-- Fichier en ASCII pur -- `scripts/supabase-push.sh` le verifie desormais.
--
-- ---------------------------------------------------------------------------
-- Ce que cette migration fait, et ne fait pas
-- ---------------------------------------------------------------------------
-- Elle installe une FONCTION de fusion. Elle ne fusionne rien par elle-meme :
-- l'execution se fait ensuite, groupe par groupe, apres un comptage a blanc.
--
-- Separer les deux est delibere. Une migration qui supprimerait 88 fiches en
-- production au moment ou elle s'applique ne laisse aucune place a la
-- verification -- et une fusion ne se defait pas.
--
-- ---------------------------------------------------------------------------
-- La regle du gagnant
-- ---------------------------------------------------------------------------
-- La fiche conservee est la mieux RENSEIGNEE, pas la plus ancienne. Une fiche
-- creee par erreur puis enrichie vaut mieux qu'une fiche d'origine restee
-- vide, et c'est celle qui porte le SIRET, l'adresse et le descriptif qu'on
-- veut garder.
--
-- Les rattachements pesent double : une fiche qui porte des opportunites et
-- des contacts est celle que l'equipe utilise reellement. A egalite, la plus
-- ancienne l'emporte -- elle a le plus de chances d'etre celle que les liens
-- externes designent.
--
-- ---------------------------------------------------------------------------
-- Les opportunites ne sont jamais perdues
-- ---------------------------------------------------------------------------
-- Elles sont REAFFECTEES a la fiche gagnante, jamais supprimees. La contrainte
-- de cle etrangere `deals_company_id_fkey` l'exige de toute facon : Postgres
-- refuserait la suppression d'une societe encore referencee.
--
-- Le comptage d'avant et d'apres le verifie : voir la vue de controle en fin
-- de fichier.

-- Normalisation identique a celle du client (`companyDuplicates.ts`) :
-- minuscules, sans accent, ponctuation reduite a des espaces simples.
--
-- IMMUTABLE et non STABLE : elle ne lit aucune table et ne depend d'aucun
-- reglage de session, ce qui la rend utilisable dans un index si le besoin
-- vient.
create or replace function public.normalize_company_name(value text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select trim(regexp_replace(lower(unaccent(coalesce(value, ''))), '[^a-z0-9]+', ' ', 'g'));
$$;

comment on function public.normalize_company_name(text) is
  'Nom de societe normalise pour la detection de doublons. Meme regle que '
  'companyDuplicates.ts cote client (NOS-1176).';

-- ---------------------------------------------------------------------------
-- Les noms qui ne designent personne
-- ---------------------------------------------------------------------------
-- Deux fiches nommees "Autre" ne sont PAS la meme societe : ce sont deux
-- societes inconnues. Les fusionner rassemblerait sept opportunites sans
-- rapport sous une fiche qui ne veut rien dire, et le detruirait pour de bon.
--
-- "test" et "visiteur medical" relevent du meme probleme : un placeholder et
-- un intitule de poste.
--
-- C'est le seul garde-fou impossible a deduire du seul nom, et c'est celui qui
-- evite le degat le plus grave.
create or replace function public.is_placeholder_company_name(value text)
returns boolean
language sql
immutable
set search_path = public, extensions
as $$
  select public.normalize_company_name(value) in (
    'autre', 'autres', 'test', 'visiteur medical', 'inconnu', 'na', 'n a'
  );
$$;

comment on function public.is_placeholder_company_name(text) is
  'Noms qui ne designent pas une societe en particulier. Deux fiches "Autre" '
  'sont deux societes inconnues, pas la meme (NOS-1176).';

-- ---------------------------------------------------------------------------
-- Le score de completude
-- ---------------------------------------------------------------------------
-- Meme formule que `completenessScore` cote client : les champs remplis, plus
-- deux points par opportunite et un par contact.
create or replace function public.company_completeness(company_id bigint)
returns integer
language sql
stable
set search_path = public
as $$
  select
    (select count(*)::int from (
        select unnest(array[
          c.tax_identifier, c.vat_number, c.address, c.zipcode, c.city,
          c.website, c.phone_number, c.linkedin_url, c.description,
          c.sector, c.establishment_type
        ]) as v
      ) f where f.v is not null and trim(f.v) <> '')
    + 2 * (select count(*)::int from public.deals d where d.company_id = c.id)
    + (select count(*)::int from public.contacts ct where ct.company_id = c.id)
  from public.companies c
  where c.id = company_id;
$$;

-- ---------------------------------------------------------------------------
-- La fusion
-- ---------------------------------------------------------------------------
-- `loser_id` disparait, `winner_id` reste et recupere tout.
--
-- Chaque appel est atomique par construction : une fonction plpgsql s'execute
-- dans la transaction de son appelant. Un echec au milieu ne laisse pas de
-- contacts pointant vers une societe supprimee.
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
    context_links      = (
      select array(select distinct e from unnest(
        coalesce(c.context_links, '{}') || coalesce(loser.context_links, '{}')
      ) e)
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

comment on function public.merge_company_into(bigint, bigint) is
  'Fusionne `loser_id` dans `winner_id` : reaffecte contacts, opportunites, '
  'contrats et prospects, remplit les champs vides de la gagnante, puis '
  'supprime la perdante. Les opportunites sont REAFFECTEES, jamais supprimees '
  '(NOS-1176).';

-- ---------------------------------------------------------------------------
-- La vue de controle
-- ---------------------------------------------------------------------------
-- Ce qui serait fusionne, et ce que ca deplacerait. A lire avant d'executer.
create or replace view public.company_duplicate_groups
with (security_invoker = on) as
select
    public.normalize_company_name(c.name)                      as key,
    count(*)                                                   as fiches,
    string_agg(c.name, ' | ' order by c.id)                    as noms,
    array_agg(c.id order by c.id)                              as ids,
    sum((select count(*) from public.deals d where d.company_id = c.id))    as deals,
    sum((select count(*) from public.contacts ct where ct.company_id = c.id)) as contacts
from public.companies c
where public.normalize_company_name(c.name) <> ''
  and not public.is_placeholder_company_name(c.name)
group by 1
having count(*) > 1;

comment on view public.company_duplicate_groups is
  'Groupes de societes en double, hors noms generiques. Sert au comptage a '
  'blanc avant fusion (NOS-1176).';

grant select on public.company_duplicate_groups to authenticated;
