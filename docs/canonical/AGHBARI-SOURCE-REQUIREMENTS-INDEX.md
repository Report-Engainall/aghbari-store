# Source Requirements Preservation Index

**Purpose:** Preserve the full requirements lineage and prevent omissions during consolidation. This index does not replace the original user messages or the detailed canonical specification; it creates durable references inside the repository.

## Sources incorporated

1. Bolt Master Project Knowledge + Complete Product Tree, supplied 2026-10-10: product identity, Arabic-first RTL, quality/accessibility/data-truth rules, full storefront and control-plane routes, shared design system, five execution fronts, smart gap completion, screenshot deduplication, free tooling, B2B enhancements and strategic engines.
2. Production-Grade Edition v2.1 technical memorandum, supplied 2026-10-10: no rewrite/no delete, one import engine, privacy, upload and processing chunk separation, DQS, PDF no-hallucination policy, profile versioning, duplicate detection, tenant SSOT, Onyx isolation, inventory reconciliation, server idempotency, deterministic calculations, private/local AI routing, AI usage ledger, outbox, queues, Arabic search, cache degradation, session/security requirements, order atomicity, customer/admin UX and execution phases.
3. Additional order-quantity navigation, color, customer financial visibility and pricing-engine requirements supplied with the memorandum.
4. Persistent Aghbari instructions from prior sessions: actual state first; exact-SHA evidence; one coherent gap at a time; UI references indexed and deduplicated by screen family without deleting the originals; no paid spend; keep Report-Advisor separate; do not claim production/runtime proof from a build or SQL test alone.
5. Explicit follow-up correction: the AI platform must be integrated into Aghbari, not separated. It should analyze and recommend on authorized movement across the app, with local/private data handling.
6. Explicit follow-up instruction: preserve all sent instructions in the repository; continue and complete what exists, add missing requirements, merge only when safe, and choose better technical methods proactively.

## Product identity and source lineage

The sole product identity is **الأغبري | Aghbari Commerce**. The strings **العامري**, **Alamri**, **Amiri**, and **بوابة العامري الذكية** may appear in historical screenshots, older requirement files or source material, but must never become the active product brand. These old references remain historical provenance only; preserve source artifacts instead of deleting them, and implement the useful screen behavior once per deduplicated screen family.

## Canonical precedence for conflicts

- Latest direct user instruction takes precedence over an older conflicting design rule while retaining the older requirement as provenance in this index.
- Explicit current rule says hide prices/financial amounts from customer order/invoice views at all stages. This overrides the earlier threshold rule that showed a total for orders with more than five lines; the threshold rule remains documented as a superseded request.
- Offline static app-shell/PWA support is allowed, but the latest technical memorandum explicitly removes offline order transactions and replay. The aspirational offline field-sales mode is parked until the user authorizes a safe transactional redesign; never queue or pretend to save order/payment/inventory writes offline.
- The AI module is integrated into the application but logically scoped and private; integration must not remove tenant isolation, RLS, roles, auditing or model-data controls.
- Passwords must never be stored reversibly or in a shared unsalted hash to enforce cross-user password uniqueness. This requirement requires security review and a privacy-preserving architecture; a safer breached-password check, strong-password policy and rate limiting must not be undermined.
- No native-platform guarantee (e.g. iOS screenshot blocking or Android FLAG_SECURE) may be claimed for a browser-only app unless the actual native wrapper/API supports and proves it.

## Implementation additions recorded on 2026-10-10

- Integrated AI operational timeline reads only minimal organization-scoped `audit_logs` and `outbox_events` fields; it never selects event `payload` or arbitrary audit JSON.
- Draft creation for purchase orders, inventory transfers and stock counts is now recorded by a shared metadata-only trigger. SQL CI includes smoke assertions that each action creates an audit record tied to the correct tenant and entity.
- Backup/restore tools now include encrypted database dump, strict JSON/hash verification, a guarded restore, and a dedicated pre-restore snapshot requirement before any production-labelled destructive restore. Configuration and actual restore proof remain prerequisites.

## Screenshot preservation

Current index reference: `docs/ui-reference/UI-REFERENCE-ASSET-INDEX.md`. Its audited count is 89 files / 85 unique Git blobs / 4 redundant file entries at the time recorded. Duplicate screenshots remain in source control for evidence/provenance. Deduplicate rendered screens and behavior, not the historical files.

## Detailed specification

The full implementation contract is maintained in `docs/canonical/AGHBARI-MASTER-PROJECT-SPECIFICATION.md`. New user instructions must be appended here (date, brief description, conflict outcome) and incorporated into that specification without silently deleting prior requirements.
