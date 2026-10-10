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
1. Verify current main HEAD and the Build result after the post-merge execution-state documentation updates. The PR merge commit was `2dbc96fd5cb51b42924238d8d3cead955d90b1e6`; the pre-merge exact PR head `658382a5b09e4ef0363f7e1af11b2e0cc93581c4` passed Build, PostgreSQL 17 Migration Chain and Backup Tool Safety Checks. The bundle-budget script reported 454,026 bytes raw / 127,606 bytes gzip under the 500,000-byte limit.
2. Continue from the next highest-value product gap: strengthen the unified import engine’s tenant-switch stale-response handling and duplicate-upload race/idempotency behavior; preserve the rule that CSV can create a validated Snapshot, while Excel/PDF remain manual review until real parsers exist.
3. Map remaining transactional/import/finance paths to audit or outbox events and add PostgreSQL smoke tests per path. Do not claim total audit coverage until the map is complete.
4. Configure repository Actions secrets `SUPABASE_DB_URL` and public `BACKUP_AGE_RECIPIENT` through GitHub Settings; keep the age private key offline. Then run a real encrypted backup, verify manifest/decryption, restore to an isolated compatible target and run application login/tenant/commerce/RLS smoke tests.
5. Continue private/local AI governance, security hardening and browser E2E proof. Update this state/progress ledger after each exact-SHA verification cycle.

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


## Route-level code splitting — verified on PR head 658382a5b09e4ef0363f7e1af11b2e0cc93581c4

- **Implementation:** `src/App.tsx` now lazy-loads storefront screens and admin modules by route using React `lazy` + `Suspense`; a small Arabic RTL `role=status` fallback is rendered during module loading. Auth providers, route guards, storefront/admin shells, connectivity UX and the in-app AI module remain within the same application.
- **Measured build output:** main `index-*.js` changed from 732.55 kB (196.43 kB gzip) on the earlier monolithic build to 452.62 kB (127.61 kB gzip) after route splitting: **279.93 kB / about 38.2% less uncompressed initial JS**. Dedicated chunks include AIAssistant 15.05 kB, OperationsPages 26.93 kB, TransactionsPages 27.83 kB, StorefrontPages 67.13 kB and AdminPages 71.06 kB.
- **Exact-SHA CI:** Build, SQL Migration Chain and Backup Tool Safety Checks succeeded for PR head `658382a5b09e4ef0363f7e1af11b2e0cc93581c4`; PR #4 then merged to main via squash commit `2dbc96fd5cb51b42924238d8d3cead955d90b1e6`. Post-merge Build and Backup Tool Safety Checks also passed on that squash SHA. SQL workflow includes the new commercial draft audit migration and verifies purchase-order, inventory-transfer and stock-count audit entries under the expected tenant/entity.
- **Scope:** this verifies TypeScript and production bundling plus clean PostgreSQL migration/smoke tests. It does not prove live production deployment, browser E2E, real backup/restore, or complete audit coverage for every operational path.
- **Next exact action:** continue with the unified import engine’s tenant-switch stale-response and duplicate-upload race handling, keeping real parsers and live-data merge behavior explicitly gated. Production deployment remains on HOLD.


## Entry bundle budget guard — verified on PR head 658382a5b09e4ef0363f7e1af11e16bf01263fe

- Added scripts/verify-bundle-budget.mjs; it requires exactly one non-empty Vite entry file matching index-*.js, computes actual gzip bytes, and fails the build if the uncompressed entry exceeds **500,000 bytes**.
- The production build command now runs the guard after vite build; this converts the measured improvement into an enforced regression budget.
- Previous measured entry = 452.62 kB / 127.61 kB gzip. On final PR head `658382a5b09e4ef0363f7e1af11b2e0cc93581c4`, the guard printed `Bundle budget PASS: index-Bf1jHErw.js = 454026 bytes, gzip 127606 bytes; budget 500000 bytes.`
- Next action: verify the latest post-merge main Build after this state update, then address the import-engine concurrency/tenant-switch gap. PR #4 is merged; no production deploy has occurred. Deployment remains HOLD.
