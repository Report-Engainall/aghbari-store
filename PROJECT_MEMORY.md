# PROJECT MEMORY — متجر الأغبري | Aghbari Commerce (Nasr1)

## Canonical source
- Repository: https://github.com/Report-Engainall/Nasr1
- Active branch: `main` only.
- Product: Aghbari Commerce / متجر الأغبري.
- Last verified main SHA at this memory update: `1fe9b96f767746a757afeed085eed9b6cb399fb4` (recheck before work).
- Bolt reported `Synced to GitHub`; confirm its `Active` marker is on `main` before changing files.
- Required execution documents retained in main:
  - `docs/canonical/AGHBARI-MASTER-PROJECT-SPECIFICATION.md`
  - `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`
  - `docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv` (the sole acceptance matrix).
- Full archive branch: `nasr1-reference-archive-2026-11-08`, original commit `b1c433dba9fa8edbb28639976aadc40106d7688b`. It preserves all historical docs, tests, CI, scripts, old source snapshots, and 271 SQL migration files. Retrieve selectively; do not merge it wholesale.

## Existing backend
- Supabase project: `aghbari-commerce-nasr1`.
- Project ref: `tfdwtuwkdddnzgyhcoyy`.
- URL: `https://tfdwtuwkdddnzgyhcoyy.supabase.co`.
- Last direct inspection: `ACTIVE_HEALTHY`, 145 public tables with RLS enabled, and 271 migration records. Always re-check the live ledger; do not treat historical notes as current.
- Use this existing project only. Do not create/reset/reseed/truncate it or replay historical migrations.

## Product and security invariants
- B2B commerce; Arabic RTL default with English localization.
- Server-authoritative customer tier pricing, order validation, stock, credit, and financial mutations.
- Never leak cost, margin, another customer's tier price, internal identifiers, or protected financial data through API/RPC, DOM, PWA cache, PDF, XLSX, or exports.
- Enforce tenant isolation and role permissions at server/RLS/RPC boundaries.
- Offline/PWA cache is read-only for financial and inventory operations.
- Preserve immutable audit/history for orders, returns, payments, and accounting.
- Never fabricate invoices, payments, balances, supplier obligations, or business results.

## Working rules
- Continue the existing React/Vite/TanStack application in place; do not rebuild from scratch.
- Read the first 60 lines of `CURRENT_EXECUTION_STATE.md`, verify main SHA once, then follow its reconciled `NEXT_ACTION`; no repeated full audits.
- Use the acceptance CSV above as the only matrix. No duplicate IDs or parallel matrices.
- No force-push, reset, clean, or overwrite of unsaved work. Preserve one active writer per file.
- Use `bun install --frozen-lockfile`, `bun run dev`, and `bun run build`.
- Retrieve only focused tests from the archive when required; never report tests as passed unless run on the exact SHA.
- Keep paid AI spend at zero; deterministic/local logic first. Do not introduce paid APIs or billing.
- Any database change requires schema/migration comparison, isolated PostgreSQL 17 testing, and an explicit safe rollout. Existing production data must not be reset or reinitialized.
- Keep the Bolt import tree below 7.8 MB; check measured size before adding files.

## Ownership
- P1: product UI and customer/admin workflows.
- P2: database, RPC, RLS, finance, inventory, and integrations.
- P3: intelligence and decision engines.