#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ $# -ne 1 ]]; then
  printf 'Usage: %s /path/to/backup.dump.age\n' "$0" >&2
  exit 2
fi

backup_file="$1"
manifest_file="$backup_file.manifest.json"
test -s "$backup_file" || { printf 'Backup file is missing or empty.\n' >&2; exit 1; }
test -s "$manifest_file" || { printf 'Backup manifest is missing or empty.\n' >&2; exit 1; }

expected_sha="$(sed -n 's/.*"ciphertext_sha256": "\([^"]*\)".*/\1/p' "$manifest_file")"
actual_sha="$(sha256sum "$backup_file" | awk '{print $1}')"
if [[ -z "$expected_sha" || "$expected_sha" != "$actual_sha" ]]; then
  printf 'INTEGRITY FAILURE: manifest hash does not match the encrypted artifact.\n' >&2
  exit 1
fi
printf 'PASS: encrypted artifact SHA-256 matches its manifest.\n'

if [[ -z "${AGE_IDENTITY_FILE:-}" ]]; then
  printf 'PARTIAL: checksum verified only. Set AGE_IDENTITY_FILE offline to verify decryption and pg_dump format.\n'
  exit 10
fi

command -v age >/dev/null 2>&1 || { printf 'Required utility missing: age\n' >&2; exit 127; }
command -v pg_restore >/dev/null 2>&1 || { printf 'Required utility missing: pg_restore\n' >&2; exit 127; }
test -r "$AGE_IDENTITY_FILE" || { printf 'AGE_IDENTITY_FILE is not readable.\n' >&2; exit 1; }

temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/aghbari-verify.XXXXXX")"
cleanup() { rm -rf "$temporary_dir"; }
trap cleanup EXIT
plaintext_dump="$temporary_dir/database.dump"

age --decrypt --identity "$AGE_IDENTITY_FILE" --output "$plaintext_dump" "$backup_file"
pg_restore --list "$plaintext_dump" >/dev/null
printf 'PASS: offline key decrypted the archive and pg_restore recognized its structure. This is not yet a restore drill.\n'
