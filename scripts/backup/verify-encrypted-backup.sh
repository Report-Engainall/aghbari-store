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

command -v python3 >/dev/null 2>&1 || { printf 'Required utility missing: python3\n' >&2; exit 127; }
python3 - "$manifest_file" "$backup_file" <<'PY'
import hashlib
import json
import os
import re
import sys

manifest_path, artifact_path = sys.argv[1:3]
try:
    with open(manifest_path, "r", encoding="utf-8") as handle:
        manifest = json.load(handle)
except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
    print(f"INTEGRITY FAILURE: backup manifest is not valid readable JSON ({exc}).", file=sys.stderr)
    sys.exit(1)

if manifest.get("backup_format") != "postgresql-pg_dump-custom-age":
    print("INTEGRITY FAILURE: unsupported backup format.", file=sys.stderr)
    sys.exit(1)
if manifest.get("encryption") != "age public-key encryption":
    print("INTEGRITY FAILURE: unexpected backup encryption metadata.", file=sys.stderr)
    sys.exit(1)
if manifest.get("artifact_file") != os.path.basename(artifact_path):
    print("INTEGRITY FAILURE: manifest artifact filename does not match the supplied file.", file=sys.stderr)
    sys.exit(1)

expected = manifest.get("ciphertext_sha256")
if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected):
    print("INTEGRITY FAILURE: manifest SHA-256 is missing or malformed.", file=sys.stderr)
    sys.exit(1)
try:
    declared_bytes = int(manifest["ciphertext_bytes"])
except (KeyError, TypeError, ValueError):
    print("INTEGRITY FAILURE: ciphertext size is missing or malformed.", file=sys.stderr)
    sys.exit(1)
actual_bytes = os.path.getsize(artifact_path)
if declared_bytes != actual_bytes:
    print("INTEGRITY FAILURE: encrypted artifact size differs from the manifest.", file=sys.stderr)
    sys.exit(1)

digest = hashlib.sha256()
with open(artifact_path, "rb") as handle:
    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
        digest.update(chunk)
if digest.hexdigest() != expected:
    print("INTEGRITY FAILURE: manifest hash does not match the encrypted artifact.", file=sys.stderr)
    sys.exit(1)
print("PASS: encrypted artifact size and SHA-256 match a valid manifest.")
PY

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
