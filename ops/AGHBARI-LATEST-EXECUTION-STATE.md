# Aghbari Commerce — Latest Execution State

**State updated:** 2026-10-10  
**Repository:** `Report-Engainall/aghbari-store`  
**Base/main last verified:** `a5f3924d30423f327b4c12fde8341daa446d682a`  
**Last source-inspected candidate before this state refresh:** `254fbdd8c47c3f1dfd52254beae13ebc19cc5274`  
**Working branch / PR:** `feat/integrated-ai-assistant` / [PR #4](https://github.com/Report-Engainall/aghbari-store/pull/4)  
**Resume protocol:** retrieve live main SHA, PR head SHA, changed file list and Actions conclusions before executing. This file's write itself changes branch HEAD, so never infer current HEAD from this stored value.

## Implemented in the active working branch (read back from GitHub)
- Dedicated Arabic RTL `/admin/ai/assistant` component integrated into App routing and shared AdminShell navigation.
- Assistant reads saved ai_reports/ai_alerts/ai_tasks using the active organization's ID; clears in-memory conversation when organization changes; latest implementation ignores stale responses.
- AI landing page links directly to the assistant.
- AI lists gained real loading/error/retry behavior and stale-read protection.
- Dashboard customer count corrected to the customers table; product/order counts are organization scoped; sample metrics are labelled; hard-coded healthy status removed.
- Static contract assertions added for assistant route, tenant scoping, organization-switch reset/stale-request defense, AI list error behavior and dashboard truthfulness.
- Persistent project memory and canonical master specification are now added as repository files; README links the control files and contract verification asserts their continued presence.
- Pricing UI now distinguishes backend load errors from empty rules, provides retry, guards create/toggle/delete handlers, and confirms destructive deletion.
- Adds encrypted PostgreSQL backup writer/workflow, SHA-256 manifest, offline verification, guarded restore utility, runbook, ShellCheck/syntax CI gate and static contracts. This remains PARTIAL until the required repository secrets are configured and a real artifact + isolated restore is proven.

## Verified (repository-content level only)
- GitHub readback confirms the changed code/docs exist in the working branch.
- The assistant's database reads explicitly include active organization scope.
- The assistant displays that no generative model is configured; it is a deterministic saved-record summarizer, not a functioning LLM.
- The assistant additionally reads minimal active-tenant `audit_logs` and `outbox_events` fields, merges them into a time-sorted operational activity stream, displays source/status, and identifies preliminary review candidates from explicit status/action patterns. A new migration uses one shared metadata-only trigger to log creation of purchase-order, transfer and stock-count drafts; SQL CI now asserts each audit entry. Complete audit coverage across every app path remains open.
- Branch comparison after canonical and pricing updates showed the feature branch ahead of main with no behind commits; refresh actual comparison because this state/progress write changes the head.

## Not proven / open
- The first observed Build run failed on a wrong README variable in the static contract test; after fixing the root README binding, the next observed Build failed because the source-index content lacked an explicit legacy-brand section. Both roots are corrected. A final current-head run is now in progress for Build, SQL Migration Chain (including the new audit migration) and Backup Tool Safety Checks; capture exact conclusions before merge.
- No local `npm run build`, browser E2E, responsive/accessibility, live Supabase/RLS proof or production deploy performed by this connected GitHub-only execution.
- PR #4 merged to main via squash commit `2dbc96fd5cb51b42924238d8d3cead955d90b1e6` on 2026-10-10. Build, SQL Migration Chain and Backup Tool Safety Checks passed on exact PR head `658382a5b09e4ef0363f7e1af11b2e0cc93581c4`. Production remains HOLD / NO TOUCH.
- Native/private AI inference runtime, sanitization pipeline, event graph, recommendation evidence/action cards, quota ledger and model governance are not yet implemented by the current assistant.
- Automatic backup/restore and isolated recovery drill are not proven.
- Full XLSX/PDF structured extraction/resumable chunks, import DQS acceptance, outbox worker/DLQ recovery and complete browser test matrix remain open.

## Exact next executable action
1. Verify the current PR head for `fix/import-upload-idempotency`; Build, PostgreSQL 17 SQL Migration Chain, and Backup Tool Safety Checks must pass on the exact latest SHA. The branch includes a new import-claim migration and a new concurrent SQL smoke step, so prior main tests do not count as proof.
2. Inspect the SQL smoke output for two concurrent same-hash claims returning one shared ID with exactly one creator, two simultaneous failed retries with exactly one winner, direct browser INSERT/DELETE being denied, immutable upload identity being enforced, and stale staged claims becoming retryable with an audit event.
3. Merge only if all three required gates pass on the latest PR head. On merge, update main state/progress with the merge SHA and re-check the post-merge Build.
4. Keep production HOLD. A real encrypted backup, offline-key decryption, isolated restore and application/RLS smoke test remain unproven; no browser E2E is claimed.
5. Next after this: validate DQS edge cases and full import/merge review policy; continue mapping operational workflows to audit/outbox events; continue private/local AI governance and regression tests.


## Do not repeat / do not do
- Do not rebuild from zero or delete screenshot files, specs, migrations, current modules or git history.
- Do not split AI into a separate product or send sensitive data to external LLMs by default.
- Do not use frontend-supplied organization IDs as authorization.
- Do not claim PASS on queued workflows, or production/browser/hosted database proof without evidence.
- Do not enable offline transactional order writing contrary to the current online-only rule.
- Do not show customer order/invoice amounts under the latest all-stage price-hiding policy.


## Latest instruction capture and execution update

- Persistent source index: `docs/canonical/AGHBARI-SOURCE-REQUIREMENTS-INDEX.md`.
- Canonical normalized specification: `docs/canonical/AGHBARI-MASTER-PROJECT-SPECIFICATION.md`.
- Start-of-session memory: `PROJECT_MEMORY.md`; all new instructions must be incorporated without silently deleting prior requirements.
- The master specification records the latest conflict decisions: AI remains integrated/local-private; customer amounts stay hidden throughout customer order/invoice views; transactional offline order writing remains parked; unsafe plaintext/reversible/shared-unsalted password comparison is prohibited pending security review.
- Screenshot references must be implemented once per screen family while preserving originals and their provenance.
- Pricing source inspection found existing SQL code for retail/wholesale/both rule targeting and base-price fallback. The current working branch adds UI error/retry and destructive confirmation/authorization plus source-contract assertions; passing SQL runtime proof remains pending.


## Backup and restore status (2026-10-10)

- **Implemented, not proven:** `.github/workflows/encrypted-postgres-backup.yml`, `scripts/backup/create-encrypted-backup.sh`, `scripts/backup/verify-encrypted-backup.sh`, `scripts/backup/restore-postgres.sh`, and `scripts/backup/README.md`.
- **Required configuration:** repository Actions secrets `SUPABASE_DB_URL` and `BACKUP_AGE_RECIPIENT`; offline age private key; PostgreSQL client and age tools on the runner.
- **Protection:** encryption before artifact upload, manifest digest, explicit restore host/confirmation gates, separate production overwrite acknowledgement, explicit exclusion of Supabase Storage object bytes and edge/project configuration.
- **Unresolved proof:** first real backup artifact, checksum/decryption validation, restore into isolated target, application smoke/regression test and evidence record.


## Additional operational audit coverage

- New migration: `supabase/migrations/20261014000000_audit_commercial_draft_creation.sql`.
- One shared `SECURITY DEFINER` trigger function with `search_path = ''` records metadata-only creation events for `purchase_orders`, `inventory_transfers` and `stock_counts`. It does not copy notes, payloads or item lines.
- `.github/workflows/sql-migrations.yml` smoke test now asserts the audit record exists for each create RPC and verifies organization/entity/action linkage.
- The integrated assistant reads the audit entry with minimal fields; existing posted/receiving/expense paths keep their earlier explicit audit entries.
- New migration and SQL smoke test remain unverified until the current latest workflow concludes successfully.


## Route-level code splitting — verified on PR #4 head 658382a5b09e4ef0363f7e1af11b2e0cc93581c4

- **Implementation:** `src/App.tsx` now lazy-loads storefront screens and admin modules by route using React `lazy` + `Suspense`; a small Arabic RTL `role=status` fallback is rendered during module loading. Auth providers, route guards, storefront/admin shells, connectivity UX and the in-app AI module remain within the same application.
- **Measured build output:** main `index-*.js` changed from 732.55 kB (196.43 kB gzip) on the earlier monolithic build to 452.62 kB (127.61 kB gzip) after route splitting: **279.93 kB / about 38.2% less uncompressed initial JS**. Dedicated chunks include AIAssistant 15.05 kB, OperationsPages 26.93 kB, TransactionsPages 27.83 kB, StorefrontPages 67.13 kB and AdminPages 71.06 kB.
- **Exact-SHA CI:** Build, SQL Migration Chain and Backup Tool Safety Checks succeeded for PR head `658382a5b09e4ef0363f7e1af11b2e0cc93581c4`; PR #4 then merged to main via squash commit `2dbc96fd5cb51b42924238d8d3cead955d90b1e6`. Post-merge Build and Backup Tool Safety Checks also passed on that squash SHA. SQL workflow includes the new commercial draft audit migration and verifies purchase-order, inventory-transfer and stock-count audit entries under the expected tenant/entity.
- **Scope:** this verifies TypeScript and production bundling plus clean PostgreSQL migration/smoke tests. It does not prove live production deployment, browser E2E, real backup/restore, or complete audit coverage for every operational path.
- **Next exact action:** continue with the unified import engine’s tenant-switch stale-response and duplicate-upload race handling, keeping real parsers and live-data merge behavior explicitly gated. Production deployment remains on HOLD.


## Entry bundle budget guard — verified on PR head 658382a5b09e4ef0363f7e1af11b2e0cc93581c4

- Added scripts/verify-bundle-budget.mjs; it requires exactly one non-empty Vite entry file matching index-*.js, computes actual gzip bytes, and fails the build if the uncompressed entry exceeds **500,000 bytes**.
- The production build command now runs the guard after vite build; this converts the measured improvement into an enforced regression budget.
- Previous measured entry = 452.62 kB / 127.61 kB gzip. On final PR head `658382a5b09e4ef0363f7e1af11b2e0cc93581c4`, the guard printed `Bundle budget PASS: index-Bf1jHErw.js = 454026 bytes, gzip 127606 bytes; budget 500000 bytes.`
- Next action: verify the latest post-merge main Build after this state update, then address the import-engine concurrency/tenant-switch gap. PR #4 is merged; no production deploy has occurred. Deployment remains HOLD.


## Import tenant-switch safety — verified and merged (2026-10-10)

- PR #5 merged by squash as `33ccd26fb666977a74d6b99e8c123210d6b3183b`; branch `fix/import-tenant-switch-race` is merged.
- Import profile/upload reads now increment a request token and accept results only when request token and active organization still match.
- When the organization changes, previous profile/upload rows, selected profile, file, duplicate state and progress are cleared before new data is shown. Rendered lists use a context-ready gate, so stale tenant data is hidden even before the next request completes.
- If a selected profile does not belong to the active tenant's loaded profile list, selection resets to the active tenant's first profile or empty.
- Effect cleanup invalidates the pending load and aborts supported CSV processing. Post-await handlers discard stale results before updating the visible message/state.
- Excel/PDF behavior remains unchanged: metadata-only manual review; no parser or fake successful import was added.
- **Exact-SHA proof:** PR head `e1d429d824a97bed6e91ab924df30ce27bdbe0fb` passed Build, SQL Migration Chain and Backup Tool Safety Checks. Post-merge Build and Backup Tool Safety Checks passed on merge SHA `33ccd26fb666977a74d6b99e8c123210d6b3183b`.
- **Limits:** these are static/build/clean-PostgreSQL gates, not browser E2E. No live production deployment or live hosted-Supabase proof is claimed.
- **Next:** address duplicate-upload concurrency/idempotency. Current unique constraint contains nullable period columns, so concurrent general-file snapshots may still produce duplicates; design a backward-compatible database-side claim/arbiter and test concurrent requests before claiming race prevention.


## Post-merge import tenant-switch verification — 2026-10-10

- PR #5 merged: `33ccd26fb666977a74d6b99e8c123210d6b3183b`.
- Exact PR head: `e1d429d824a97bed6e91ab924df30ce27bdbe0fb` — Build PASS, PostgreSQL 17 SQL Migration Chain PASS, Backup Tool Safety Checks PASS.
- Post-merge commit checks: Build PASS and Backup Tool Safety Checks PASS on `33ccd26fb666977a74d6b99e8c123210d6b3183b`. Build logs confirm static contract checks passed and the 500,000-byte entry budget passed (454,026 bytes raw, 127,601 bytes gzip).
- Next issue is explicitly distinct from tenant switching: concurrent duplicate upload idempotency. Database's nullable period columns can undermine uniqueness for general files; implement and concurrently test a durable arbitration path before claiming deduplication is race-safe.


## Import upload idempotency claims — implemented, exact-head verification pending (2026-10-10)

- Branch: `fix/import-upload-idempotency`; based on main after PR #5 merge.
- Migration: `supabase/migrations/20261015000000_import_upload_idempotency_claims.sql`. It creates a unique non-null claim key `(organization_id, profile_id, file_hash, period_key)`; NULL-period general files are normalized to a deterministic key instead of relying on PostgreSQL NULL uniqueness semantics.
- Backfill uses the newest existing upload as the canonical claim pointer per key while retaining all historical upload rows; it does not delete duplicate history.
- All new CSV, Excel and PDF metadata claims use `claim_import_upload`; it reserves the key, inserts the upload row and emits one audit event in the same transaction. Browser roles cannot insert/delete upload rows directly, and identity fields cannot be edited after claim.
- Failed CSV retries call `claim_failed_import_retry`, an atomic compare-and-swap from `failed` to `detecting`; only one concurrent retry can proceed. Retry cleanup remains associated with the organization-scoped upload claim.
- If a new CSV claim returns after the active organization changed before parsing began, `abandon_staged_import_claim` converts the unstarted staged row to a retryable failed record and audits the abandonment. The UI has an organization-scoped fallback if the audited RPC is unavailable.
- PostgreSQL CI now runs two simultaneous same-hash claim requests and asserts one upload/one claim/one audit event, two simultaneous failed retries and one winner, direct browser write privileges denied, immutable identity protected, and abandoned-stage recovery recorded.
- **Status:** implemented and contract-covered; not marked verified until the latest PR Build, SQL Migration Chain and Backup Tool Safety Checks all conclude successfully on the exact head. Duplicate-upload race is not considered closed until the concurrent workflow actually passes.
