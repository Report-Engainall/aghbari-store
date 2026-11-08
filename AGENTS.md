# Nasr1 — canonical application branch

Repository: `Report-Engainall/Nasr1`
Active branch: `main`
Product: متجر الأغبري | Aghbari Commerce

## Source-control rules
- `main` is the only active application and Bolt synchronization branch.
- Preserve the existing application. Make targeted changes; do not rebuild or replace working modules.
- Do not force-push, reset, clean, or overwrite unpublished work.
- Confirm the GitHub panel identifies this repository and `main` before assuming Bolt synchronization is active.
- Keep commits small and verify the exact resulting commit.
- The full pre-optimization repository snapshot is preserved in branch `nasr1-reference-archive-2026-11-08` at original commit `b1c433dba9fa8edbb28639976aadc40106d7688b`. Archive branch: https://github.com/Report-Engainall/Nasr1/tree/nasr1-reference-archive-2026-11-08
- The archive branch is for read-only recovery and historical references. Do not merge the archive wholesale into `main`; that would restore the oversized materials.
- Historical specifications, test suites, CI workflows, local scripts, and the applied migration history are preserved in the archive branch. Their absence from `main` is intentional, not missing runtime functionality.

## Product invariants
- B2B commerce with Arabic RTL as the default and English localization.
- Prices and customer tiers are server-authoritative. Never expose costs, margins, another tier's price, internal identifiers, or protected financial data through APIs, RPCs, DOM, PWA cache, exports, or documents.
- Enforce tenant isolation and role authorization at the database/RPC boundary; do not rely on UI hiding.
- Financial, order, and inventory mutations must be server-authoritative and online-only. Offline/PWA caches are read-only.
- Preserve immutable audit/history for financial and order lifecycle operations.
- Do not fabricate invoices, payments, balances, or supplier obligations.

## Existing backend protection
- Existing Supabase project: `aghbari-commerce-nasr1`
- Project ref: `tfdwtuwkdddnzgyhcoyy`
- URL: `https://tfdwtuwkdddnzgyhcoyy.supabase.co`
- Use this existing project only. Do not create Bolt Database, Lovable Cloud, or another Supabase project.
- Never reset, drop, truncate, seed, or reinitialize the database. Never replay migrations already applied.
- The complete historical SQL migration chain is preserved in the archive branch under `supabase/migrations/`. Before any schema work, inspect that history and verify the live database migration state. Add only genuinely new migrations.
- Keep Supabase Edge Function sources and existing runtime configuration intact. Their presence does not prove deployment.
- Client environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never expose service-role keys or server secrets to client code.

## Development
- Existing React/Vite/TanStack application; extend it in place.
- Install using `bun install --frozen-lockfile`.
- Run with `bun run dev`; build with `bun run build`.
- The active import branch intentionally excludes test-only files and local test harnesses to stay within Bolt's import limit. Do not claim unit, E2E, or database acceptance passed unless it was actually run against the relevant suite/environment. Retrieve tests from the archive branch when required.
- Keep paid AI spend at zero. Prefer deterministic/local logic; do not add paid providers or billing dependencies.
- Do not reintroduce historical archives, duplicate source trees, large reports, or test-only fixtures into `main` unless essential to runtime and the import-size impact has been checked.
