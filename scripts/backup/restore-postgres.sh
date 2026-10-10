#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ $# -ne 1 ]]; then
  printf 'Usage: %s /path/to/backup.dump.age\n' "$0" >&2
  exit 2
fi

: "${RESTORE_DB_URL:?Set RESTORE_DB_URL to the explicitly selected restore target}"
: "${RESTORE_EXPECTED_HOST:?Set RESTORE_EXPECTED_HOST independently to the approved target hostname}"
: "${RESTORE_TARGET_LABEL:?Set RESTORE_TARGET_LABEL so the operator identifies the destination}"
: "${AGE_IDENTITY_FILE:?Set AGE_IDENTITY_FILE to a private key kept outside the repository}"
: "${RESTORE_CONFIRM:?Set RESTORE_CONFIRM=I_HAVE_VERIFIED_THE_TARGET after checking the destination}"

actual_target_host="$(printf '%s' "$RESTORE_DB_URL" | sed -E 's#^[A-Za-z][A-Za-z0-9+.-]*://([^@/]+@)?([^:/?]+).*#\2#')"
if [[ -z "$actual_target_host" || "$actual_target_host" != "$RESTORE_EXPECTED_HOST" ]]; then
  printf 'Restore blocked: URL hostname does not match the independently configured expected target host.\n' >&2
  exit 1
fi

case "$RESTORE_DB_URL" in
  *sslmode=disable*|*sslmode=allow*|*sslmode=prefer*)
    printf 'Restore blocked: the target connection string explicitly requests non-required TLS.\n' >&2
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

# Production-labelled recovery takes a fresh encrypted snapshot of the current target
# before any destructive restore. Keep this artifact in independent durable storage.
if [[ "$target_normalized" == "production" || "$target_normalized" == "prod" || "$target_normalized" == "live" ]]; then
  : "${BACKUP_AGE_RECIPIENT:?Production restore requires BACKUP_AGE_RECIPIENT to protect the pre-restore snapshot}"
  : "${RESTORE_PRE_RESTORE_BACKUP_DIR:?Production restore requires a separate durable RESTORE_PRE_RESTORE_BACKUP_DIR}"
  if [[ "$RESTORE_PRE_RESTORE_BACKUP_DIR" != /* || "$RESTORE_PRE_RESTORE_BACKUP_DIR" == "/" ]]; then
    printf 'Production restore blocked: use an absolute path for the dedicated pre-restore backup directory.\n' >&2
    exit 1
  fi
  if [[ -L "$RESTORE_PRE_RESTORE_BACKUP_DIR" ]]; then
    printf 'Production restore blocked: symbolic-link pre-restore directories are not accepted.\n' >&2
    exit 1
  fi
  if [[ -e "$RESTORE_PRE_RESTORE_BACKUP_DIR" && ! -d "$RESTORE_PRE_RESTORE_BACKUP_DIR" ]]; then
    printf 'Production restore blocked: pre-restore backup path exists and is not a directory.\n' >&2
    exit 1
  fi
  mkdir -p "$RESTORE_PRE_RESTORE_BACKUP_DIR"
  canonical_pre_restore_dir="$(cd "$RESTORE_PRE_RESTORE_BACKUP_DIR" && pwd -P)"
  canonical_repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
  if [[ "$canonical_pre_restore_dir" == "/" || "$canonical_pre_restore_dir" == "$canonical_repo_root" || "$canonical_pre_restore_dir" == "$canonical_repo_root/"* ]]; then
    printf 'Production restore blocked: retain the pre-restore artifact outside the source repository.\n' >&2
    exit 1
  fi
  if find "$RESTORE_PRE_RESTORE_BACKUP_DIR" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
    printf 'Production restore blocked: pre-restore backup directory must be empty to prevent confusing old artifacts with the current snapshot.\n' >&2
    exit 1
  fi

  SUPABASE_DB_URL="$RESTORE_DB_URL" \
    BACKUP_AGE_RECIPIENT="$BACKUP_AGE_RECIPIENT" \
    BACKUP_OUTPUT_DIR="$RESTORE_PRE_RESTORE_BACKUP_DIR" \
    BACKUP_GIT_SHA="${GITHUB_SHA:-manual-restore}" \
    bash "$script_dir/create-encrypted-backup.sh"

  safety_backups=( "$RESTORE_PRE_RESTORE_BACKUP_DIR"/aghbari-postgres-*.dump.age )
  if [[ ${#safety_backups[@]} -ne 1 || ! -s "${safety_backups[0]}" ]]; then
    printf 'Production restore blocked: the pre-restore encrypted artifact was not created unambiguously.\n' >&2
    exit 1
  fi
  AGE_IDENTITY_FILE="$AGE_IDENTITY_FILE" "$script_dir/verify-encrypted-backup.sh" "${safety_backups[0]}"
  printf 'Verified pre-restore snapshot retained at: %s\n' "$RESTORE_PRE_RESTORE_BACKUP_DIR"
fi

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
