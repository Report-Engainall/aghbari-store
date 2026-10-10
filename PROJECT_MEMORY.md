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

- Open AI integration PR: https://github.com/Report-Engainall/aghbari-store/pull/4
- Continue from the live PR head, not from a guessed SHA. Last explicitly inspected base main was `a5f3924d30423f327b4c12fde8341daa446d682a`; obtain current branch head and main before each session.
- The integrated assistant now combines tenant-scoped audit/outbox evidence, and commercial draft creation is recorded atomically. The route tree now lazy-loads storefront/admin screens. Latest successful build measured initial index JS at 452.62 kB (127.61 kB gzip), down from the prior 732.55 kB main bundle; page modules are emitted as separate chunks. Current PR #4 latest inspected CI: Build, SQL Migration Chain and Backup Tool Safety Checks all passed on `a6cfdabda8f9ac6a42f5a5b74d510aca99d3c6b9`. Before merging, add a regression contract for lazy routes and verify the final exact head again. Next product priorities remain import/DQS acceptance, SSOT + isolated Onyx, complete event coverage, AI governance, security and browser E2E.
- Do not mark Build/SQL as passed until GitHub returns a successful conclusion for the latest PR head. No live production or hosted-Supabase proof is implied by documentation or static tests.
