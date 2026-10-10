# Aghbari Commerce — Persistent Project Memory

**Product identity:** الأغبري | Aghbari Commerce  
**Purpose:** Durable project instructions for every coding session. Read before implementation.  
**Canonical requirements:** `docs/canonical/AGHBARI-MASTER-PROJECT-SPECIFICATION.md`  
**Source preservation/index:** `docs/canonical/AGHBARI-SOURCE-REQUIREMENTS-INDEX.md`  
**Execution state:** `ops/AGHBARI-LATEST-EXECUTION-STATE.md`  
**Progress ledger:** `ops/AGHBARI-DEVELOPMENT-PROGRESS.md`  
**Screenshot families and provenance:** `docs/ui-reference/UI-REFERENCE-ASSET-INDEX.md`

## Mandatory rules

1. **Preserve first.** Never delete source files, screenshots, migrations, commits, or working features to simplify the project. Improve, repair, connect, or consolidate behavior while preserving provenance. Any proposed deletion requires a separately proven reason and explicit record.
2. **One identity.** The only product brand is الأغبري / Aghbari Commerce. Legacy labels العامري / Alamri / Amiri / بوابة العامري الذكية are historical references only.
3. **AI belongs inside Aghbari.** The AI platform is an integrated, local/private-by-default capability in the same app, login, organization context, design system, navigation, audit and operational event flow. It is not a separate app or product. Sensitive tenant data must not be sent to external AI providers by default.
4. **Arabic RTL first.** Visible UI defaults to Arabic/RTL; preserve readiness for English localization. Desktop/tablet/mobile, keyboard navigation, focus states, semantic controls, accessible forms and truthful async states are mandatory.
5. **Truth before appearance.** Real Supabase data, server-derived tenant context, existing RPCs and transactional contracts are authoritative. Never invent a business metric, saved state, transaction, stock amount, AI finding, delivery or healthy-system status.
6. **No fake feature completion.** A route, screen, table, stub, queued workflow, static assertion or PR is not sufficient. End-to-end completion requires data contracts, permissions, validation, failure/loading/empty/retry behavior, responsive behavior and exact-SHA tests appropriate to the feature.
7. **No duplicate engines.** Inspect and reuse existing API functions, hooks, React context, schemas, shared components, SQL functions, RLS policies, RPCs, storage and pipelines. For matching screenshots, implement one screen family once and record all image aliases/provenance.
8. **Execution cycle:** INSPECT → UNDERSTAND → PRESERVE → COMPLETE → CONNECT → IMPROVE → TEST → FIX → POLISH → VERIFY → PROVE → RECORD.
9. **Begin each session with actual state.** Fetch the current main and working-branch/PR HEAD, changed files, workflow results, execution state, canonical specification, progress ledger, image index, then only relevant code/migrations. Do not trust cached historical SHA claims.
10. **Run locally on port 5173** using `npm run dev`. Run `npm run build` before merge; it includes contract verification, TypeScript and Vite build. SQL migration chain and browser/runtime tests are separate evidence.
11. **Merge gate.** Merge to main only when the exact latest candidate passes relevant build/contracts and migration tests, required security checks, and regression gates. Queued/not-run is not PASS. Do not deploy or apply live migrations without actual authorization and proof.
12. **Zero-cost-first.** Do not introduce paid services by default. Never commit secrets; never expose privileged/service-role keys through browser code or `VITE_*` variables.
13. **Project isolation.** Aghbari Commerce remains distinct from Report-Advisor/Report-Engainall BI projects. Never mix their commits, database scope, keys, evidence or deployment status.
14. Keep proven/closed work locked unless a regression, dependency, security finding, invalidated evidence, environment change or direct new requirement makes a revisit necessary.

## Screenshot policy

The checked-in index reports 89 screenshot files, 85 distinct Git blobs and 4 duplicate file entries on its audited version. Recompute if the inventory changes. Treat these images as design evidence only, not live data or production assets. Group them by visual equivalence, screen family, viewport/state and provenance. Preserve every original image; do not delete duplicate image files as part of UI deduplication. Prevent duplicate implementations, not archival evidence. Do not reproduce the legacy brand or screenshot sample SKUs, customer names, revenue, prices or stock values as operational data.

## AI operating policy

The integrated AI should observe and explain authorized application activity: catalog/product edits, pricing, orders, quantity approvals, purchases, inventory movement, invoices, payments, imports, quality checks, queue/outbox incidents, customer activity and system health. Build on a shared event/evidence layer and local/private execution boundary. Deterministic server-side calculations are the source of numeric truth; AI explains, forecasts and recommends with evidence, freshness, confidence and trust state. High-impact changes require human approval and an existing secure transaction path. Every model request must be policy checked, sanitized and budgeted; fail closed when routing or budget policy is absent. The current assistant reads saved AI reports/alerts/tasks plus minimal tenant-scoped projections of `audit_logs` and `outbox_events`. One shared security-definer trigger now records creation of purchase-order, inventory-transfer and stock-count drafts in `audit_logs`, atomically with their original insert and without copying free-form notes. The assistant merges recent audit/outbox activity, flags deterministic review candidates (including failed/dead-letter outbox events), discloses source/status, ignores stale tenant responses, and must not be described as a configured generative LLM or a complete audit of all application activity.

## Current execution pointers

- PR #4 merged into main via squash commit 2dbc96fd5cb51b42924238d8d3cead955d90b1e6 on 2026-10-10: https://github.com/Report-Engainall/aghbari-store/pull/4
- Always inspect current main SHA and worktree/repository state before each session; historical baseline before this merge was `a5f3924d30423f327b4c12fde8341daa446d682a`, and the squash merge was `2dbc96fd5cb51b42924238d8d3cead955d90b1e6`.
- The integrated assistant now combines tenant-scoped audit/outbox evidence, and commercial draft creation is recorded atomically. The route tree now lazy-loads storefront/admin screens. Route-level splitting reduced the Vite entry output from 732.55 kB to 452.62 kB in the measured Vite report; the final bundle guard on PR head `658382a5b09e4ef0363f7e1af11b2e0cc93581c4` independently reported 454,026 raw bytes / 127,606 gzip bytes under the 500,000-byte budget. Build, PostgreSQL 17 migration/smoke checks and Backup Tool Safety Checks all passed on that exact PR head. PR #4 is merged; Build and Backup Tool Safety Checks also passed on squash main SHA `2dbc96fd5cb51b42924238d8d3cead955d90b1e6`. Next product priorities remain import/DQS acceptance, SSOT + isolated Onyx, complete event coverage, AI governance, security and browser E2E.
- Do not mark Build/SQL as passed until GitHub returns a successful conclusion for the latest PR head. No live production or hosted-Supabase proof is implied by documentation or static tests.


## Active follow-on implementation

PR #5 for fix/import-tenant-switch-race merged into main via squash SHA 33ccd26fb666977a74d6b99e8c123210d6b3183b. Exact PR head e1d429d824a97bed6e91ab924df30ce27bdbe0fb passed Build, SQL Migration Chain and Backup Tool Safety Checks. The post-merge Build and Backup Tool Safety Checks also passed on merge SHA 33ccd26fb666977a74d6b99e8c123210d6b3183b. Import reads now use request/tenant identity guards, clear and hide prior tenant state, abort supported CSV processing, reset the selected profile, and keep writes disabled until current-tenant data finishes loading. Remaining next gap: concurrent duplicate-upload idempotency/race control; do not confuse it with the now-merged UI tenant-switch fix.


## Active follow-on: database-enforced import idempotency

PR #6 (`fix/import-upload-idempotency`) merged into main via squash SHA `b940e3a8b5581b63b72589b4354687781574ece5`. Exact PR head `e68403226836040dbfe5d4b77c0a9b0d22b02acc` passed Build, PostgreSQL 17 SQL Migration Chain, and Backup Tool Safety Checks. The SQL workflow verified simultaneous duplicate claims (one upload/one creator), simultaneous failed retries (one winner), browser INSERT/DELETE denial, immutable upload identity, audit emission and recovery of an abandoned tenant-switch claim. Post-merge Build and Backup Tool Safety Checks started on main SHA `b940e3a8b5581b63b72589b4354687781574ece5`; their final post-merge conclusions must be checked after the state-write commits. The next product gap is DQS edge-case validation and merge/review policy, followed by full operational audit coverage and AI governance.
