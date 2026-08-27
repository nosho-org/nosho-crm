-- Repare le libelle de la priorite P1 (NOS-1067)
--
-- ---------------------------------------------------------------------------
-- Ce qui s'est passe
-- ---------------------------------------------------------------------------
--
-- La migration 20260827093000 ecrivait le libelle accentue litteralement. Le
-- fichier est bien en UTF-8, mais scripts/supabase-push.sh fait
-- `SQL=$(cat "$file")` puis passe la chaine a `jq --arg` : sous un shell qui
-- n'est pas en locale UTF-8 -- Git Bash sous Windows, ici -- chaque caractere
-- accentue est remplace par U+FFFD avant meme d'atteindre l'API.
--
-- Resultat en production : 503120 efbfbd 6c6576 efbfbd 65, soit un libelle
-- illisible sur toutes les pastilles de priorite elevee.
--
-- ---------------------------------------------------------------------------
-- La regle a retenir
-- ---------------------------------------------------------------------------
--
-- AUCUN caractere non-ASCII dans une migration, des lors qu'elle ecrit des
-- DONNEES. Toute chaine destinee a etre stockee s'ecrit en echappements
-- Unicode : Postgres interprete \uXXXX dans une chaine E'...', et un fichier
-- entierement ASCII traverse n'importe quel pipeline sans s'abimer.
--
--     E'P1 \u00C9lev\u00E9e'  ->  P1 Elevee, accents compris
--
-- Ce fichier est donc volontairement sans accent, jusque dans ses commentaires :
-- une regle qu'on enonce en la violant ne tient pas longtemps.
--
-- Les autres migrations de la journee n'ecrivaient que des nombres ou du
-- commentaire ; 20260827093000 est la seule a avoir stocke du texte accentue.

update public.configuration
set config = jsonb_set(
    config,
    '{dealPriorities}',
    (
        select jsonb_agg(
            case
                when value ->> 'value' = 'important'
                    then jsonb_set(value, '{label}',
                                   to_jsonb(E'P1 \u00C9lev\u00E9e'::text))
                else value
            end
            order by (value ->> 'weight')::int desc
        )
        from public.configuration c2,
             jsonb_array_elements(c2.config -> 'dealPriorities') value
    )
);

do $$
declare
    v_label text;
    v_hex   text;
begin
    select value ->> 'label' into v_label
    from public.configuration c,
         jsonb_array_elements(c.config -> 'dealPriorities') value
    where value ->> 'value' = 'important';

    v_hex := encode(convert_to(v_label, 'UTF8'), 'hex');

    if v_label <> E'P1 \u00C9lev\u00E9e' then
        raise exception 'Libelle toujours abime : % (hex %)', v_label, v_hex;
    end if;

    -- Cast explicite plus haut : to_jsonb est polymorphe, et un litteral nu
    -- arrive en type `unknown` -- le serveur repond 42804 sans autre indice.
    --
    -- efbfbd est le caractere de remplacement U+FFFD : sa presence signerait
    -- une nouvelle corruption, meme si la comparaison ci-dessus passait.
    if position('efbfbd' in v_hex) > 0 then
        raise exception 'Caractere de remplacement detecte : %', v_hex;
    end if;

    raise notice 'Libelle repare, hex %', v_hex;
end $$;
