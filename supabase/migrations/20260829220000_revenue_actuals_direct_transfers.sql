-- Les virements directs comptent aussi (NOS-1179).
--
-- Fichier en ASCII pur -- `scripts/supabase-push.sh` le verifie desormais.
--
-- ---------------------------------------------------------------------------
-- La regle de depart etait fausse, et c'est Simon qui l'a vu
-- ---------------------------------------------------------------------------
-- La consigne disait : "la somme des virements Mollie equivaut a tous les
-- paiements de nos clients". La table a donc ete amorcee avec les seuls
-- virements Mollie, et juillet 2026 y valait 3 166,31 EUR.
--
-- Simon annoncait 3 874. L'ecart, 707,69 EUR, pointait vers un credit de
-- 708,00 EUR recu le 20 juillet de "GIE HOPITAL EUROPEEN" -- et 3 166,31 +
-- 708 = 3 874,31.
--
-- Verification faite : Hopital Europeen EST une societe du CRM. C'est un
-- client, et il paie par virement bancaire direct, pas par Mollie. La regle
-- "Mollie = tous les paiements clients" ne tient donc pas.
--
-- ---------------------------------------------------------------------------
-- Comment distinguer un paiement client d'un autre credit
-- ---------------------------------------------------------------------------
-- Le compte recoit aussi des apports en compte courant des fondateurs, des
-- remboursements SNCF et Amazon, et trois credits de 5 000 EUR de SOGECARE,
-- AUCTEO et MARANANT -- dont aucun n'est une societe du CRM.
--
-- Le critere retenu : un credit compte comme paiement client si son
-- contrepartie correspond a une SOCIETE DU CRM. C'est verifiable, ca se
-- reverifie a chaque collecte, et ca ne demande a personne de se souvenir
-- d'une liste.
--
-- Le risque assume : un client absent du CRM ne serait pas compte. C'est le
-- bon sens du compromis -- mieux vaut manquer un encaissement que gonfler le
-- chiffre d'affaires avec une subvention.
--
-- ---------------------------------------------------------------------------
-- Deux lignes par mois plutot qu'une
-- ---------------------------------------------------------------------------
-- `source` distingue desormais 'mollie' et 'virement'. Deux lignes, parce que
-- les deux ne se collectent pas pareil : Mollie se reconnait a un libelle
-- fixe, un virement direct demande de rapprocher un nom de contrepartie d'une
-- fiche societe. Les fondre donnerait un total qu'on ne saurait plus verifier.
comment on table public.revenue_actuals is
  'Encaisse reelle par mois (NOS-1179). Deux sources : les reversements '
  'Mollie, et les virements directs de societes du CRM -- Hopital Europeen '
  'paie ainsi. A ne pas confondre avec l''ARR des opportunites : l''un dit ce '
  'qu''on a encaisse, l''autre ce qu''on espere.';

comment on column public.revenue_actuals.source is
  '''mollie'' ou ''virement''. Deux lignes par mois plutot qu''une : les deux '
  'ne se collectent pas pareil, et les fondre donnerait un total qu''on ne '
  'saurait plus verifier.';

-- Juillet 2026 : le virement direct de GIE HOPITAL EUROPEEN, le 20 juillet.
insert into public.revenue_actuals (month, source, amount, transaction_count)
values ('2026-07-01', 'virement', 708.00, 1)
on conflict (month, source) do update
    set amount = excluded.amount,
        transaction_count = excluded.transaction_count,
        fetched_at = now();

-- Juin 2026 n'en a pas : les seuls credits non-Mollie du mois sont des apports
-- des fondateurs, deux remboursements SNCF, un remboursement Amazon et un
-- credit FRATICAP -- aucune de ces contreparties n'est une societe du CRM.
