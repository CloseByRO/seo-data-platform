#!/usr/bin/env bash
# Apply all versioned SQL migrations in lexical order via psql.
# Prefer: `npm run db:apply-migrations -- "<uri>"` (Node + `pg`, no psql required).
#
# Usage:
#   ./supabase/apply-migrations-in-order.sh "postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres"
#
# Requires: psql (e.g. `sudo apt install postgresql-client` on Debian/Ubuntu).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS="$ROOT/supabase/migrations"

if [[ -z "${1:-}" ]]; then
  echo "Usage: $0 <postgres_connection_uri>" >&2
  exit 1
fi

URI="$1"
shopt -s nullglob
files=("$MIGRATIONS"/[0-9][0-9][0-9][0-9]_*.sql)
IFS=$'\n' sorted=($(sort <<<"${files[*]}"))
unset IFS

if [[ ${#sorted[@]} -eq 0 ]]; then
  echo "No migration files found in $MIGRATIONS" >&2
  exit 1
fi

for f in "${sorted[@]}"; do
  echo "==> $(basename "$f")"
  psql "$URI" -v ON_ERROR_STOP=1 -f "$f"
done

echo "All migrations applied."
