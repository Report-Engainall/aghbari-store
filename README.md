# متجر الأغبري | Aghbari Commerce — Nasr1

This is the canonical application and execution branch for the existing Nasr1 project. The active branch is `main`, connected to Bolt through the existing GitHub repository.

## Canonical source and execution documents
- Master specification: `docs/canonical/AGHBARI-MASTER-PROJECT-SPECIFICATION.md`.
- Sole execution pointer: `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`.
- Sole acceptance matrix: `docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`.
- Do not create parallel requirement matrices or rebuild the application from scratch.

## Active application tree
- Retains the React/Vite/TanStack application, runtime assets, package manifests, Supabase client/types/configuration, and Edge Function source.
- The three canonical execution documents above are intentionally retained in `main` so Bolt can work from the same acceptance contract.
- Historical tests, E2E fixtures, CI workflows, local scripts, prior source snapshots, and all 271 SQL migration source files remain preserved in `nasr1-reference-archive-2026-11-08`. Retrieve only the necessary tests or migration references; do not merge the archive wholesale.

## Historical archive
- Archive branch: https://github.com/Report-Engainall/Nasr1/tree/nasr1-reference-archive-2026-11-08
- Preserved original commit: `b1c433dba9fa8edbb28639976aadc40106d7688b`.
- Original snapshot: 1,399 files / 23,059,921 bytes.

## Existing Supabase backend — do not recreate
- Project: `aghbari-commerce-nasr1`.
- Ref: `tfdwtuwkdddnzgyhcoyy`.
- URL: `https://tfdwtuwkdddnzgyhcoyy.supabase.co`.
- Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Bolt environment settings; server secrets stay server-side.
- Never create, reset, recreate, truncate, or reseed this database. Never replay historical migrations. Inspect the live migration ledger before any new schema change.

## Local development
```sh
bun install --frozen-lockfile
bun run dev
```

Build:
```sh
bun run build
```

Keep `main` within the verified Bolt import ceiling. Do not add bulk archives, duplicate source trees, or unrelated reports. Restore only high-value execution context and focused tests, checking the size impact before each addition.