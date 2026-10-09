# Aghbari Commerce

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-b5g7dtki)

Arabic-first, RTL-friendly B2B commerce application built with React, TypeScript, Vite, and Supabase.

## Run locally

1. Use Node.js 20 or newer.
2. Install dependencies: `npm ci`
3. Copy `.env.example` to `.env` and set the Supabase project URL and public anon key.
4. Start the development server: `npm run dev`
5. Verify a production build: `npm run build`

The app uses safe placeholder values when Supabase environment variables are absent. Data operations require valid Supabase configuration and organization/warehouse IDs where applicable.

## Environment variables

- `VITE_SUPABASE_URL`: Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: Supabase public anon key. Never put a service-role key or any privileged secret in a Vite `VITE_*` variable.
- `VITE_ORG_ID`: organization ID used by the current data layer.
- `VITE_WAREHOUSE_ID`: warehouse ID used by the current inventory data layer.

Do not commit `.env` files or live environment values. Configure deployment variables in the hosting provider.

## Repository layout

- `src/`: customer storefront, admin pages, shared components, API/data layer.
- `public/`: static assets.
- `supabase/migrations/`: ordered SQL migrations.
- `docs/ui-reference/`: imported historical screenshots retained as design references, not runtime assets.
- `package.json` / `package-lock.json`: single canonical dependency and script definition at repository root.

Run `npm run build` before merging changes. GitHub Actions runs the same build check on pushes and pull requests.
