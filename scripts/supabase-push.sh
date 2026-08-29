#!/usr/bin/env bash
# Push pending Supabase migrations via the Management REST API.
#
# This script is used instead of `npx supabase db push` because the
# direct Postgres connection (required by the CLI) is unavailable in
# the Claude Code environment (no DNS resolver for *.supabase.co).
# The Management API at https://api.supabase.com IS reachable.
#
# Usage (called automatically by `make supabase-push`):
#   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_ID=... ./scripts/supabase-push.sh
#
# Both variables are injected by Doppler when running via `make supabase-push`.

set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?'SUPABASE_ACCESS_TOKEN is required'}"
: "${SUPABASE_PROJECT_ID:?'SUPABASE_PROJECT_ID is required'}"

API="https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/database/query"
MIGRATIONS_DIR="$(dirname "$0")/../supabase/migrations"

run_sql() {
  local result
  result=$(curl -sf -X POST \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    --data-binary "$(jq -n --arg q "$1" '{"query": $q}')" \
    "$API")
  # Surface errors (non-array responses contain a "message" field)
  if echo "$result" | jq -e '.message' > /dev/null 2>&1; then
    echo "  ERROR: $(echo "$result" | jq -r '.message')" >&2
    return 1
  fi
  echo "$result"
}

# Fetch already-applied versions from remote
APPLIED=$(run_sql "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version" \
  | jq -r '.[].version')

echo "Checking pending migrations..."
PENDING=0

for file in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
  filename=$(basename "$file")
  version="${filename%%_*}"
  name="${filename%.sql}"
  name="${name#${version}_}"

  if echo "$APPLIED" | grep -qx "$version"; then
    continue
  fi

  # ---------------------------------------------------------------------
  # Garde-fou ASCII
  # ---------------------------------------------------------------------
  # Ce script lit la migration avec `cat` puis la passe a `jq --arg`. Sous Git
  # Bash / Windows, tout caractere non-ASCII y devient U+FFFD : la migration
  # part en production avec des losanges a la place des accents.
  #
  # La regle etait ecrite en tete de chaque fichier de migration, et a ete
  # violee deux fois en une journee -- une fois sur des commentaires de table,
  # une fois sur des commentaires SQL. La prochaine fois, ce sera sur une
  # donnee, et il n'y aura pas de retour en arriere.
  #
  # D'ou ce controle : la regle ne repose plus sur la vigilance de qui ecrit.
  if LC_ALL=C grep -qn '[^ -~]' "$file"; then
    echo "  ERROR: $filename contient des caracteres non-ASCII." >&2
    echo "  Ce script les detruit (cat + jq --arg sous Git Bash)." >&2
    echo "  Lignes fautives :" >&2
    LC_ALL=C grep -n '[^ -~]' "$file" | head -5 >&2
    exit 1
  fi

  echo "  Applying: $filename"
  SQL=$(cat "$file")
  run_sql "$SQL" > /dev/null

  # Record in migrations table
  run_sql "INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
           VALUES ('$version', '$name', ARRAY[]::text[])
           ON CONFLICT (version) DO NOTHING;" > /dev/null

  echo "  ✓ Applied and recorded: $version"
  PENDING=$((PENDING + 1))
done

if [ "$PENDING" -eq 0 ]; then
  echo "No pending migrations."
else
  echo "Done. $PENDING migration(s) applied."
fi
