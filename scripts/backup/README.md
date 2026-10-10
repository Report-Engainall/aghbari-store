# Encrypted PostgreSQL Backup and Restore

**Capability state: PARTIAL / CONFIGURATION REQUIRED.** The scripts and scheduled workflow are implemented. No backup is considered created until a real workflow produces a non-empty encrypted artifact + manifest. No restore is considered proven until a compatible isolated target is restored and smoke-tested.

## What this backs up

The workflow creates a PostgreSQL logical custom-format dump using `pg_dump`, encrypts it with age public-key encryption, then stores only the encrypted dump and an integrity manifest as a GitHub Actions artifact. The standalone backup script defaults to `$HOME/.local/share/aghbari/encrypted-backups`; override `BACKUP_OUTPUT_DIR` only with a dedicated directory outside the repository and outside shared/group-writable directories. The scheduled trigger runs daily at 02:17 UTC; manual execution is also supported. Artifact retention is 14 days. This is a zero-additional-service-cost-first option subject to available GitHub Actions usage/storage limits and the database connection configuration.

It is **not** a complete Supabase-project backup: Storage object bytes, Edge Function source/secrets, project configuration, external-provider credentials, and a verified recovery point are not included. The manifest declares those exclusions. A PostgreSQL archive is not called a full disaster-recovery guarantee until an isolated restore and application checks pass.

## One-time setup (secrets must not be committed)

1. On a trusted offline machine, install `age` and generate a key pair: `age-keygen -o aghbari-backup.agekey`. Keep the private key file offline and make a secure second copy outside this repository. Never upload it to GitHub or the app.
2. Add repository Actions secret `BACKUP_AGE_RECIPIENT` containing only the public `age1...` recipient printed by age-keygen.
3. Add repository Actions secret `SUPABASE_DB_URL` containing a direct PostgreSQL connection string for the database account approved for backups, with SSL required. Use a dedicated minimum-privilege role where possible. Do not put it in README, source, issues, logs or `VITE_*` variables.
4. Manually run “Encrypted PostgreSQL Backup” from Actions, then verify that the workflow actually created a `.dump.age` file and matching `.manifest.json`. A queued, skipped or failed run is not a backup.
5. Download the encrypted artifact through authenticated GitHub access, copy it to independent storage you control if longer retention is required, and verify its checksum. GitHub retention here is 14 days; artifacts expire automatically.

## Verify an artifact offline

Install `age`, `postgresql-client` and Python 3, keep the private key outside the repository, and run:

```bash
AGE_IDENTITY_FILE=/secure/path/aghbari-backup.agekey \
  bash scripts/backup/verify-encrypted-backup.sh /path/to/aghbari-postgres-YYYYMMDDTHHMMSSZ.dump.age
```

The tool validates the manifest hash, decrypts with the offline private key and confirms `pg_restore --list` recognizes the archive. This validates artifact integrity/format but does not prove that a restore works.

## Restore — isolated target first

Use a fresh compatible PostgreSQL/Supabase recovery target, not the live database. The restore target may require matching extensions and platform-managed roles/schema. Keep the original production database untouched while validating the result.

```bash
RESTORE_DB_URL='postgresql://...target connection with SSL...' \
RESTORE_EXPECTED_HOST='the-approved-recovery-hostname' \
RESTORE_TARGET_LABEL='isolated-test' \
RESTORE_CONFIRM='I_HAVE_VERIFIED_THE_TARGET' \
AGE_IDENTITY_FILE='/secure/path/aghbari-backup.agekey' \
  bash scripts/backup/restore-postgres.sh /path/to/backup.dump.age
```

The script requires the connection hostname to match an independently configured `RESTORE_EXPECTED_HOST`, plus a destination label and confirmation sentinel. A destination labelled `production`, `prod` or `live` is additionally blocked unless `ALLOW_PRODUCTION_RESTORE=I_ACCEPT_PRODUCTION_DATA_OVERWRITE` is provided. That override can overwrite data; it should not be used as the first restore test. Before the script reaches the destructive restore step, it also creates a fresh age-encrypted logical backup of the current target and verifies the artifact using the offline key. Production restore therefore additionally requires `BACKUP_AGE_RECIPIENT` and `RESTORE_PRE_RESTORE_BACKUP_DIR` pointing to a dedicated empty directory on durable, independent storage. The encrypted pre-restore artifact and manifest are intentionally retained even if the later restore fails.

After restore, run migration/schema compatibility checks and application smoke tests for login/tenant access, products/prices, orders/order_items, invoices, payments, stock, outbox/idempotency and RLS. Record exact artifact hash, target version, test results and cleanup. Do not claim full recovery until those pass.

## Security and operations

- Only an age public recipient is exposed to the backup workflow; the private key remains offline.
- The connection string is passed through environment variables and is never echoed or written to the manifest.
- The database dump is temporarily stored on the ephemeral runner, encrypted, and then its plaintext temporary file is removed. This is not a claim of cryptographic erasure of SSD blocks; the runner is ephemeral and the artifact contains ciphertext only.
- Workflow failure to find required secrets fails closed and explicitly reports BLOCKED in the job summary. No fake green backup run is produced.
- Retention is intentionally short to control storage use. Store a separate encrypted copy for longer-term resilience.
- The workflow cannot be called proven until configured and actually executed. Live database credentials/configuration are not available to this repository edit, so this change does not run a backup now.
