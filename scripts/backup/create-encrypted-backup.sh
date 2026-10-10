#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL in the trusted runtime environment}"
: "${BACKUP_AGE_RECIPIENT:?Set BACKUP_AGE_RECIPIENT to the offline-held age public recipient}"

# Reject explicit plaintext transport. PGSSLMODE=require is also set for libpq.
case "$SUPABASE_DB_URL" in
  *sslmode=disable*|*sslmode=allow*|*sslmode=prefer*)
    printf 'Backup blocked: the connection string explicitly requests non-required TLS.\\n' >&2
    exit 1
    ;;
esac

for command_name in pg_dump age sha256sum awk stat date mktemp; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Required backup utility missing: %s\n' "$command_name" >&2
    exit 127
  }
done

output_dir="${BACKUP_OUTPUT_DIR:-./artifacts/encrypted-backups}"
mkdir -p "$output_dir"
chmod 700 "$output_dir"

temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/aghbari-backup.XXXXXX")"
cleanup() {
  rm -rf "$temporary_dir"
}
trap cleanup EXIT

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_file="$temporary_dir/database.dump"
backup_name="aghbari-postgres-${timestamp}.dump.age"
backup_file="$output_dir/$backup_name"
manifest_file="$backup_file.manifest.json"

printf 'Creating PostgreSQL logical dump (connection value is not logged).\n'
PGSSLMODE=require pg_dump \
  --dbname="$SUPABASE_DB_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$dump_file"

test -s "$dump_file" || {
  printf 'Backup blocked: pg_dump produced an empty file.\n' >&2
  exit 1
}

age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$backup_file" "$dump_file"
test -s "$backup_file" || {
  printf 'Backup blocked: encrypted artifact is missing or empty.\n' >&2
  exit 1
}

# Remove the plaintext copy promptly; this is not represented as cryptographic erasure.
rm -f "$dump_file"

ciphertext_sha256="$(sha256sum "$backup_file" | awk '{print $1}')"
ciphertext_bytes="$(stat -c '%s' "$backup_file")"
created_at_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
source_commit="${BACKUP_GIT_SHA:-unknown}"

cat > "$manifest_file" <<MANIFEST
{
  "backup_format": "postgresql-pg_dump-custom-age",
  "created_at_utc": "$created_at_utc",
  "source_commit": "$source_commit",
  "artifact_file": "$backup_name",
  "ciphertext_sha256": "$ciphertext_sha256",
  "ciphertext_bytes": $ciphertext_bytes,
  "encryption": "age public-key encryption",
  "scope": "Logical PostgreSQL database dump accessible to the configured connection.",
  "excluded_scope": [
    "Supabase Storage object bytes",
    "Edge Function source and secrets",
    "project-level configuration and external provider secrets",
    "a verified restore outcome"
  ],
  "restore_status": "not_verified_until_decryption_and_isolated_restore_succeed"
}
MANIFEST

chmod 600 "$backup_file" "$manifest_file"
printf 'Encrypted artifact created: %s\n' "$backup_name"
printf 'Ciphertext SHA-256: %s\n' "$ciphertext_sha256"
printf 'Manifest created. No plaintext dump is included in the output directory.\n'
