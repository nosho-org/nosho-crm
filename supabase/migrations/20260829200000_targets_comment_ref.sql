-- Corrige la reference Linear du commentaire de `targets`.
--
-- 20260829180000 et 20260829181000 citaient NOS-1166, un numero suppose libre
-- qui appartenait deja a une autre issue -- "Journal d'appels : un appel
-- d'urgence n'est ni qualifie, ni notifie, ni date", projet Receptionist.
-- L'issue reelle est NOS-1173.
--
-- Les fichiers de migration sont corriges, mais ils sont deja appliques : le
-- commentaire en base porte encore l'ancien numero. D'ou cette migration.
--
-- Une reference fausse est pire qu'aucune : elle envoie qui la suit vers un
-- ticket sans rapport, et lui fait croire qu'il a compris le contexte.
comment on table public.targets is
  'Objectifs commerciaux (NOS-1173). Une ligne sans sales_id est l''objectif '
  'commun de l''equipe. Bornes de date plutot que trimestre : "25 k EUR de '
  'MRR d''ici la fin de l''annee" n''est pas un trimestre.';
