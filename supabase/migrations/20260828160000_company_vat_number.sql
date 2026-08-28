-- Numero de TVA intracommunautaire sur les societes (NOS-1151).
--
-- Fichier en ASCII pur : `scripts/supabase-push.sh` passe la migration a
-- `jq --arg` apres un `cat`, et sous Git Bash / Windows tout caractere
-- non-ASCII y devient U+FFFD. Voir 20260827100000.
--
-- ---------------------------------------------------------------------------
-- Pourquoi la TVA seulement, et pas un champ SIRET de plus
-- ---------------------------------------------------------------------------
-- Simon demande "un champ TVA et SIRET si ceux-ci n'existent pas". La TVA
-- n'existe nulle part : elle est ajoutee ici.
--
-- Le SIRET, lui, existe deja -- sous le nom `tax_identifier`. C'est bien lui
-- que `EnrichmentDialog` y ecrit depuis Pappers (`patch.tax_identifier =
-- enrichment.siret`), lui que la reprise de NOS-1148 y a mis pour 26 societes,
-- et lui que le controle de NOS-1150 lit pour autoriser le passage en
-- Qualifie.
--
-- Ajouter une colonne `siret` a cote creerait deux emplacements pour la meme
-- valeur, sans que rien ne dise lequel fait foi. C'est le genre de doublon qui
-- se remplit a moitie de chaque cote et rend les deux inutilisables. Le champ
-- est donc conserve et son role rendu explicite par un commentaire ; l'interface
-- l'affiche desormais sous le libelle "SIRET" plutot que "N deg fiscal".

alter table public.companies
  add column if not exists vat_number text;

comment on column public.companies.vat_number is
  'Numero de TVA intracommunautaire, tel que renvoye par Pappers. Jamais '
  'calcule a partir du SIREN : une cle de controle fabriquee produirait une '
  'donnee fiscale fausse.';

comment on column public.companies.tax_identifier is
  'SIRET de l''etablissement. Nomme `tax_identifier` pour des raisons '
  'historiques, mais c''est bien le SIRET : Pappers l''y ecrit, et le passage '
  'en Qualifie le controle (NOS-1150).';

-- ---------------------------------------------------------------------------
-- Reconstruction de companies_summary
-- ---------------------------------------------------------------------------
-- `select c.*` est developpe et fige a la creation de la vue : une colonne
-- ajoutee a la table n'y apparait pas, et `create or replace view` echouerait
-- en lisant l'insertion au milieu comme un renommage. Meme procede que
-- 20260828140000 et 20260823140000. DROP remet les privileges a zero, d'ou les
-- re-grants.

drop view if exists public.companies_summary;

create view public.companies_summary
  with (security_invoker = on)
  as
select
    c.*,
    count(distinct d.id) as nb_deals,
    count(distinct co.id) as nb_contacts,
    -- Scalar subqueries, not joins: a join here would multiply the rows feeding
    -- the two count(distinct) above.
    (select p.name from public.companies p where p.id = c.parent_company_id)   as parent_company_name,
    (select count(*) from public.companies s where s.parent_company_id = c.id) as nb_subsidiaries
from public.companies c
    left join public.deals d on c.id = d.company_id
    left join public.contacts co on c.id = co.company_id
group by c.id;

revoke all on table public.companies_summary from anon;
grant all on table public.companies_summary to authenticated;
grant all on table public.companies_summary to service_role;
