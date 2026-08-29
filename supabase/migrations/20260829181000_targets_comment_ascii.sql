-- Repare les commentaires de `targets`, corrompus a la migration precedente.
--
-- 20260829180000 contenait des guillemets francais. `scripts/supabase-push.sh`
-- fait passer la migration par `cat` puis `jq --arg` sous Git Bash, ou tout
-- caractere non-ASCII devient U+FFFD : les deux commentaires sont partis en
-- production avec des losanges a la place des guillemets.
--
-- Seuls les commentaires etaient touches -- aucune colonne, aucune contrainte,
-- aucun index. Mais un commentaire est ce qu'on lit avant de modifier une
-- table, et il doit etre lisible.
--
-- La regle qui a ete oubliee : ce fichier, comme tous ceux de ce repertoire,
-- doit rester en ASCII pur. Verification avant push :
--   LC_ALL=C grep -n '[^ -~]' supabase/migrations/<fichier>.sql
comment on table public.targets is
  'Objectifs commerciaux (NOS-1166). Une ligne sans sales_id est l''objectif '
  'commun de l''equipe. Bornes de date plutot que trimestre : "25 k EUR de '
  'MRR d''ici la fin de l''annee" n''est pas un trimestre.';

comment on column public.targets.metric is
  'mrr ou arr. Un objectif qui ne dit pas ce qu''il compte serait compare a la '
  'mauvaise colonne, d''un facteur douze.';
