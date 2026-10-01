-- Contrôle via un rôle de supervision sans accès aux tables métier.
-- Dépend de nosho/deploy/security-monitor-snapshot.sql, version 1.
-- La liste des tables déclarées vient de supabase/schemas/01_tables.sql.
WITH snapshot AS (SELECT nosho_security_monitor.snapshot() AS data),
declared_tables(name) AS (VALUES
  ('allo_contact_links'),
  ('allo_line_owners'),
  ('call_logs'),
  ('companies'),
  ('configuration'),
  ('contact_notes'),
  ('contacts'),
  ('contracts'),
  ('deal_change_log'),
  ('deal_migration_map'),
  ('deal_notes'),
  ('deals'),
  ('favicons_excluded_domains'),
  ('prospect_outreach'),
  ('prospects'),
  ('sales'),
  ('sms_messages'),
  ('tags'),
  ('tasks')
),
tables AS (SELECT x FROM snapshot, jsonb_array_elements(data->'tables') x),
functions AS (SELECT x FROM snapshot, jsonb_array_elements(data->'functions') x),
buckets AS (SELECT x FROM snapshot, jsonb_array_elements(data->'buckets') x)
SELECT 'rls_disabled' AS finding, x->>'schema'||'.'||(x->>'name') AS object,
       'Review and enable RLS' AS remediation
FROM tables WHERE NOT (x->>'rls')::boolean
UNION ALL
SELECT 'undeclared_table', 'public.'||(x->>'name'), 'Declare or retire this table'
FROM tables WHERE x->>'schema'='public' AND x->>'name' NOT IN (SELECT name FROM declared_tables)
UNION ALL
SELECT 'anon_table_grant', x->>'schema'||'.'||(x->>'name'), 'Review anonymous grants and policies'
FROM tables WHERE (x->>'anon_select')::boolean OR (x->>'anon_write')::boolean
UNION ALL
SELECT 'anon_function_grant', x->>'name', 'Review anonymous EXECUTE grant'
FROM functions WHERE (x->>'anon_execute')::boolean
UNION ALL
SELECT 'public_storage_bucket', x->>'name', 'Review public bucket'
FROM buckets WHERE (x->>'public')::boolean
ORDER BY finding, object;
