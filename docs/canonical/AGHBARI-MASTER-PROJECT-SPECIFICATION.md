# Aghbari Commerce | الأغبري
# Master Project Specification — Consolidated Production-Grade Draft

**Version:** Draft 1.0, 2026-10-10  
**Status:** Canonical living requirements and execution contract, not an implementation-completion claim.  
**Read alongside:** `PROJECT_MEMORY.md`, `docs/canonical/AGHBARI-SOURCE-REQUIREMENTS-INDEX.md`, `ops/AGHBARI-LATEST-EXECUTION-STATE.md`, `ops/AGHBARI-DEVELOPMENT-PROGRESS.md`, and `docs/ui-reference/UI-REFERENCE-ASSET-INDEX.md`.

# A. Identity, scope and mandatory execution

## A1. Product identity
The sole product identity is **الأغبري | Aghbari Commerce**. Never use العامري, Alamri, Amiri or بوابة العامري الذكية as the product identity. Legacy screenshots and documents remain source material only.

The product is a professional B2B commerce application for traders. It includes the customer storefront, admin/operations control plane, data and integration pipelines, finance/inventory workflows, and an integrated local/private AI platform. It must not become a disconnected prototype, a fake futuristic AI demo or an undifferentiated ERP.

## A2. Preserve-first workflow
Required execution cycle:
**INSPECT → UNDERSTAND → PRESERVE → COMPLETE → CONNECT → IMPROVE → TEST → FIX → POLISH → VERIFY → PROVE → RECORD.**

- Inspect current branch/HEAD, worktree or changed files, routes, components, hooks, database schema/migrations, RPCs, existing tests and current evidence before editing.
- Reuse working infrastructure and correct behavior. Do not restart from zero, broadly refactor unrelated areas, delete working code, remove source specifications or delete screenshots to reduce duplication.
- Classify gaps as COMPLETE, PARTIALLY COMPLETE, PRESENT BUT WEAK, PRESENT BUT DISCONNECTED, MISSING WITH BACKEND CONTRACT or MISSING WITHOUT BACKEND CONTRACT.
- When a feature exists, improve and connect it instead of adding a competing engine.
- Every coherent feature cycle should address UI, state, data/backend connection, authorization, validation, responsive behavior, async/loading/empty/error/retry, and regression coverage.
- Preserve source requirements, noting precedence when requirements conflict. Never silently omit an inconvenient rule.
- A route, table, placeholder, mock, queued check or screen alone is not completion.
- Use the existing stack and dependency set where suitable. Current observed baseline: React 18, TypeScript, Vite, React Router, Supabase JS, PostgreSQL migrations, Tailwind. Run local development on port 5173 via `npm run dev`; run `npm run build` as a production-build gate.
- Zero-cost-first: no paid dependency by default and no committed credentials. Privileged secrets never appear in frontend variables, source or client bundles.
- No main merge until exact latest candidate has the relevant passing Build/contract checks, SQL migration tests, security checks and regression evidence. A queued status is not PASS. Production and hosted database/browser claims require their own evidence.

## A3. Arabic, RTL, visual quality and accessibility
Arabic is the default for all visible product content and RTL the default direction. This includes navigation, headings, forms, validation, loading, errors, empty states, success/failure, dialogs, notifications, search, filters, checkout, orders, invoices, finance, company/account, AI, settings, developer tooling and administration. Keep the architecture ready for English localization; technical identifiers may remain English.

Desktop, tablet and mobile must be supported. Use shared Storefront Shell/Admin Shell, controls, data tables, modals, status badges, permission gates and async handlers. Support keyboard navigation, focus-visible, semantic elements, labels, accessible error messages and touch-appropriate hit targets. Use readable layouts and responsive tables/panels.

Applicable screen states: initial loading, empty, error, retry, success only after confirmation, validation, disabled, unauthorized, permission denied, expired session, offline/network/server failure, rate limit, asynchronous processing, confirmation, destructive-action protection, action success and action failure. Distinguish a real empty dataset from a failed/inaccessible query. Do not display false operational health.

# B. Canonical customer storefront product tree

## B1. Access and company/account entry
- Landing: `/`
- Login: `/login`
- Register: `/register`
- Account verification: `/verify`
- Forgot password: `/forgot-password`
- Reset password: `/reset-password`
- Invitation: `/invite/:token`
- Company onboarding: `/onboarding/company`
- Profile onboarding: `/onboarding/profile`
- Pending approval: `/account/pending`

## B2. Store, catalog and discovery
- Store/home: `/store`
- Collections and featured/new/popular/offers: `/collections`, `/collection/:slug`, `/featured`, `/new`, `/popular`, `/offers`
- Catalog and products: `/catalog`, `/products`
- Categories: `/categories`, `/category/:slug`, `/category/:slug/subcategory/:subcategorySlug`
- Search: `/search`, `/search/advanced`, with explicit no-results and invalid-query states
- Product detail: `/product/:id`
- Wishlist/comparison: `/wishlist`, `/compare`
- Help: `/help`, `/help/faq`, `/help/contact`, `/help/policies`, `/help/order`, `/help/account`

## B3. Purchase and replenishment
- Cart: `/cart`, including empty, unavailable product, unavailable inventory and pricing-unavailable states
- Checkout: `/checkout`, `/checkout/review`, `/checkout/confirm`
- Successful order only after server response: `/order-success/:id`
- Orders/details: `/orders`, `/orders/:id`
- Reorder: `/reorder`, `/reorder/:id`
- Templates: `/templates`, `/templates/new`, `/templates/:id`, `/templates/:id/edit`
- Pricing/contracts: `/pricing`

## B4. Finance and company
- Statements: `/statements`, `/statements/:id`
- Invoices: `/invoices`, `/invoices/:id`
- Payments: `/payments`, `/payments/:id`
- Receivables/documents: `/receivables`, `/financial-documents`
- Profile/company: `/profile`, `/company`, `/company/details`, `/company/contacts`, `/company/users`
- Addresses: `/addresses`, `/addresses/new`, `/addresses/:id/edit`
- Account settings: `/account/settings`, `/account/password`, `/account/notifications`, `/account/language`, `/account/appearance`, `/account/devices`
- Notifications: `/notifications`

A route does not count as implemented if it silently points to unrelated generic content or ignores relevant URL parameters. Shared components are encouraged when they implement genuinely shared behavior.

## B5. Customer price visibility and notification rules
The latest explicit customer policy is to hide pricing and financial amounts entirely from customer order/invoice views at every stage: pre-approval, post-approval, confirmation, checkout/order review, order history, invoices and related customer views. Keep financial detail available only to authorized administrative/accounting users. This latest policy supersedes the earlier contradictory threshold rule that showed an order total when there were more than five order lines; preserve that earlier requirement in the source index but do not implement both.
- Display full product names beneath their images; avoid clipping.
- Do not advance the customer order stepper merely because an administrator opened the order page. Only persisted backend state may advance it.
- When an order is returned for adjustment, show a prominent Arabic notice.
- When items or quantities were actually changed by the authorized workflow, show below the relevant customer invoice/order summary: **“تنبيه: تم تعديل الأصناف/الكميات بحسب الكميات المتوفرة.”** Hide it if no persisted adjustment happened.
- After administrative confirmation, show the real notice asking the customer to send payment; convert to a sales invoice only through the authorized transaction workflow.
- Exported RTL invoices place customer name/code in the header, remove repeated customer name from individual item lines and use the consolidated description in the main invoice-description field.
- No mock orders, fake payment success or guessed amounts.

# C. Canonical admin and control plane tree

## C1. Core sales, catalog and inventory
- Dashboard: `/admin`
- Orders/details: `/admin/orders`, `/admin/order/:id`
- Customers/workspace: `/admin/customers`, `/admin/workspace`
- Devices/sessions: `/admin/devices`
- Catalog and pricing: `/admin/catalog`, `/admin/pricing`
- Inventory/warehouses/movements: `/admin/inventory`, `/admin/warehouses`, `/admin/inventory/movements`
- Procurement: `/admin/suppliers`, `/admin/purchasing`, `/admin/receiving`, `/admin/transfers`, `/admin/stock-counts`
- Finance: `/admin/expenses`, `/admin/invoices`, `/admin/payments`, `/admin/statements`
- Barcode/exports: `/admin/barcode`, `/admin/exports`

## C2. Data operations
- `/admin/data-center`
- `/admin/import`
- `/admin/import-logs`
- `/admin/finance-data`
- `/admin/images`
- `/admin/engines`

## C3. Integrated AI control plane
All AI screens are inside the same Aghbari application, session, organization context, admin shell and navigation; no second app, separate identity provider or separate product.
- `/admin/ai`
- `/admin/ai/reports`
- `/admin/ai/alerts`
- `/admin/ai/tasks`
- `/admin/ai/assistant`
- `/admin/ai/governance`
- `/admin/ai/insights`
- `/admin/ai/prompts`
- `/admin/ai/models`
- `/admin/ai/settings`
- `/admin/ai/audit`
- `/admin/ai/executive`
- `/admin/ai/sync`
- `/admin/ai/stock-sync`

## C4. System, access and developer interfaces
- `/admin/reports`, `/admin/architecture`, `/admin/notifications`, `/admin/audit`, `/admin/errors`, `/admin/health`, `/admin/queues`
- `/admin/users`, `/admin/invites`
- `/admin/settings`, `/admin/appearance`, `/admin/onyx`, `/admin/restore`
- `/admin/dev-ai`, `/admin/dev-ai/patches`, `/admin/dev-ai/audit`, `/admin/dev-ai/settings`

Every menu item must resolve to the intended behavior and screen family. Do not expose dead links or pretend unrelated screens are dedicated implementations.

# D. Single source of truth, events and isolated Onyx mirror

## D1. Operational SSOT
The operational live database is authoritative for current products, prices, customers, orders, invoices, payments and stock. Existing approved APIs/RPCs and backend contracts are the valid write paths. Authorized application events feed the dashboard, executive analytics, AI forecasts, smart reports, alerts and the integrated assistant with source identity and freshness.

Required executive-screen notice:
**“تعتمد هذه الشاشة على البيانات المباشرة لحركة التطبيق (مبيعات، مشتريات، مخزون، حركات عملاء، أسعار).”**

All authoritative arithmetic (sales totals, gross margin, inventory turnover, credit exposure, receivables aging and other financial/quantity calculations) must be deterministic and calculated in database/server code. An LLM may explain those results; it may not calculate business-of-record numbers.

## D2. Onyx Pro isolated analytical mirror
Onyx imported reports run only inside an analytical sandbox and never join as source tables for operational writes. Rebuild executive analytics, forecasts/recommendations, smart reports and alerts against imported Onyx snapshots. After “ابدأ بالتحليل”, render a continuous vertical dashboard containing KPIs, charts, observations, forecasts, actionable recommendations and detailed tables on one page.
Inventory reconciliation compares source Onyx data to live inventory as read-only dry-run by default and displays source/last-sync timestamp/new/updated/deleted candidates/unmatched rows/differences/errors/audit log. Any live adjustment requires distinct explicit approval through a safe transactional RPC. Absence from a snapshot must not delete/zero live stock.

## D3. Server idempotency
Record organization_id, idempotency_key, request_hash, operation_type, response_reference, created_at, expires_at and status. Unique key: organization_id + idempotency_key + operation_type. Reusing the same key with a different request hash must be rejected. Sensitive writes and outbox events share one transaction. At-least-once delivery plus idempotent consumers is the target; do not claim that networks guarantee exactly-once delivery.

Offline app-shell access may be supported, but the technical memorandum explicitly cancels offline transaction orders. Order, payment, approval and inventory mutations are online-only. Do not create an offline transaction queue or auto-replay sensitive writes on reconnect. The proposed offline field-sales writer is parked pending explicit rule change and a safe server-backed contract.

# E. Unified import engine, privacy and data quality

## E1. Single official pipeline
One official import pipeline only:
Upload/Event → Staging → Detection → Mapping → Validation → Normalization → Deduplication → Chunking → Merge policy → Snapshot → Deterministic Analytics → AI Insights/Rule Engine.

All supported CSV/Excel/PDF paths must go through this engine; no parallel writer may bypass its checks. If a parser is unavailable, disclose the capability gap instead of simulating import.

## E2. Raw-file privacy and retention
Do not permanently retain raw CSV/Excel/PDF after processing. Keep permitted metadata, file_hash, file/profile version, extracted normalized records, audit results and final snapshots subject to retention policy. Metadata includes file_name, file_type, file_size, uploaded_at, status, period, profile, actor, counts and snapshot reference.
Implement retention/erasure only with verifiable evidence. Cryptographic erasure requires separately managed encryption keys and proof of key destruction; otherwise record this as not implemented.

## E3. Limits and chunking
- Upload chunk size target: 2–5 MB.
- Separate processing chunk budget: default 500–2,000 rows; adjust by policy/resource budget.
- Do not load a 100,000-row dataset entirely into RAM just to transform or commit it.
- Defaults: file ≤100 MB, rows ≤100,000, columns ≤100, cell length ≤4,000 characters, archive expansion ≤10x.
- Detect oversize/malformed/unsafe archives and terminate gracefully.
- Background progress, pause, cancel and retry must be wired to actual job/worker state before displaying them as functional.

## E4. Deterministic DQS
Score 0–100 from completeness, validity, uniqueness, consistency and temporal/referential integrity. Default decisions: 90–100 Excellent (approve/continue), 75–89 Acceptable (record warnings), 50–74 Warning (human review), below 50 Reject (repair/review required). Thresholds configurable through a validated central policy. Show score evidence and row-level issues, not merely a badge.

## E5. PDF extraction policy
Require a verifiable structured table before mapping PDF input. If non-tabular or extraction unreliable, record **“Extraction Failed: Non-Tabular Format”** and **“Manual Mapping Required”**, and preserve it as a draft. Never let AI invent rows/cells to make the import appear successful.

## E6. Canonical identity, profile/version and duplicate rules
- Match by item_code for products, customer_code for customers, supplier_code for suppliers—not internal UUID as business identity.
- Codes stay strings; preserve leading zeros such as `000125`; never coerce to numeric; normalize excess whitespace.
- Central synonym dictionary. Each versioned import profile includes profile_id/name/report_type/source/version/required columns/optional columns/ignored columns/synonyms/transformation rules/validation rules/matching key/merge strategy/date rules/status. Historical imports preserve the exact profile version.
- SHA-256 file hash. Duplicate key includes organization_id + profile_id + file_hash + period. Offer explicit policies: skip, replace/version, merge, or new version.
- Resumable upload uses Upload Session ID and server-confirmed chunk manifests. Resume only from the last verified chunk.
- Merge conflict policies: Auto Accept, Existing Wins, Incoming Wins, Manual Review, Reject Row.
- A missing imported row is not a deletion or zero update unless a full-dataset profile explicitly declares it, previews the effects and supports an audited rollback.
- Prevent temporal overlap/double counting, preserve period and snapshot IDs, reject future-data leakage.
- Retention log includes upload_id, expires_at, purge_status and purged_at.

The general-file upload key must not rely solely on a unique constraint whose period columns are NULL. Use a tenant/profile/hash/period claim with a non-null normalized period key and claim it transactionally before creating an upload row. Preserve all historical upload rows when backfilling canonical claim pointers; never silently delete duplicate history. The only supported browser entry point for a new upload is the authorized claim RPC, which creates its initial row atomically and emits an audit event. Failed CSV retries must atomically claim the failed status before partial-row cleanup so only one concurrent retry proceeds. Upload identity fields are immutable after creation. A claim abandoned before parsing begins because the active organization changed must become a retryable, audited failure, not remain stuck in staged state.

# F. Pricing, cart, orders, accounting and fulfillment

## F1. Pricing rule engine
Use one deterministic, backend-enforced pricing engine. Methods: markup_percent, margin_percent, fixed_price and amount_adjustment. Each rule must target wholesale, retail or both by explicit configuration; do not silently apply only wholesale. Basic price is root/default: when no active rule applies, derived wholesale/retail prices must equal base price. Activating/updating/disabling/deleting a rule deterministically recalculates all affected values, including fallback after deletion. Preserve audit trails and historical order price snapshots. Per-order exceptional pricing must not mutate the company-wide catalog. Enforce margins, approvals and access server-side.

## F2. Order transaction atomicity and server price authority
Creating order header, order lines, invoice snapshot, price snapshots, idempotency record and outbox event must be all-or-nothing in a database transaction. Never trust browser-supplied amount/price/discount/tax, organization_id or customer tier. Server derives tenant context from the authenticated session/active membership and recalculates prices and discounts under validated contracts/policies.

Each historical order line should persist:
product_id, item_code, product_name_snapshot, unit_snapshot, quantity, unit_multiplier_snapshot, unit_price_snapshot, discount_snapshot, tax_snapshot and line_total.
Support piece/box/carton/container conversion only when a validated conversion factor exists. ATP calculation must account for physical stock, reservations/allocations and eligible inbound quantities. Do not promise stock twice.

## F3. Pending quantity approval
Changing an approved quantity creates a dirty, unapproved client state. Until an authorized approve RPC commits successfully, prevent navigation to a different admin section/route/classification and warn in Arabic. Preserve edits on backend failure. Allow Enter key to focus the next editable quantity cell in the same column. Approval RPC validates every item, requested upper bounds, role, order state and invoice finalization. No status/payment transition may bypass quantity approval requirements.

After admin order confirmation, show the actual payment instruction beneath the customer-facing invoice/order, and finalize as a sales invoice only by the authorized transaction path. Customer financial visibility policy still hides the amounts in customer views; only show a nonfinancial instruction there.

## F4. Bulk order and commercial orchestration
Target enhancements include rapid matrix ordering, templates/reorder from real history, contract-based customer catalogs, tier pricing, MOQ/volume discounts, credit limit warnings/checks, RFQ/deal desk, quote versions and human price approval, order economics/margin guard, multi-warehouse routing/Incoterms, split fulfillment, partial shipments, backorders, item cancellation, consolidated dispatch and SLA monitoring. They remain disabled/unavailable until real data contracts and authorization exist.

## F5. Operational UX
- Product names fully visible below images.
- Customer stepper derived only from persisted status.
- Clear adjustment notice on returned orders and on actually adjusted item quantities.
- Customer invoice/order amounts hidden under latest all-stage policy.
- RTL invoices contain customer name and number/code in header, avoid repeated names on line items and use the main description field.
- Admin accounting grid supports Enter and mouse-driven next-row quantity entry; preserve dirty values until committed.
- Change input highlight from harsh yellow to calm sky-blue/mint/neutral styles using shared design tokens.

# G. Integrated local/private AI and full-app decision intelligence

## G1. Integrated app and scope
AI operates inside the existing application shell, session, active tenant, permission model and event graph. It analyzes authorized movement through the app: products/catalog, pricing changes, orders/approvals, purchasing/receiving, stock movements, invoices/payments, customer activity, imports/DQS, outbox/queues, exceptions, audit events and system failures. It must never obtain additional access merely because the screen is integrated.

## G2. Operational loop
**Observe → Understand → Predict → Simulate → Recommend → Approve → Execute → Learn.**

Build exception-first AI action center with a clear event timeline and outcome tracking. Suggestions need evidence, source, timestamp, freshness, assumptions and confidence; never claim model reasoning not available.

## G3. Deterministic values and rule engine
Rule-based triggers detect low stock, stagnation, margin erosion, overdue debts, stale prices, unbilled shipping, SKU/barcode conflicts, delayed fulfillment and SLA breaches. Deterministic calculations produce numbers. AI only interprets validated numbers, creates explanations/forecast narratives and proposes next steps. If insufficient historical points exist, return “Forecast Unavailable: Insufficient Historical Data”.

## G4. Private model routing and prompt-injection defense
Pipeline:
Raw Document → Untrusted Content Extraction → Sanitization → Injection Pattern Detection → Structured Extraction → Deterministic Context Building → LLM Payload.
- Sensitive data: local/private model boundary only.
- Non-sensitive aggregated data: explicitly approved server-side sandbox.
- Public anonymized data may go outside only after explicit consent and policy checks.
- External APIs are disabled by default for sensitive data; no browser-side direct model key.
- Imported documents/product names/comments and model responses are untrusted instructions. Log policy decisions and safe metadata, not unnecessary PII/raw content.
- Fail closed if privacy classification, budget, sanitizer or authorized model routing is absent.

## G5. Actionable recommendation cards
Every recommendation includes Why, Source Metrics, Calculation/rule, Snapshot ID, source evidence, timestamp/freshness, Confidence Score, expected impact, risk and Trust State (Verified / Estimated / Pending / Stale). Real actions such as “إنشاء أمر شراء”, “عرض حركة الصنف” and “تجاهل” require correct authorized handlers. High-impact actions require explicit human confirmation and secure backend transaction path.

## G6. Usage ledger and budget
AI ledger fields: ledger_id, organization_id, request_id, model_name, input_tokens, output_tokens, estimated_cost, execution_time_ms, timestamp. Enforce request/daily/monthly budget and quota. At 100% quota, deny further model request and use an explicitly labeled deterministic rule-based fallback. Never invent model token counts or cost estimates.

## G6. Route loading and frontend performance baseline
The storefront and administration route tree uses React `lazy` + `Suspense` so screen modules are loaded when their routes are visited. The loading boundary is localized to the route, Arabic/RTL, and accessible via `role="status"`; the auth provider, guards, shared shells and connectivity status remain first-party shared infrastructure. On final pre-merge PR head `658382a5b09e4ef0363f7e1af11b2e0cc93581c4`, the Vite report measured the main production JS output at 452.62 kB (127.61 kB gzip), compared with 732.55 kB (196.43 kB gzip) before route splitting, a 38.2% reduction in Vite’s displayed uncompressed bundle size. The production budget checker independently measured 454,026 bytes raw / 127,606 bytes gzip, below the 500,000-byte cap. This is a build-artifact measurement, not an end-user Core Web Vitals result; browser-based performance evidence remains open.

The production build additionally runs scripts/verify-bundle-budget.mjs after Vite and fails if the entry JavaScript is missing, ambiguous, empty or exceeds 500,000 uncompressed bytes. This guard passed in the exact-SHA Build run on `658382a5b09e4ef0363f7e1af11b2e0cc93581c4`. PR #4 was merged to main by squash commit `2dbc96fd5cb51b42924238d8d3cead955d90b1e6`.

## G6.1. Import upload idempotency acceptance status
The claim migration `20261015000000_import_upload_idempotency_claims.sql` was merged in PR #6 by main commit `b940e3a8b5581b63b72589b4354687781574ece5`. Exact PR head `e68403226836040dbfe5d4b77c0a9b0d22b02acc` passed the Build, PostgreSQL 17 Migration Chain and Backup Tool Safety Checks. PostgreSQL CI verified that two concurrent claims for the same organization/profile/hash and NULL period reuse one upload ID with exactly one creator; concurrent failed retries yield one winner; direct browser INSERT/DELETE is denied; claimed identity cannot be changed; and a staged claim abandoned during a tenant switch becomes retryable and audited. This proves the database claim/retry contract in a clean PostgreSQL test database, not full browser E2E or production behavior.

## G7. Current AI status
The integrated assistant summarizes saved reports/alerts/tasks and now reads latest tenant-scoped operational activity from both `audit_logs` and `outbox_events`, using only the minimal projections `id, action, entity_type, created_at` and `id, event_type, aggregate_type, status, created_at`. Its activity timeline merges both sources by timestamp and explicitly shows whether a row is an audit record or an outbox event; review candidates use deterministic action/entity/status patterns, including failed/dead-letter outbox states. The RLS/policy layer remains authoritative; outbox visibility is limited by its existing admin read policy. This timeline is only as complete as the application operations that emit audit/outbox records, so the UI must not claim universal audit coverage. The assistant is not a configured generative AI model. A new migration adds one shared security-definer trigger to record purchase-order, inventory-transfer and stock-count draft creation as metadata-only audit entries in the same transaction; the PostgreSQL CI smoke test now asserts that all three entries exist under the correct organization/entity. Existing receiving, transfer-posting, stock-count-posting and expense paths already create explicit audit records. Remaining work includes systematically mapping every other transactional/import/finance path to an auditable event, a private/local inference boundary, sanitization, governance, model routing, budget ledger, richer evidence-backed action cards and evaluation only after those contracts exist. The assistant clears context when tenant changes and ignores stale requests. All metric values remain server-derived.

# H. Event outbox, queues, cache and Arabic search

## H1. Transactional Outbox
Write domain mutation + event in the same database transaction. Deliver at least once, with unique event keys and idempotent consumers. Recovery drills find stalled events, retry safely, avoid duplicate business side effects and log outcome/DLQ status. Empty reads are not sufficient to claim no queue failures.

## H2. Specialized queues and resource budgets
Separate Import, Analytics, Forecast, AI and Export/Notification queues. Each job has timeout, memory/throughput budget, retry count, pause/cancel behavior where supported and graceful termination. Route exhausted jobs to a durable DLQ with operator-visible recovery. UI controls must map to real worker semantics.

## H3. Arabic search
Normalize Arabic, diacritics, tatweel, letter variants and whitespace; support exact SKU, prefix, multi-attribute filters and fuzzy search. Target P95 under 150 ms for indexed workloads and prove with representative benchmarks. Track search_index_version and normalization_version. Re-index in the background.

## H4. Cache and degradation
Tenant-safe keys include organization_id, entity, entity_id, version and snapshot_id. Use request coalescing/SingleFlight, TTL jitter and negative caching where safe. Never reuse cached private data across organizations. When realtime/WebSocket fails, targeted polling must preserve a durable cursor. Service workers may cache only public shell assets; never cache private database/API transactions.

# I. Security, sessions and permissions

- Server-derived tenant context; do not trust frontend organization_id for authorization.
- RLS and privileges on all tables/views/storage; positive and cross-tenant negative tests.
- SECURITY DEFINER functions need qualified schema references, fixed safe search_path, validation and minimum execute grants.
- Customer projections must not leak financial values, cost, reserved stock or tenant data when forbidden.
- Order/stock/payment/ledger/audit/outbox changes use secure server transaction paths, not browser DML bypass.
- Sign-on-another-device behavior requires a server-enforced session/revocation registry; UI-only behavior is insufficient.
- Never store raw/reversible passwords or a shared unsalted hash to test cross-user password uniqueness. The cross-user uniqueness requirement needs explicit security review and privacy-preserving design. Safer baseline includes breached-password screening, strength checks and rate limiting; do not weaken password storage.
- Browser apps cannot claim native iOS screenshot prevention or Android FLAG_SECURE without a real native wrapper/API. State platform limitations honestly.
- Handle invalid/expired sessions, permission denial, authorization conflict, rate limits and retry safely.

# J. Enterprise capability backlog

Treat these as requirements to evaluate and implement incrementally with real backend contracts, not permission to create mock features.

## J1. Performance and shared interaction
- Use cached data fetching/state patterns compatible with existing stack where justified.
- Route lazy loading, virtualized high-volume tables, safe local cache hydration, WebP/AVIF delivery and blur placeholders where the existing asset pipeline supports them.
- Error boundaries and structured error logger without sensitive data leakage.
- Ctrl/Cmd+K command palette for authorized product/order/customer search.
- Shared zod schemas and sanitized user input for contracts that require validation.
- P95 API target below 300 ms; import preview target under two seconds measured on appropriate test data.

## J2. B2B value additions
- Bulk package math and tier prices; rapid matrix order entry.
- Branded RTL PDF/print for authorized invoices, confirmations and statements, sourced from real server data.
- Real-time fuzzy search by SKU/brand/category/price/availability.
- Dynamic customer contract pricing and server-backed credit checks.
- Predictive reorder cadence and stockout notifications, with source/history/confidence.
- Safe substitution suggestions based on product attributes/pricing.
- Multi-user corporate buyer roles, Maker/Checker and purchase approvals.
- Browser camera barcode/QR scan with permission handling and validated mapping.
- Real logistics milestones/ETA only from a configured provider.
- Financial reconciliation of payments/invoices/receivables.
- Offline field-sales writing is parked because the later authoritative technical memo explicitly cancels offline order transaction work.
- Volume/contract discounts from deterministic checkout calculations.
- RFQ and price negotiation, admin approval converting quote through RPC.
- Multi-warehouse routing and delivery-term support.
- Tenant contract-bound catalogs/categories/brands.
- RMA, proof media and credit memo on approved workflow.
- WhatsApp/multichannel transactional dispatch only via configured provider.
- Promotions (Buy X Get Y, tier, bundle), rebates and accrual/settlement.
- Revenue leakage, lost sales recovery, customer 360 and procurement calendar from verifiable data.
- Product knowledge graph and SKU/barcode conflict/attribute enrichment.
- Supplier portal, PO confirmation, ASN, OTD/fill/defect score.
- Company→region→branch→department hierarchy, inter-branch transfers and budgets.
- Integration hub, scoped API keys, rate-limiting, webhooks and ERP sync.
- DQS/import review/dry-run/commit/diff/rollback.
- Collections/disputes and proof of delivery.
- Versioned contracts and what-if commercial simulation.
- Agent sandbox and autonomy levels Assist → Automate → Autopilot, with human approval for high-value actions.

# K. Backup, restore and disaster recovery

## Current repository implementation path (partial until configured and exercised)

- Scheduled workflow: `.github/workflows/encrypted-postgres-backup.yml` (daily, plus manual dispatch).
- Encrypted backup writer: `scripts/backup/create-encrypted-backup.sh`.
- Integrity/decryption/archive verifier: `scripts/backup/verify-encrypted-backup.sh`.
- Guarded restore utility: `scripts/backup/restore-postgres.sh`.
- Operator setup and recovery runbook: `scripts/backup/README.md`.
- Shell syntax/ShellCheck gate: `.github/workflows/backup-tools-validation.yml`.
- The workflow requires repository secrets `SUPABASE_DB_URL` and `BACKUP_AGE_RECIPIENT`; the private age key remains offline. Artifact retention is 14 days. Missing secrets cause an explicit failed/blocked run; they never produce a fake-success backup.
- The backup writer defaults to a dedicated directory under `$HOME/.local/share/aghbari/encrypted-backups`, rejects unsafe root/repository paths and group/world-writable output directories, and does not chmod existing output directories. The manifest verifier parses JSON and checks artifact basename, format, encryption metadata, byte size and SHA-256 digest. The restore utility requires a separate expected-host match and target confirmation; production-labelled restoration also requires the overwrite acknowledgement and creates/verifies a fresh encrypted pre-restore snapshot in a dedicated absolute directory outside the repository before destructive work.
- Scope limitation: the encrypted logical PostgreSQL dump does not include Supabase Storage object bytes, Edge Function source/secrets, or project-level settings. No backup is proven until an actual artifact/manifest is generated; no restore is proven until decryption, archive validation, isolated restore and application smoke tests succeed.


Build backup operations with a zero-cost-first policy, explicit control plane, configurable schedule/retention, status, audit records and failure alerting where provider capability and authorization allow. Distinguish database backup, app source, schema/migrations, uploaded-file metadata/snapshots, configuration and secret material. Never put privileged secrets in export bundles.
- A backup is proven only by actual artifact + scope manifest + integrity/hash verification + timestamp.
- Restore includes preflight checks, authz, schema/version compatibility, dry-run where feasible, explicit confirmation, pre-restore recovery point, rollback strategy and recorded result.
- Test restore to an isolated target before claiming DR readiness.
- CSV export, settings page or static placeholder is not a PostgreSQL/Supabase full backup.
- If provider plan or credentials do not permit automation, record the exact limitation instead of faking a backup.

# L. One unified data-import contract — implementation detail

Every import profile is immutable by version after use. Store a manifest including file hash, profile/version, period, source, schema/normalization version, counts, DQS and score components, row errors/warnings, merge decisions, snapshot ID, times, actor, status, retry/rollback pointers. Retain no raw file beyond policy TTL. The accepted test corpus must include leading-zero codes (e.g. 000125), duplicate file replays, conflicts and unsafe PDF extraction.

# M. Required phased execution fronts

1. **Phase 0 — Architecture Audit & Baseline:** inspect app/routes/auth/RLS/RPC/migrations/current evidence; document preserve/no-break baseline.
2. **Phase 1 — Unified Import:** staging/profile/version, DQS, privacy, duplicate detection, resumability, structured row validation and import manifest.
3. **Phase 2 — SSOT + Onyx:** event-backed operational SSOT, isolated Onyx snapshots/analytics and safe inventory reconciliation.
4. **Phase 3 — Commerce Transactions:** order atomicity, server-price authority, pricing rules, customer views, quantity approval and accounting navigation.
5. **Phase 4 — Outbox/Queues/Search/Cache:** effectively-once processing, DLQ/recovery, Arabic indexing and degradation controls.
6. **Phase 5 — AI Governance:** private/local routing, sanitization, deterministic analytics, forecasts/action cards, usage/cost ledger, event evidence and audit.
7. **Phase 6 — Security Hardening:** server-derived tenant context, RLS cross-tenant tests, sessions, safe password workflows, RPC grants and rate-limit defenses.
8. **Phase 7 — Performance + DR:** response/preview benchmarks, backup integrity, tested restore and recovery drill.
9. **Phase 8 — E2E + Regression Closure:** storefront/admin end-to-end, responsive/accessibility, SQL migration chain, import acceptance, idempotency, AI-injection test, tenant security and regression suite.
10. Five coordinated fronts: customer discovery; customer commerce; admin commercial core; data + AI operations; control plane + final closure.

Do not jump phases by claiming completion based on UI presence. Parallel work is encouraged only where safe, independent and non-conflicting.

# N. Acceptance tests and evidence requirements

Each test must be recorded with requirement ID, exact tested SHA, setup, action, expected/actual result, artifact/log link and PASS/FAIL/BLOCKED/PARTIAL/NOT_PROVEN status.

- **REQ-IMP-001:** import 1,000 product rows with SKU `000125`; preserve as string including leading zeros and reject duplicate replay; show database row and manifest.
- **REQ-SEC-PASS-001:** cross-user password reuse must be evaluated against reviewed security architecture, returning required Arabic message if a safe method is selected; never store plaintext/reversible/shared unsalted passwords.
- **REQ-ORD-SYNC-001:** admin changes quantities and Enter moves between rows; approval commits; customer status/adjustment/payment notice is updated from saved state. Show recording/event evidence; customer amounts remain hidden under the latest policy.
- **REQ-AI-001:** prompt-injection text in import/product fields passes sanitizer/detection and is not executed; retain sanitized-policy event and safe LLM payload evidence without logging sensitive raw data.
- **REQ-SEC-001:** organization A attempts a data/price operation for organization B by spoofing organization_id; server-derived context/RLS must refuse with no leak or mutation. Record incident/SQL policy evidence.
- **Pricing:** each method targets retail and/or wholesale as configured; deleting/disabling all applicable rules restores base price for derived columns; test the test and record before/after rows + exact migration result.
- **DQS/PDF:** boundary scores result in correct review/reject state; non-tabular PDF returns Manual Mapping Required with no fabricated rows.
- **Outbox:** simulate worker interruption; recover event without duplicate business effect.
- **Backup/restore:** artifact integrity verified and restore succeeds on isolated test target.
- **AI quotas:** quota exhaustion blocks the model call and falls back to deterministic rules; model numbers never serve as authoritative arithmetic.
- **Tenant changes:** assistant conversation clears and stale prior-tenant responses cannot appear after switching organization.
- **P95 & preview:** measure with representative dataset and environment; do not claim the target based on code inspection.

## Definition of Done
A requirement is complete only after backward-compatible schema/migration as applicable, backend contract, connected frontend, authentication/authorization, common UI states, responsive behavior, validation, evidence-backed tests, regression run and explicit exact-SHA record. UI/table/stub/static checks alone are not sufficient.

# O. Current execution reality and reporting

The master file contains product requirements and desired end state; it is not evidence that those features exist. Maintain current status in `ops/AGHBARI-LATEST-EXECUTION-STATE.md` and each run in `ops/AGHBARI-DEVELOPMENT-PROGRESS.md`. Record implemented / verified / proven / blocked separately, and state the next executable action. Link screenshots through the source index, not duplicated implementation. Preserve exact source lineage in `docs/canonical/AGHBARI-SOURCE-REQUIREMENTS-INDEX.md`.
