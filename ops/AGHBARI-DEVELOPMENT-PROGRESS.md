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
