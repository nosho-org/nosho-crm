-- Nouvelle grille de pondération par étape (NOS-1066)
--
-- ---------------------------------------------------------------------------
-- Pourquoi une migration, et pas seulement `defaultConfiguration.ts`
-- ---------------------------------------------------------------------------
--
-- `defaultConfiguration.ts` n'est qu'un **repli**. La configuration effective
-- est chargée depuis cette table par `useConfigurationLoader`, et la production
-- y stocke déjà sa propre grille. Modifier le fichier seul n'aurait rien changé
-- pour personne — c'est exactement le piège dans lequel `20260823093000` était
-- passée avant nous, en écrivant les étapes ici plutôt qu'en comptant sur le
-- code.
--
-- ---------------------------------------------------------------------------
-- Ce qui change, et ce qui ne change pas
-- ---------------------------------------------------------------------------
--
--   qualified   30 % -> 20 %
--   demo-poc    50 % -> 40 %
--
-- Le reste de la grille demandée est déjà obtenu sans configuration :
--
--   * `closed-won` 100 %, `lost` et `churn` 0 % — `getDealProbability` tranche
--     ces cas avant de consulter la grille : un résultat connu n'est pas une
--     estimation. `churn` compte comme perdu parce qu'il figure dans
--     `dealPipelineStatuses`.
--   * `a-reclasser` reste sans entrée, donc *non pondérable* et hors des
--     totaux. C'est plus fidèle à « exclu du forecast » qu'un 0 % explicite,
--     qui la ferait compter comme une affaire estimée sans valeur.
--
-- ---------------------------------------------------------------------------
-- Effet mesuré avant écriture
-- ---------------------------------------------------------------------------
--
-- Sur les 111 opportunités commerciales ouvertes en production :
--
--   pipeline brut      1 188 499 €   (inchangé)
--   pondéré avant        290 370 €
--   pondéré après        220 460 €   soit -69 910 €, -24 %
--
-- 36 opportunités en Qualifié (540 599 € brut) et 10 en Démo/POC (158 500 €)
-- sont concernées. La baisse est arithmétique, pas commerciale : aucune affaire
-- n'est perdue, on cesse simplement de les compter plus haut qu'elles ne valent.
--
-- Les exceptions saisies à la main (`deals.probability`, NOS-817) ne sont pas
-- touchées : elles priment sur la grille.

update public.configuration
set config = jsonb_set(
    config,
    '{dealStageProbabilities}',
    jsonb_build_object(
        'lead',        10,
        'qualified',   20,
        'demo-poc',    40,
        'proposal',    70,
        'negociation', 85
    ),
    -- `true` : créer la clé si elle manque. Une installation qui vivait sur le
    -- repli du code doit repartir avec la même grille que les autres.
    true
);

do $$
declare
    v_probas jsonb;
begin
    select config -> 'dealStageProbabilities' into v_probas
    from public.configuration limit 1;

    if v_probas is null then
        raise exception 'dealStageProbabilities absent après migration';
    end if;

    if (v_probas ->> 'qualified')::int <> 20
       or (v_probas ->> 'demo-poc')::int <> 40 then
        raise exception 'Grille non appliquée : %', v_probas;
    end if;

    raise notice 'Pondération mise à jour : %', v_probas;
end $$;
