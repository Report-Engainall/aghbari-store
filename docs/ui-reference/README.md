# Historical UI references

These five screenshots were retained from the previous `dev` Bolt export as reference material. They live under documentation so they do not ship as customer-facing public assets.

| File | Purpose |
|---|---|
| `aghbari-screen-2026-08-06-150303.png` | Historical screen reference |
| `aghbari-screen-2026-08-06-150329.png` | Historical screen reference |
| `aghbari-screen-2026-08-06-150354.png` | Historical screen reference |
| `aghbari-screen-2026-08-06-150421.png` | Historical screen reference |
| `aghbari-screen-2026-08-06-150457.png` | Historical screen reference |

## Consolidation decision

The old `dev` ref was an independent/orphan Bolt export, not a branch descended from `main`. The current `main` app contains the newer modular route structure and the current database migrations, so the legacy monolithic `src/App.tsx`, its separate stylesheet, duplicate package definitions, and generated build/dependency files were not overlaid on top of the active app.

The available Base64 ZIP snapshot was incomplete (no ZIP end-of-central-directory record in the inspected decoded content) and included generated `dist`, `node_modules`, and environment data rather than a clean, complete source bundle. It was not restored as project source. The useful historical screenshots are preserved here.
