-- Date de generation de la proposition (NOS-1187).
--
-- Fichier en ASCII pur -- `scripts/supabase-push.sh` le verifie.
--
-- Simon, devant le menu "Proposition" : "je ne comprends pas pourquoi il me
-- propose de regenerer ou modifier le document alors qu'il n'existe pas".
--
-- Le document existait. Le menu ne le disait simplement pas : il s'affiche des
-- que `proposal_public_url` est renseignee, sans jamais montrer QUAND le
-- document a ete produit. Trois entrees apparaissent alors sans contexte, et
-- "Regenerer -- ecrase le document" se lit comme une menace sur un document
-- fantome.
--
-- Une URL dit qu'une chose existe, pas depuis quand. C'est la date qui rend le
-- menu lisible -- et qui permet de decider si "Regenerer" vaut le coup.
alter table public.deals
  add column if not exists proposal_generated_at timestamptz;

comment on column public.deals.proposal_generated_at is
  'Date de la derniere generation de la proposition commerciale. Renseignee '
  'par la fonction generate-proposal (NOS-1187).';

-- Les propositions deja generees n'ont pas de date : on ne l'invente pas.
-- L'interface dit alors "document genere" sans date, ce qui est exact, plutot
-- que d'afficher une date fausse tiree de `updated_at`.
