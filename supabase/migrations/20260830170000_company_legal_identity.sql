-- Identite legale des societes, pour la completude des contrats (NOS-1186).
--
-- Fichier en ASCII pur -- `scripts/supabase-push.sh` le verifie.
--
-- ---------------------------------------------------------------------------
-- Le probleme
-- ---------------------------------------------------------------------------
-- Le gabarit du contrat de periode d'essai ouvre ainsi :
--
--   "La societe [NOM], [FORME JURIDIQUE] au capital de [CAPITAL] EUR,
--     immatriculee au RCS de [VILLE] sous le numero [SIREN], code APE [APE]"
--
-- Aucune de ces valeurs n'existait en base. `companies` ne portait que
-- l'adresse, le SIRET et le numero de TVA. Un contrat genere aujourd'hui
-- sortirait avec quatre trous au premier paragraphe -- exactement le defaut
-- qui a envoye le contrat HEM chez le client avec un "[SIREN / FINESS HEM]"
-- non remplace.
--
-- ---------------------------------------------------------------------------
-- Quatre colonnes, et une valeur deduite
-- ---------------------------------------------------------------------------
-- Le NUMERO RCS n'a pas de colonne : c'est le SIREN, soit les neuf premiers
-- chiffres du SIRET deja stocke. Le dupliquer creerait deux sources pour un
-- meme fait, donc une divergence a la premiere correction.
--
-- La VILLE du RCS, elle, ne se deduit pas : c'est le greffe d'immatriculation,
-- qui n'est pas toujours celui du siege.
--
-- ---------------------------------------------------------------------------
-- Pourquoi du texte pour le capital
-- ---------------------------------------------------------------------------
-- `share_capital` est du texte et non un numerique. Le capital figure au
-- contrat tel qu'il est publie au registre -- "822", "1 000", parfois avec
-- une devise ou une mention de variabilite. Le stocker en numerique
-- obligerait a le reformater pour l'imprimer, et un contrat n'est pas
-- l'endroit ou arrondir.
alter table public.companies
  add column if not exists legal_form    text,
  add column if not exists share_capital text,
  add column if not exists rcs_city      text,
  add column if not exists ape_code      text,
  add column if not exists is_individual boolean;

comment on column public.companies.legal_form is
  'Forme juridique publiee au registre (SAS, SARL, entreprise individuelle). '
  'Alimentee par Pappers depuis le SIREN (NOS-1186).';

comment on column public.companies.share_capital is
  'Capital social, en texte : il figure au contrat tel que publie. Voir la '
  'migration 20260830170000 (NOS-1186).';

comment on column public.companies.rcs_city is
  'Ville du greffe d immatriculation. Pas toujours celle du siege, donc non '
  'deductible de l adresse (NOS-1186).';

comment on column public.companies.ape_code is
  'Code APE / NAF, par exemple 86.23Z (NOS-1186).';

comment on column public.companies.is_individual is
  'Vrai pour une entreprise individuelle : le contrat la designe alors comme '
  'une personne physique agissant en son nom propre, et non comme une '
  'societe representee par un mandataire (NOS-1186).';
