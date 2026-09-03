-- ---------------------------------------------------------------------------
-- Chercher une opportunite par l email d un contact (NOS-1235)
-- ---------------------------------------------------------------------------
-- Simon : "je veux que le champ de recherche permette de rechercher aussi
-- bien une societe qu un client via email, nom, prenom".
--
-- La vue exposait deja `company_name` et `contact_names` : societe, nom et
-- prenom etaient donc couverts. L email, non -- il vit dans
-- `contacts.email_jsonb`, un tableau `[{type, email}]` qu aucune colonne ne
-- mettait a plat.
--
-- Les deux colonnes s ajoutent A LA FIN du SELECT : `create or replace view`
-- accepte l ajout en queue, jamais l insertion au milieu.
--
-- La sous-requete est correlee au contact de la jointure, et non a
-- l opportunite : un `jsonb_array_elements` dans le FROM multiplierait les
-- lignes, et chaque contact serait alors repete autant de fois qu il a
-- d adresses -- ce qui gonflerait le `string_agg` des noms juste au-dessus.

create or replace view public.deals_summary with (security_invoker = on) as SELECT d.id,
    d.name,
    d.company_id,
    d.contact_ids,
    d.category,
    d.stage,
    d.description,
    d.amount,
    d.created_at,
    d.updated_at,
    d.archived_at,
    d.expected_closing_date,
    d.sales_id,
    d.index,
    d.trial_start_date,
    d.company_type,
    d.won_at,
    d.name_search,
    d.category_search,
    d.description_search,
    d.proposal_edit_url,
    d.proposal_public_url,
    d.next_action,
    d.next_action_date,
    d.opportunity_type,
    d.contact_roles,
    d.legacy_stage,
    d.entered_at,
    d.priority,
    d.priority_rank,
    d.lead_source,
    d.referrer_id,
    d.mrr,
    d.arr_is_manual,
    d.products,
    d.probability,
    d.next_action_owner_id,
    d.legacy_category,
    COALESCE(d.company_type, ''::text) AS company_type_key,
    comp.name AS company_name,
    replace(lower(immutable_unaccent(COALESCE(comp.name, ''::text))), ' '::text, ''::text) AS company_name_search,
    COALESCE(string_agg((c.first_name || ' '::text) || c.last_name, ' '::text), ''::text) AS contact_names,
    replace(lower(immutable_unaccent(COALESCE(string_agg((c.first_name || ' '::text) || c.last_name, ' '::text), ''::text))), ' '::text, ''::text) AS contact_names_search,
    GREATEST(d.updated_at, ( SELECT max(dn.date) AS max
           FROM deal_notes dn
          WHERE dn.deal_id = d.id), ( SELECT max(cl.started_at) AS max
           FROM call_logs cl
          WHERE cl.deal_id = d.id)) AS last_activity_at,
    ( SELECT t.due_date
           FROM tasks t
          WHERE t.done_date IS NULL AND (t.deal_id = d.id OR (t.contact_id = ANY (d.contact_ids)))
          ORDER BY t.due_date, t.id
         LIMIT 1) AS next_task_date,
    ( SELECT t.text
           FROM tasks t
          WHERE t.done_date IS NULL AND (t.deal_id = d.id OR (t.contact_id = ANY (d.contact_ids)))
          ORDER BY t.due_date, t.id
         LIMIT 1) AS next_task_text,
    coalesce(string_agg((select string_agg(e.value ->> 'email', ' ') from jsonb_array_elements(coalesce(c.email_jsonb, '[]'::jsonb)) e), ' '), '') as contact_emails,
    replace(lower(immutable_unaccent(coalesce(string_agg((select string_agg(e.value ->> 'email', ' ') from jsonb_array_elements(coalesce(c.email_jsonb, '[]'::jsonb)) e), ' '), ''))), ' ', '') as contact_emails_search
   FROM deals d
     LEFT JOIN contacts c ON c.id = ANY (d.contact_ids)
     LEFT JOIN companies comp ON comp.id = d.company_id
  GROUP BY d.id, comp.name;