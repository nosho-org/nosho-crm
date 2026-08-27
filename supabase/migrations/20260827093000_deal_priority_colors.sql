-- Couleurs des priorités : P0 rouge, P1 bleu, P2 gris (NOS-1067)
--
-- Une seule teinte change réellement : P1 passe d'orange à bleu.
--
-- Dans ce CRM l'orange veut déjà dire « quelque chose ne va pas » —
-- `--deal-status-warning` porte l'inactivité, les alertes, les échéances
-- dépassées. Une affaire P1 n'est pas en difficulté, elle est importante.
-- Deux sens sur une même teinte, et on ne sait plus lequel on lit.
--
-- Comme pour la pondération (20260827090000), le fichier
-- `defaultConfiguration.ts` n'est qu'un repli : la production stocke ses
-- propres `dealPriorities` ici, `dotClassName` compris. Sans cette migration le
-- changement ne se verrait qu'en démo.
--
-- La liste est réécrite en entier plutôt que corrigée en place : `jsonb_set` sur
-- un élément de tableau demande son index, et un index en dur casserait
-- silencieusement le jour où l'ordre des priorités change. Les trois valeurs,
-- libellés et poids sont donc réaffirmés tels quels — seule la couleur bouge.

update public.configuration
set config = jsonb_set(
    config,
    '{dealPriorities}',
    jsonb_build_array(
        jsonb_build_object(
            'value', 'urgent',
            'label', 'P0 Critique',
            'dotClassName', 'bg-red-500',
            'weight', 2
        ),
        jsonb_build_object(
            'value', 'important',
            'label', 'P1 Élevée',
            'dotClassName', 'bg-blue-500',
            'weight', 1
        ),
        jsonb_build_object(
            'value', 'normal',
            'label', 'P2 Normale',
            'dotClassName', 'bg-muted-foreground/40',
            'weight', 0
        )
    ),
    true
);

do $$
declare
    v_priorities jsonb;
    v_p1 jsonb;
begin
    select config -> 'dealPriorities' into v_priorities
    from public.configuration limit 1;

    if v_priorities is null or jsonb_array_length(v_priorities) <> 3 then
        raise exception 'dealPriorities invalide après migration : %', v_priorities;
    end if;

    select value into v_p1
    from jsonb_array_elements(v_priorities) value
    where value ->> 'value' = 'important';

    if v_p1 ->> 'dotClassName' <> 'bg-blue-500' then
        raise exception 'P1 n''est pas passée au bleu : %', v_p1;
    end if;

    -- Les poids pilotent le tri par priorité : les vérifier évite qu'une
    -- réécriture de la liste ne les perde en silence.
    if (select count(*) from jsonb_array_elements(v_priorities) v
        where v ? 'weight') <> 3 then
        raise exception 'Un poids manque : %', v_priorities;
    end if;

    raise notice 'Priorités mises à jour : %', v_priorities;
end $$;
