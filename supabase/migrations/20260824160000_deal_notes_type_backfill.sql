-- Backfill deal_notes.type on historical rows (NOS / issue #109).
--
-- The deal timeline files activities as Appel / Meeting / Email from the `type`
-- column. That column has existed since the table was created but had no input
-- anywhere, so all 343 rows were NULL and three of the six filter tabs could
-- never match anything. The form now writes it; this fills in what it can of
-- the past.
--
-- Heuristic, and why it is this narrow: matching keywords anywhere in the note
-- is useless here, because "appel", "rdv" and "no-show" are Nosho's own product
-- vocabulary. A note reading "539 appels entrants par mois" is a client metric,
-- not a phone call. That approach tagged 178/343 rows, 60 of them matching two
-- or three categories at once — the tabs would have become actively misleading,
-- which is worse than empty.
--
-- So this anchors on the first 60 characters, where the team actually writes
-- the kind ("Mail envoyé à…", "Relance mail", "CR : démo…", "Visio du 02 mars",
-- "Échange tel avec…"). Measured against production: 41 rows — 20 email,
-- 19 meeting, 2 call. The other 302 stay NULL and keep rendering as "Note".
--
-- Data only: no DDL, and no note is deleted or rewritten. Only the previously
-- unused `type` column is filled ("Ne supprimer absolument aucune note ou
-- activité historique").
--
-- Idempotent via `type is null`, which also means it can never overwrite a type
-- a human has since chosen.
--
-- Rollback (ids as matched on 2026-08-24):
--   update public.deal_notes set type = null where id in (
--     -- call
--     20, 54,
--     -- email
--     11, 12, 33, 35, 69, 103, 135, 136, 147, 149,
--     215, 216, 323, 325, 335, 336, 339, 345, 351, 353,
--     -- meeting
--     5, 15, 23, 24, 49, 72, 88, 126, 127, 128,
--     143, 178, 196, 242, 251, 327, 337, 347, 358
--   );

with normalised as (
    select
        id,
        left(lower(regexp_replace(coalesce(text, ''), '\s+', ' ', 'g')), 60) as head
    from public.deal_notes
    where type is null
),

guessed as (
    select
        id,
        case
            when head ~ '(compte.?rendu|^cr ?[:-]|visio|rdv (physique|t[ée]l|du )|rendez-vous du|d[ée]mo |meeting)' then 'meeting'
            when head ~ '(^echange t[ée]l|^échange t[ée]l|^appel |^call |^point t[ée]l|suite (à )?(notre )?(appel|call))' then 'call'
            when head ~ '(^mail |^email |^e-mail |mail envoy|^relance mail)' then 'email'
        end as guess
    from normalised
)

update public.deal_notes as n
set type = g.guess
from guessed as g
where
    n.id = g.id
    and g.guess is not null
    and n.type is null;
