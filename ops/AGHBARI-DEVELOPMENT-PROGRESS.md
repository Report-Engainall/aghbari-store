# Aghbari Commerce — Development Progress Ledger

Use one entry per execution run. Keep implementation, verification, proof and deployment separate. Do not overwrite historical entries.

## Run 2026-10-10 — Integrated AI module and durable instructions

- **Repository:** Report-Engainall/aghbari-store
- **Base SHA last checked:** `a5f3924d30423f327b4c12fde8341daa446d682a`
- **Branch / PR:** `feat/integrated-ai-assistant` / [PR #4](https://github.com/Report-Engainall/aghbari-store/pull/4)
- **Implemented:** integrated Arabic RTL assistant route/menu; tenant-scoped reads of saved AI reports/alerts/tasks; conversation reset on organization changes; stale-response protection; truthful no-LLM disclosure; AI list error/loading/retry handling; corrected dashboard customer KPI and removal of hard-coded healthy status; pricing page backend-error/retry state, admin guards and delete confirmation; canonical project memory/specification/source index/execution state/progress ledger; README links to the persistent control files.
- **Repository evidence:** source files fetched/read back from GitHub; PR changed filenames and branch compare inspected; pricing migration was read and shown to contain retail/wholesale/both rule targeting, rule-change recalculation trigger, and base-price fallback. The latest change adds static assertions for these contracts. Record the current live PR SHA before next implementation.
- **Verified:** file existence and source assertions were inspected. Not a local build or browser proof.
- **Proven:** no runtime/production capability is classified as proven in this run.
- **Blocked / pending:** GitHub Actions latest Build and SQL Migration Chain conclusion for the final current head; browser E2E; live hosted-Supabase RLS; generative model backend and governance; backups/restore; full acceptance suite.
- **Deployment:** HOLD; not deployed; not merged to main.
- **Next action:** fetch latest PR head and Action conclusions; fix any build/contract/migration failures; then continue the next open gap (backup/restore control contract and actual backup capability inventory, followed by import/DQS acceptance and AI event/governance implementation). Merge only after exact-head checks pass.

## Status vocabulary
- **PROVEN:** runtime/end-to-end result observed and tied to the exact SHA with evidence.
- **VERIFIED:** source/config/assertion inspected or test has actually passed, but runtime proof may remain open.
- **PARTIAL:** some implementation exists, with explicit missing parts.
- **NOT_PROVEN:** evidence insufficient or test not run/result unknown.
- **BLOCKED:** exact prerequisite unavailable; name it.
- **HOLD:** do not merge/deploy/apply to production yet.


## Run update — canonical memory + pricing safety polish (2026-10-10)

- **Additional files:** `PROJECT_MEMORY.md`; `docs/canonical/AGHBARI-MASTER-PROJECT-SPECIFICATION.md`; `docs/canonical/AGHBARI-SOURCE-REQUIREMENTS-INDEX.md`; `ops/AGHBARI-LATEST-EXECUTION-STATE.md`; `ops/AGHBARI-DEVELOPMENT-PROGRESS.md`; README pointer to all control files.
- **Pricing UI implementation:** query errors no longer collapse into a false “no pricing rules” empty state; explicit retry is provided; create/toggle/delete handlers check the administrator role; deleting an active rule asks for confirmation before the database trigger recalculates derived prices.
- **Pricing source inspection:** existing migration targets retail rules for retail_price, wholesale rules for wholesale_price, applies “both” rules to both, recalculates on INSERT/UPDATE/DELETE, and falls back to base_price when no matching active rule remains. This is source inspection only; SQL runtime tests are still required on the candidate head.
- **New contract assertions:** durable memory/spec/index/state/progress files remain present; source acceptance IDs remain documented; retail/wholesale target logic and rule recalculation trigger remain guarded; pricing error/retry/confirm/admin behavior remains guarded.
- **Verification status:** code/document readback succeeded; no claim of local build, live SQL, browser E2E or production proof. Re-fetch GitHub Actions for the final branch head because every follow-up commit changes the checked SHA.
- **Deployment:** HOLD / not merged / not deployed.


## Run update — encrypted backup and guarded restore tooling (2026-10-10)

- **Implemented:** daily/manual GitHub Actions PostgreSQL logical backup workflow; encrypted artifact writer using age public-key encryption; SHA-256 manifest; offline-key verification utility; guarded restore utility; operator runbook; shell syntax/ShellCheck workflow; static contract assertions.
- **Security properties in code:** DB URL is not intentionally printed or stored in the manifest; encrypted artifact only is uploaded; private age key is kept offline; explicit insecure TLS connection options are rejected; restore requires an expected-host match and an operator confirmation sentinel; production-labelled restore has an additional overwrite acknowledgement.
- **Scope honesty:** this is a PostgreSQL logical database dump, not a complete Supabase-project backup. Storage object bytes, Edge Function source/secrets and project configuration are excluded. Artifact retention is 14 days unless the repository policy limits it further.
- **Configuration blocker:** a real execution needs repository Actions secrets `SUPABASE_DB_URL` and `BACKUP_AGE_RECIPIENT`. The offline age private key must be generated and kept outside the repository. These credentials were not supplied and were not written into source.
- **Verification:** repository files read back; contract assertions added; Backup Tool Safety Checks, Build and SQL Migration Chain reported queued on the previously inspected candidate and must be rechecked on latest PR head. No actual backup artifact, decryption, isolated restore, browser E2E or live database test is claimed.
- **Deployment:** HOLD / not merged / not deployed.
- **Next:** check exact-head Actions; fix shell/static/build/migration failures; configure secrets securely; run the first encrypted backup; verify with offline key; perform and record isolated restore + application smoke tests. Only then call backup/restore operationally proven.


## Run update — operational event intelligence + CI fault correction (2026-10-10)

- **Assistant implementation:** in addition to organization-scoped AI reports/alerts/tasks, it reads `audit_logs` (minimal `id, action, entity_type, created_at`) and `outbox_events` (minimal `id, event_type, aggregate_type, status, created_at`), explicitly scoped to the active organization. It merges the results into one time-sorted stream capped at 50 events, displays source/status, and flags preliminary review candidates including failed/dead-letter events. Outbox payload is not selected.
- **Limitations preserved:** query failures show warnings; RLS remains authoritative; the stream reflects only emitted events and is not claimed to be a complete audit. No generative model, forecast or universal risk engine is claimed.
- **CI diagnosis 1:** Build failed because the contract test used a variable bound to `docs/ui-reference/README.md` while asserting the root README memory link. Fixed by reading root `README.md` into a separate `rootReadme`.
- **CI diagnosis 2:** The source-preservation index assertion expected the English term “Legacy”, but the document recorded the policy in another form. Added an explicit product identity/provenance section listing the excluded brand strings and replaced the assertion with checks for the actual canonical identity and names.
- **Build environment:** updated the Build workflow to Node 22 because the lockfile resolves Supabase JS packages that declare Node >=22. This removes observed engine mismatch warnings at the runner level.
- **Verification observed:** a previous Build attempt failed at the above assertions, not at TypeScript/Vite. SQL migration chain and backup shell safety checks passed on an older SHA; a prior later Build failed on the second assertion. A new exact-head run after the newest code/docs commits is required before marking PASS.
- **Backup safety remains:** strict JSON manifest/filename/size/hash validation; output outside repository; absolute external pre-restore path for production; verified fresh encrypted pre-restore snapshot; target host and explicit destructive restore confirmation. Real database backup/decryption/restore remains NOT_PROVEN without securely configured secrets and a recovery drill.
- **Deployment:** HOLD; PR #4 remains open; no main merge or production deploy.
- **Next:** inspect exact latest run conclusions, fix any residual contract/type/build issue, then continue import/DQS, event coverage map, private AI governance and E2E.


## Run update — audited lifecycle of commercial drafts (2026-10-10)

- **New migration:** `supabase/migrations/20261014000000_audit_commercial_draft_creation.sql`.
- **Implementation:** one shared security-definer trigger records `purchase_order_created`, `inventory_transfer_created` and `stock_count_created`. Each record contains tenant/entity identity and a bounded allow-list of non-free-form metadata; notes and payloads are not copied.
- **Atomicity:** audit write runs from AFTER INSERT trigger in the same transaction as the existing validated create RPC; failed create transactions roll back the audit row too.
- **Integration proof added:** PostgreSQL 17 migration workflow now checks each RPC-created draft produces the expected audit row under the correct organization and entity reference.
- **AI connection:** existing tenant-scoped audit/outbox timeline immediately surfaces these records without reading event payloads; posting/receiving/expense audit functions were preserved.
- **Pending:** current Build/SQL Migration Chain/Backup Tool Safety Checks must complete on the final latest head; only afterward can the migration be marked verified. No live migration was applied.
- **Merge/deploy:** HOLD until all exact-head required gates are green.


## Run update — route-level code splitting and bundle reduction (2026-10-10)

- **Change:** refactored `src/App.tsx` from eager imports to route-driven lazy imports for storefront pages, admin pages, operations/transactions and utility screens. Protected routes still wrap their loaded screens; AI remains a first-party page in the same app. Each lazy route uses a small accessible Arabic RTL loading fallback.
- **Build measurement:** prior main JS bundle = 732.55 kB (196.43 kB gzip); new main JS bundle = 452.62 kB (127.61 kB gzip). Absolute reduction 279.93 kB, relative reduction 38.2% in uncompressed initial JS and 68.82 kB gzip. The Vite >500 kB chunk warning is no longer present. Vite emitted separate chunks for AIAssistant, AdminPages, StorefrontPages, OperationsPages and TransactionsPages.
- **Exact candidate evidence:** SHA `a6cfdabda8f9ac6a42f5a5b74d510aca99d3c6b9`: Build PASS; SQL Migration Chain PASS; Backup Tool Safety Checks PASS. Build log states 1,649 modules transformed and completed in 10.44 s. SQL chain applied all migrations on PostgreSQL 17 and passed order/payment, procurement/receiving/transfer/stock-count/expense, tenant-isolation and product-price privilege checks.
- **Previous failures fixed before this pass:** root README assertion variable mismatch; missing explicit legacy-brand rule in source index; resume heading assertion mismatch and a punctuation typo; `useCallback` missing import and `unknown` timestamp JSX type; static AI route assertions updated for lazy loading.
- **Not proven:** live hosted deployment, browser E2E, live Supabase run, actual encrypted backup/decryption/restore, full audit-event coverage for all app flows.
- **Next:** keep a contract against accidental eager route imports, rerun all three gates on the resulting exact head, then merge PR #4 if the final checks pass. Deployment remains HOLD.


## Run update — enforced entry-bundle regression budget (2026-10-10)

- **Implementation:** added scripts/verify-bundle-budget.mjs; after vite build, CI measures the single Vite entry JavaScript file and its gzip bytes and fails if raw entry exceeds 500,000 bytes or the entry is missing/ambiguous/empty.
- **Why:** route splitting reduced main JS from 732.55 kB to 452.62 kB. The build now enforces that improvement instead of relying on a non-fatal Vite warning.
- **Status:** code and package wiring were read back from GitHub. The budget guard is **implemented, not yet proven on the new exact head**; next Build CI run must show the expected bundle-budget PASS output.


## Run update — verified merge to main (2026-10-10)

- **PR:** #4 merged by squash; merge commit SHA `2dbc96fd5cb51b42924238d8d3cead955d90b1e6`.
- **Exact pre-merge PR head:** `658382a5b09e4ef0363f7e1af11b2e0cc93581c4` — Build PASS; SQL Migration Chain PASS; Backup Tool Safety Checks PASS.
- **Bundle budget:** production guard passed on that PR head: entry file `index-Bf1jHErw.js`, raw 454,026 bytes, gzip 127,606 bytes, budget 500,000 bytes. Static contracts, TypeScript and Vite build passed.
- **Post-merge checks:** Build and Backup Tool Safety Checks passed on merge commit `2dbc96fd5cb51b42924238d8d3cead955d90b1e6`. The SQL chain passed on the pre-merge PR head whose source/migrations were merged unchanged.
- **No overclaim:** no production deployment, live hosted Supabase verification, browser E2E or actual database backup/decryption/restore is claimed.
- **Next executable gap:** tenant-switch stale-response safety and duplicate-upload race/idempotency in the unified import UI/engine; keep Excel/PDF manual review and do not fake live-data merge.


## Run update — tenant-safe import state switching (2026-10-10)

- **Finding:** the import screen's concurrent reads had no request identity guard. If the user switched active organizations while the prior profile/upload query was in flight, the older result could overwrite the newer screen state. The selected profile also was not revalidated against the newly loaded tenant list.
- **Implementation on branch fix/import-tenant-switch-race:** request sequence token; current-organization reference; explicit stale-response rejection after Promise.all; clearing profile/upload/file/duplicate/progress state during tenant changes; visible-list gating until data belongs to the active organization; profile selection repair; cleanup invalidates requests and aborts supported CSV work.
- **Write-safety:** profile creation/versioning and import/retry handlers now test the tenant/request context after awaited boundaries before updating the visible UI. This does not claim a database transaction has been rolled back if an operator intentionally started a write before switching contexts.
- **Import truth:** CSV continues through the existing validated Snapshot pipeline. Excel/PDF stay metadata-only/manual review; no fake parser, data merge, or fake completion was introduced.
- **Acceptance contract:** static guardrails cover request IDs, tenant match, cleared state, abort cleanup, selected-profile reset and disabled writes until the active context is loaded.
- **Status:** implementation is committed and read back; tests are awaiting the PR's exact-head CI. No browser E2E is claimed.


## Run update — PR #5 merge: tenant-switch-safe import (2026-10-10)

- **Merge:** PR #5 `fix: prevent stale import state across organization switches` merged to main by squash; SHA `33ccd26fb666977a74d6b99e8c123210d6b3183b`.
- **Exact PR head CI:** `e1d429d824a97bed6e91ab924df30ce27bdbe0fb` — Build PASS, SQL Migration Chain PASS, Backup Tool Safety Checks PASS.
- **Post-merge CI:** Build PASS and Backup Tool Safety Checks PASS on merge commit `33ccd26fb666977a74d6b99e8c123210d6b3183b`. Build output confirmed contract tests passed; entry bundle was 454,026 bytes raw / 127,601 bytes gzip within the 500,000-byte cap.
- **Delivered behavior:** stale import profile/upload requests are discarded; previous tenant rows/files/progress/duplicate state are cleared and not rendered during tenant switch; selected profile is repaired against active tenant data; supported CSV processing is aborted during tenant switch/unmount; creation/version/retry/stage handlers reject stale post-await UI results; operations stay disabled until both active-tenant reads succeed and can be retried on read failure.
- **Not claimed:** no browser E2E, live production deploy, or real hosted Supabase proof.
- **Next gap:** server/database duplicate-upload race/idempotency. Existing uniqueness key has nullable period fields, so duplicate general-file claims need a separate concurrency-safe arbiter plus a PostgreSQL test issuing two concurrent same-tenant/same-profile/same-hash claims. Preserve historical upload rows and partial retries; do not fake dedupe.


## Run update — database-enforced import idempotency (2026-10-10)

- **Problem:** the legacy unique key on `import_uploads` contains nullable `period_start` and `period_end`; for the general upload path with both NULL, concurrent insert calls are not reliably arbitrated by that unique constraint. The UI also used a select-before-insert duplicate check, which is inherently race-prone.
- **Schema change:** new migration `20261015000000_import_upload_idempotency_claims.sql` creates a claim table with a non-null normalized period key and composite primary key. Backfill points each key to its newest historical upload without deleting or merging any existing rows.
- **Atomic writer:** `claim_import_upload` reserves the unique key, creates the initial upload row and records `import_upload_claimed` in one transaction. All CSV/Excel/PDF staging uses this RPC; the UI no longer directly inserts upload rows.
- **Authorization/invariants:** direct browser INSERT/DELETE on `import_uploads` is revoked; organization/profile/hash/period/uploaded_at identity cannot be edited after creation. Claims table is inaccessible directly to browser roles; RPCs check active owner/admin membership inside PostgreSQL.
- **Retry race:** `claim_failed_import_retry` uses a single conditional update from `failed` to `detecting`, so only one simultaneous retry can win before partial records are cleared. Cleanup failures restore a visible failed state.
- **Tenant-switch recovery:** if the upload claim is created but the organization changes before CSV processing starts, `abandon_staged_import_claim` marks the staged row retryable and writes an audit record; an organization-scoped fallback is present if the RPC fails.
- **Integration acceptance:** PostgreSQL 17 workflow launches two concurrent claim sessions and two concurrent retry sessions, then asserts shared upload ID, one creation winner, one failed-retry winner, one transactional audit event, denied direct INSERT/DELETE, immutable upload identity, and recovery of an abandoned staged upload.
- **Pending:** build and SQL migration concurrency smoke tests must pass on the final exact PR head. Prior CI from main/PR #5 does not verify this new migration. Browser E2E and live Supabase deployment are not claimed.
