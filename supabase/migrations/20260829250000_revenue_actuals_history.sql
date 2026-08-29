-- L'encaisse de janvier a mai 2026 (NOS-1179).
--
-- Fichier en ASCII pur -- `scripts/supabase-push.sh` le verifie.
--
-- Releve le 29 aout 2026 sur le compte Qonto principal, en sommant les credits
-- dont le libelle est "Stichting Mollie Payments", page par page. Chaque mois
-- compte 170 a 330 transactions, soit 2 a 4 pages : c'est l'etape qu'on rate,
-- et `transaction_count` est stocke pour la reperer.
--
-- Aucun de ces mois ne porte de virement direct d'une societe du CRM. Les
-- autres credits sont des apports en compte courant (Blenck, Beaudoux, Ane,
-- Bonnifay), des remboursements (SNCF, Amazon, Anthropic), et des credits
-- FRATICAP -- qui n'est pas une societe du CRM.
--
-- Le seul virement direct de la periode est celui de GIE HOPITAL EUROPEEN en
-- juillet, insere par 20260829220000.
--
-- ---------------------------------------------------------------------------
-- Ce que la serie raconte
-- ---------------------------------------------------------------------------
--   janvier   1 639,46    (6 virements)
--   fevrier   2 545,43    (6)   +55 %
--   mars      3 042,05    (9)   +20 %
--   avril     3 153,78    (6)    +4 %
--   mai       3 169,62    (6)    +0 %
--   juin      3 123,21    (5)    -1 %
--   juillet   3 874,31    (9)   +24 %  dont 708 EUR de virement direct
--
-- La croissance est nette de janvier a mars, puis l'encaisse Mollie plafonne
-- autour de 3 100 EUR pendant quatre mois. Le rebond de juillet vient pour
-- moitie du virement d'Hopital Europeen, qui ne passe pas par Mollie -- c'est
-- exactement pourquoi les deux sources sont comptees separement.
insert into public.revenue_actuals (month, source, amount, transaction_count)
values
    ('2026-01-01', 'mollie', 1639.46, 6),
    ('2026-02-01', 'mollie', 2545.43, 6),
    ('2026-03-01', 'mollie', 3042.05, 9),
    ('2026-04-01', 'mollie', 3153.78, 6),
    ('2026-05-01', 'mollie', 3169.62, 6)
on conflict (month, source) do update
    set amount = excluded.amount,
        transaction_count = excluded.transaction_count,
        fetched_at = now();
