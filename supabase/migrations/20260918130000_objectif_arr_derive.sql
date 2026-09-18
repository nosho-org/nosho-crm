-- L'objectif ARR se deduit du MRR, il ne se stocke plus (NOS-1630).
--
-- Simon, le 18/09/2026 : "je veux que le MRR sur la partie tableau de bord soit
-- editable a la main et qu'ensuite l'ARR soit le MRR multiplie par 12".
--
-- ## La meme information etait saisie deux fois
--
-- La carte Objectifs stocke un objectif PAR metrique, et chaque titulaire en
-- avait deux, qui disaient la meme chose dans deux unites :
--
--   equipe ..... 25 000 de MRR, 300 000 d'ARR
--   Simon ...... 10 000 de MRR, 120 000 d'ARR
--
-- Les deux paires etaient deja exactement au facteur douze. La relation
-- existait dans la tete de Simon, pas dans le code -- et rien n'empechait les
-- deux chiffres de diverger au prochain arbitrage.
--
-- ## Seule la CIBLE est derivee, jamais la mesure
--
-- Un objectif MRR se mesure sur la moyenne des trois derniers mois complets, un
-- objectif ARR sur le cumul encaisse de l'annee (NOS-1182, NOS-1255). Deux
-- definitions differentes, etablies chacune sur un fait de Qonto. Multiplier la
-- cible par douze ne les rapproche pas : les deux pourcentages resteront
-- differents, et c'est normal.
--
-- ## Le garde-fou
--
-- La suppression ne touche QUE les objectifs ARR qui valent exactement douze
-- fois le MRR du meme titulaire, sur la meme periode. Un ARR desaccorde -- donc
-- voulu tel quel -- survit, et le code sait deja ne pas l'ecraser : la carte
-- n'ajoute la ligne calculee que lorsqu'aucun ARR n'est stocke.
--
-- Rien n'est perdu : ce qui part est reproductible au centime par la regle.

delete from public.targets arr
 where arr.metric = 'arr'
   and exists (
     select 1
       from public.targets mrr
      where mrr.metric = 'mrr'
        and mrr.sales_id is not distinct from arr.sales_id
        and mrr.period_start = arr.period_start
        and mrr.period_end   = arr.period_end
        and mrr.amount * 12  = arr.amount
   );

do $$
declare
  v_arr_restants int;
  v_mrr          int;
begin
  -- Ceux qui restent sont ceux que la regle ne reproduit pas : ils sont
  -- legitimes, et la carte les affichera tels quels.
  select count(*) into v_arr_restants
    from public.targets arr
   where arr.metric = 'arr'
     and exists (
       select 1 from public.targets mrr
        where mrr.metric = 'mrr'
          and mrr.sales_id is not distinct from arr.sales_id
          and mrr.period_start = arr.period_start
          and mrr.period_end   = arr.period_end
          and mrr.amount * 12  = arr.amount
     );

  if v_arr_restants > 0 then
    raise exception '% objectif(s) ARR redondant(s) subsistent', v_arr_restants;
  end if;

  -- Aucun titulaire ne doit se retrouver sans objectif du tout.
  select count(*) into v_mrr from public.targets where metric = 'mrr';

  if v_mrr < 1 then
    raise exception 'plus aucun objectif MRR : la carte n''aurait plus rien a afficher';
  end if;
end $$;
