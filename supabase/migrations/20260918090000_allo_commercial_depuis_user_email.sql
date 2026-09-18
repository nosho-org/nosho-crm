-- Attribuer un appel Allo a celui qui l'a reellement traite (NOS-1623).
--
-- Simon, le 18/09/2026 : "je veux qu'on puisse bien remonter les appels entre
-- le numero allo 0757903109 et les numeros des contacts associes a une
-- opportunite. Et pars du principe que ce numero n'est utilise que par
-- Alexandre Cavaillon".
--
-- ## Ce que la mesure a dit, et pourquoi on fait mieux que demande
--
-- La ligne 0757903109 porte 29 appels, des 16 et 17 septembre, et AUCUN n'avait
-- de commercial : la ligne n'etait pas declaree dans `allo_line_owners`.
--
-- Simon a raison sur le fond -- c'est bien Alexandre qui s'en sert -- mais pas
-- tout a fait : sur ces 29 appels, `user_email` dit Alexandre 24 fois, Thomas 4
-- fois et Simon 1 fois. Une regle "cette ligne appartient a Alexandre" aurait
-- donc attribue cinq appels a la mauvaise personne, dont les transcriptions
-- qu'on veut justement relire avec le bon commercial.
--
-- Or Allo transmet deja `user_email` : l'utilisateur Allo qui a passe ou pris
-- l'appel. Mesure sur l'ensemble :
--
--   presence de user_email ............ 104 / 104
--   adresses reconnues comme sales ....   5 /   5
--   sales_id rempli aujourd'hui .......  66 / 104
--   appels que user_email recupere .....  38
--   appels ou la regle de ligne se trompe   5
--
-- `user_email` est donc plus complet ET plus juste que la ligne. Il devient la
-- source principale ; `allo_line_owners` reste le repli quand Allo ne dit pas
-- qui a decroche.
--
-- ## Pourquoi un declencheur, et pas une reecriture de process_allo_call()
--
-- La resolution vit au milieu d'une fonction de deux cents lignes. La recopier
-- pour en changer six, dans une migration qui ne se relit qu'une fois, offre
-- surtout l'occasion d'y introduire une faute ailleurs. Un declencheur BEFORE
-- INSERT porte la regle a un seul endroit, s'applique a TOUS les chemins
-- d'ecriture -- le webhook, une reprise, un import -- et se lit en entier.
--
-- Il ne contredit jamais une attribution deliberee : il ne parle que lorsque
-- `user_email` designe un compte connu. Sinon il laisse passer ce que
-- `process_allo_call` avait calcule.

-- 1. La ligne d'Alexandre, declaree comme repli (demande de Simon).
--    Elle ne servira que si Allo cesse d'envoyer `user_email`.
insert into public.allo_line_owners (allo_phone_number, sales_id)
select '+33757903109', s.id
  from public.sales s
 where lower(s.email) = 'alexandre@nosho.io'
   and not exists (
     select 1 from public.allo_line_owners lo
      where public.allo_normalize_phone(lo.allo_phone_number)
          = public.allo_normalize_phone('0757903109')
   );

-- 2. La regle : l'utilisateur Allo qui a traite l'appel prime sur la ligne.
create or replace function public.allo_sales_depuis_user_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sales_id bigint;
begin
  if nullif(btrim(new.user_email), '') is null then
    return new;
  end if;

  select s.id into v_sales_id
    from public.sales s
   where lower(s.email) = lower(btrim(new.user_email))
   limit 1;

  -- Adresse inconnue du CRM : on ne touche a rien. Mieux vaut l'attribution
  -- calculee par la ligne que pas d'attribution du tout.
  if v_sales_id is not null then
    new.sales_id := v_sales_id;
  end if;

  return new;
end;
$$;

grant all on function public.allo_sales_depuis_user_email() to service_role;

drop trigger if exists trg_allo_sales_depuis_user_email on public.call_logs;
create trigger trg_allo_sales_depuis_user_email
  before insert on public.call_logs
  for each row execute function public.allo_sales_depuis_user_email();

-- 3. Reprise des 104 appels deja en base.
--
-- Corrige les 38 sans commercial et les 5 attribues a la mauvaise personne.
-- Le declencheur ne s'applique qu'aux insertions : la reprise est donc
-- explicite, et son perimetre se lit dans le WHERE.
update public.call_logs cl
   set sales_id = s.id
  from public.sales s
 where lower(s.email) = lower(btrim(cl.user_email))
   and nullif(btrim(cl.user_email), '') is not null
   and cl.sales_id is distinct from s.id;

-- 4. Rejouer le rattachement a l'opportunite.
--
-- `process_allo_call` le calcule UNE FOIS, a l'arrivee du webhook. Un appel
-- passe avant que l'affaire n'existe -- le cas normal en prospection -- reste
-- donc orphelin pour toujours. Meme regle que la fonction : affaire non
-- archivee contenant le contact, la plus recemment modifiee d'abord.
update public.call_logs cl
   set deal_id = (
         select d.id
           from public.deals d
          where d.archived_at is null
            and d.contact_ids @> array[cl.contact_id]
          order by d.updated_at desc, d.id desc
          limit 1
       )
 where cl.deal_id is null
   and cl.contact_id is not null
   and exists (
     select 1 from public.deals d
      where d.archived_at is null
        and d.contact_ids @> array[cl.contact_id]
   );

-- 5. Assertions : ce que la migration promet doit etre vrai en sortie.
do $$
declare
  v_sans_commercial int;
  v_en_desaccord    int;
  v_ligne           int;
begin
  select count(*) into v_sans_commercial
    from public.call_logs
   where sales_id is null
     and nullif(btrim(user_email), '') is not null
     and exists (select 1 from public.sales s
                  where lower(s.email) = lower(btrim(user_email)));

  if v_sans_commercial > 0 then
    raise exception '% appel(s) ont un user_email connu et restent sans commercial',
      v_sans_commercial;
  end if;

  select count(*) into v_en_desaccord
    from public.call_logs cl
    join public.sales s on s.id = cl.sales_id
   where nullif(btrim(cl.user_email), '') is not null
     and lower(s.email) <> lower(btrim(cl.user_email))
     and exists (select 1 from public.sales s2
                  where lower(s2.email) = lower(btrim(cl.user_email)));

  if v_en_desaccord > 0 then
    raise exception '% appel(s) restent attribues a quelqu''un d''autre que celui qui les a traites',
      v_en_desaccord;
  end if;

  select count(*) into v_ligne
    from public.allo_line_owners lo
   where public.allo_normalize_phone(lo.allo_phone_number)
       = public.allo_normalize_phone('0757903109');

  if v_ligne <> 1 then
    raise exception 'la ligne 0757903109 est declaree % fois', v_ligne;
  end if;
end $$;
