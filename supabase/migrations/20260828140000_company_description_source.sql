-- Origine du descriptif d'une societe (NOS-1149).
--
-- Fichier en ASCII pur : `scripts/supabase-push.sh` passe la migration a
-- `jq --arg` apres un `cat`, et sous Git Bash / Windows tout caractere
-- non-ASCII y devient U+FFFD. Voir 20260827100000 pour la fois ou ca a mordu.
--
-- ---------------------------------------------------------------------------
-- Pourquoi tracer l'origine
-- ---------------------------------------------------------------------------
-- Un descriptif redige par un modele n'a pas le meme statut qu'un descriptif
-- saisi par un commercial ou repris d'une source officielle. Le premier est
-- une inference : plausible, souvent juste, parfois faux. Celui qui le lit
-- avant d'appeler un client doit savoir lequel des deux il a sous les yeux.
--
-- Une colonne plutot qu'une convention dans le texte : un prefixe "[IA]" se
-- ferait effacer a la premiere relecture humaine, et on perdrait l'information
-- au moment meme ou elle devient interessante -- c'est-a-dire quand quelqu'un
-- a verifie.
--
-- `null` = origine humaine ou inconnue, qui sont le meme cas en pratique pour
-- les 97 descriptifs deja en base : personne ne sait d'ou ils viennent, et
-- les declarer "IA" serait un mensonge de plus.

alter table public.companies
  add column if not exists description_source text;

comment on column public.companies.description_source is
  'Origine du descriptif : ''ai'' quand il a ete redige par un modele, null '
  'quand il vient d''un humain ou d''une source inconnue. Efface des que le '
  'descriptif est reecrit a la main.';

-- ---------------------------------------------------------------------------
-- Reconstruction de companies_summary
-- ---------------------------------------------------------------------------
-- PostgreSQL developpe `select c.*` au moment de la creation de la vue : la
-- liste de colonnes y est figee. Ajouter une colonne a la table ne la fait
-- donc PAS apparaitre dans la vue, et `create or replace view` echouerait --
-- la nouvelle colonne s'inserant au milieu, il la lirait comme un renommage.
--
-- Meme raisonnement et meme procede que 20260823140000, qui a du reconstruire
-- cette vue pour exposer `parent_company_id`. DROP remet aussi les privileges
-- a zero, d'ou les re-grants.
--
-- C'est necessaire ici : le front lit les societes a travers cette vue.

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
