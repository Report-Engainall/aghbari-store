#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ $# -ne 1 ]]; then
  printf 'Usage: %s /path/to/backup.dump.age\n' "$0" >&2
  exit 2
fi

: "${RESTORE_DB_URL:?Set RESTORE_DB_URL to the explicitly selected restore target}"
: "${RESTORE_TARGET_LABEL:?Set RESTORE_TARGET_LABEL so the operator identifies the destination}"
: "${AGE_IDENTITY_FILE:?Set AGE_IDENTITY_FILE to a private key kept outside the repository}"
: "${RESTORE_CONFIRM:?Set RESTORE_CONFIRM=I_HAVE_VERIFIED_THE_TARGET after checking the destination}"

case "$RESTORE_DB_URL" in
  *sslmode=disable*|*sslmode=allow*|*sslmode=prefer*)
    printf 'Restore blocked: the target connection string explicitly requests non-required TLS.\\n' >&2
    exit 1
    ;;
esac
if [[ "$RESTORE_CONFIRM" != "I_HAVE_VERIFIED_THE_TARGET" ]]; then
  printf 'Restore blocked: explicit target confirmation is required.\n' >&2
  exit 1
fi

target_normalized="$(printf '%s' "$RESTORE_TARGET_LABEL" | tr '[:upper:]' '[:lower:]')"
if [[ "$target_normalized" == "production" || "$target_normalized" == "prod" || "$target_normalized" == "live" ]]; then
  if [[ "${ALLOW_PRODUCTION_RESTORE:-}" != "I_ACCEPT_PRODUCTION_DATA_OVERWRITE" ]]; then
    printf 'Production restore blocked. A separate explicit production overwrite acknowledgement is required.\n' >&2
    exit 1
  fi
fi

backup_file="$1"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGE_IDENTITY_FILE="$AGE_IDENTITY_FILE" "$script_dir/verify-encrypted-backup.sh" "$backup_file"

temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/aghbari-restore.XXXXXX")"
cleanup() { rm -rf "$temporary_dir"; }
trap cleanup EXIT
plaintext_dump="$temporary_dir/database.dump"

age --decrypt --identity "$AGE_IDENTITY_FILE" --output "$plaintext_dump" "$backup_file"
pg_restore --list "$plaintext_dump" >/dev/null

printf 'WARNING: restoring can drop and replace objects in target label: %s\n' "$RESTORE_TARGET_LABEL"
printf 'Restore target host and credentials are not printed. Ensure this is a compatible, approved PostgreSQL target.\n'
PGSSLMODE=require pg_restore \
  --clean \
  --if-exists \
  --exit-on-error \
  --no-owner \
  --no-acl \
  --dbname="$RESTORE_DB_URL" \
  "$plaintext_dump"

printf 'RESTORE COMMAND COMPLETED for target label %s. Perform application-level smoke tests before classifying recovery as proven.\n' "$RESTORE_TARGET_LABEL"
