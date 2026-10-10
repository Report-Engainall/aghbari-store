import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const read = relative => readFile(path.join(root, relative), 'utf8')
const required = (text, pattern, message) => assert.match(text, pattern, message)

const referenceDir = path.join(root, 'docs/ui-reference')
const imageNames = (await readdir(referenceDir))
  .filter(name => /\.(png|jpe?g|webp)$/i.test(name))
  .sort((a, b) => a.localeCompare(b, 'en'))

assert.ok(imageNames.length > 0, 'No UI reference images were found.')
const [readme, index, pricingMigration, safeProductSelect, storefront, store, catalog, productDetail, policyCenter, policiesHook, adminOperations, transactionPages, appRoutes, adminShell, operationalMigration, statementMigration, utilityPages, adminScreens, securityMigration, legacyApi, offlineWorker, offlineUi, mainEntry, webManifest, htmlShell, offlineBoundary] =
  await Promise.all([
    read('docs/ui-reference/README.md'),
    read('docs/ui-reference/UI-REFERENCE-ASSET-INDEX.md'),
    read('supabase/migrations/20261010120000_commerce_policy_center_and_approved_quantities.sql.sql'),
    read('src/lib/customerProductSelect.ts'),
    read('src/pages/storefront/StorefrontPages.tsx'),
    read('src/pages/storefront/Store.tsx'),
    read('src/pages/storefront/Catalog.tsx'),
    read('src/pages/storefront/ProductDetail.tsx'),
    read('src/pages/admin/PolicyCenter.tsx'),
    read('src/lib/useCommercePolicies.ts'),
    read('src/pages/admin/OperationsPages.tsx'),
    read('src/pages/admin/TransactionsPages.tsx'),
    read('src/App.tsx'),
    read('src/components/admin/AdminShell.tsx'),
    read('supabase/migrations/20261011000000_inventory_procurement_finance_operations.sql'),
    read('supabase/migrations/20261012000000_organization_statement_rpc.sql'),
    read('src/pages/admin/UtilityPages.tsx'),
    read('src/pages/admin/AdminPages.tsx'),
    read('supabase/migrations/20261013000000_tenant_safe_customers_and_product_prices.sql'),
    read('src/lib/api.ts'),
    read('public/sw.js'),
    read('src/components/ui/ConnectivityStatus.tsx'),
    read('src/main.tsx'),
    read('public/manifest.webmanifest'),
    read('index.html'),
    read('docs/OFFLINE-BOUNDARY.md'),
  ])

for (const imageName of imageNames) {
  assert.ok(index.includes(`[${imageName}](./${imageName})`), `Reference index is missing ${imageName}`)
}
const indexedCount = Number(index.match(/الصور الموجودة[^\n]*\*\*(\d+)\*\*/)?.[1])
const readmeCount = Number(readme.match(/\*\*(\d+)\s*صورة/)?.[1])
assert.equal(indexedCount, imageNames.length, 'Reference index image count is stale.')
assert.equal(readmeCount, imageNames.length, 'Reference README image count is stale.')

const blobHashes = new Map()
for (const name of imageNames) {
  const bytes = await readFile(path.join(referenceDir, name))
  const hash = createHash('sha256').update(bytes).digest('hex')
  blobHashes.set(hash, (blobHashes.get(hash) || 0) + 1)
}
const duplicateFiles = [...blobHashes.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0)
assert.ok(index.includes(`**${duplicateFiles}**`), 'Reference index does not describe the current duplicate-image count.')

const normalizedProductProjection = safeProductSelect.toLowerCase()
for (const forbidden of ['base_price', 'retail_price', 'wholesale_price', 'unit_price', 'cost_price', 'line_total', 'total_amount']) {
  assert.ok(!normalizedProductProjection.includes(forbidden), `Customer product projection exposes financial field: ${forbidden}`)
}

required(storefront, /customer_order_summaries/, 'Customer order pages must read the safe order projection.')
required(storefront, /customer_order_item_summaries/, 'Customer order pages must read the safe item projection.')
required(storefront, /customer_sales_invoice_summaries/, 'Customer invoice pages must read safe invoice summaries.')
required(storefront, /customer_payment_summaries/, 'Customer payment pages must read safe payment summaries.')
required(storefront, /const showTotal = false/, 'Customer order totals must remain hidden in every order state.')
required(storefront, /submit_order_payment/, 'Customer payment submission must use the server RPC.')
required(storefront, /p_idempotency_key: paymentIdempotencyKey/, 'Payment submission must pass a stable idempotency key.')

for (const [fileName, source] of [['Store.tsx', store], ['Catalog.tsx', catalog], ['ProductDetail.tsx', productDetail]]) {
  required(source, /CUSTOMER_PRODUCT_SELECT/, `${fileName} must use the price-free product projection for customer reads.`)
}
required(policyCenter, /مركز السياسات/, 'The centralized administration policy screen is missing.')
required(policyCenter, /dqs_excellent_min/, 'Policy center does not expose DQS configuration.')
required(policyCenter, /ai_daily_token_quota/, 'Policy center does not expose AI budget configuration.')
required(policiesHook, /customer_prices_hidden:\s*true/, 'Mandatory price-hiding policy must fail closed.')
required(policiesHook, /require_quantity_approval:\s*true/, 'Mandatory quantity approval must fail closed.')

for (const formula of ['markup_percent', 'margin_percent', 'fixed_price', 'amount_adjustment']) {
  assert.ok(pricingMigration.includes(`WHEN '${formula}'`) || pricingMigration.includes(`'${formula}'`), `Pricing formula is missing: ${formula}`)
}
required(pricingMigration, /CREATE OR REPLACE FUNCTION public\.recalculate_organization_product_prices/, 'Server-side pricing recalculation function is missing.')
assert.ok(pricingMigration.includes('REVOKE ALL ON FUNCTION public.calculate_commerce_price(uuid, integer, text) FROM authenticated'), 'The internal price evaluator must not be client-callable.')
assert.ok(!pricingMigration.includes('GRANT EXECUTE ON FUNCTION public.calculate_commerce_price(uuid, integer, text) TO authenticated'), 'Clients must not be able to call the internal price evaluator directly.')
required(pricingMigration, /AFTER INSERT OR UPDATE OR DELETE ON pricing_rules/, 'Price recalculation must respond to rule activation, update and deletion.')
required(pricingMigration, /LIMIT 1\s*\),\s*p\.base_price,\s*0\)/, 'Pricing must fall back to base price when no matching active rule exists.')
required(pricingMigration, /CREATE OR REPLACE FUNCTION public\.approve_order_quantities/, 'Atomic quantity approval RPC is missing.')
assert.ok(pricingMigration.includes('SELECT count(*) FROM jsonb_object_keys(p_quantities)'), 'Quantity approval must count submitted JSON keys using supported PostgreSQL JSONB functions.')
assert.ok(!pricingMigration.includes('jsonb_object_length'), 'Do not use an unsupported JSONB object-length function.')
required(pricingMigration, /CREATE OR REPLACE FUNCTION public\.submit_order_payment/, 'Server-side payment submission RPC is missing.')
required(pricingMigration, /'submit_payment'/, 'Payment idempotency operation key is missing.')
const dollarCount = (pricingMigration.match(/\$\$/g) || []).length
assert.equal(dollarCount % 2, 0, 'SQL migration contains unbalanced dollar-quote delimiters.')
for (const malformed of ['DO $', 'AS $', '$;']) {
  assert.ok(!pricingMigration.split('\n').some(line => line.trim() === malformed), `Malformed SQL dollar delimiter found: ${malformed}`)
}

required(pricingMigration, /CREATE POLICY pricing_rules_admin_all/, 'Direct pricing-rule changes must be limited to tenant administrators.')
required(pricingMigration, /CREATE POLICY import_uploads_admin_all/, 'Import uploads must be admin-only through direct table access.')
required(pricingMigration, /CREATE POLICY import_records_admin_all/, 'Import records must be admin-only through direct table access.')
required(pricingMigration, /CREATE POLICY commerce_policy_settings_admin_all/, 'Policy settings must be admin-only.')
required(pricingMigration, /CREATE POLICY audit_logs_admin_read/, 'Audit logs must have a tenant-admin read policy.')
required(pricingMigration, /CREATE OR REPLACE FUNCTION public\.audit_pricing_rule_change/, 'Pricing rule lifecycle must be audited.')
required(pricingMigration, /CREATE POLICY orders_customer_read_own/, 'Customer order visibility must be owner-scoped.')
required(pricingMigration, /cross_organization_cart_product/, 'The server must reject cart products belonging to a different organization.')
required(pricingMigration, /v_unit_price := public\.calculate_commerce_price\([\s\S]{0,180}v_price_level/, 'Order prices must use the server-derived customer tier.')
assert.ok(pricingMigration.includes("AND c.status = 'approved'"), 'Order pricing must derive the tier from an approved customer record that exists in the canonical schema.')
assert.ok(!pricingMigration.includes('c.is_active = true'), 'Do not reference a customer is_active column that is absent from the canonical customers table.')
assert.ok(pricingMigration.includes('ADD COLUMN IF NOT EXISTS request_context_hash text'), 'Order idempotency must persist a cart-independent request context hash for retry after cart clearing.')
assert.ok(pricingMigration.includes('request_context_hash = EXCLUDED.request_context_hash'), 'Order idempotency upsert must retain the request context hash.')
for (const view of [
  'customer_order_summaries',
  'customer_order_item_summaries',
  'customer_sales_invoice_summaries',
  'customer_payment_summaries',
  'customer_statement_summaries',
]) {
  assert.ok(pricingMigration.includes('ALTER VIEW public.' + view + ' SET (security_invoker = true)'), view + ' must run with invoker security and base-table RLS.')
}
assert.equal((pricingMigration.match(/CREATE POLICY [^\n]*idempotency/gi) || []).length, 0, 'Idempotency keys must not be directly accessible through client table policies.')

for (const route of [
  '/admin/inventory', '/admin/warehouses', '/admin/inventory/movements', '/admin/suppliers',
  '/admin/purchasing', '/admin/receiving', '/admin/transfers', '/admin/stock-counts',
  '/admin/expenses', '/admin/barcode', '/admin/exports', '/admin/invoices', '/admin/payments', '/admin/statements',
  '/admin/roles', '/admin/outbox', '/admin/idempotency', '/admin/policy-center',
]) {
  const path = route.slice('/admin/'.length)
  assert.ok(appRoutes.includes('path="' + path + '"'), 'Missing dedicated admin route: ' + route)
  assert.ok(adminShell.includes("to: '" + route + "'"), 'Admin navigation omits route: ' + route)
}

for (const rpc of [
  'create_purchase_order', 'receive_purchase_order', 'create_inventory_transfer',
  'post_inventory_transfer', 'create_stock_count', 'post_stock_count', 'record_expense',
]) {
  assert.ok(operationalMigration.includes('CREATE OR REPLACE FUNCTION public.' + rpc), 'Operational database RPC missing: ' + rpc)
  assert.ok(transactionPages.includes("supabase.rpc('" + rpc + "'"), 'Transactional UI is not connected to RPC: ' + rpc)
}
for (const table of [
  'purchase_orders', 'purchase_order_items', 'goods_receipts', 'goods_receipt_items',
  'inventory_transfers', 'inventory_transfer_items', 'stock_counts', 'stock_count_items', 'expenses',
]) {
  assert.ok(operationalMigration.includes('CREATE TABLE IF NOT EXISTS public.' + table), 'Operational table missing: ' + table)
}
assert.ok(operationalMigration.includes('REVOKE INSERT, UPDATE, DELETE ON public.purchase_orders'), 'Operational ledgers must not allow direct browser writes.')
assert.ok(operationalMigration.includes('receipt_warehouse_must_match_purchase_order'), 'Receiving must be restricted to the purchase-order warehouse.')
assert.ok(operationalMigration.includes('insufficient_available_stock'), 'Transfers must reject insufficient available stock.')
assert.ok(operationalMigration.includes('stock_changed_since_count'), 'Stock-count posting must reject stale stock snapshots.')
assert.ok(transactionPages.includes("supabase.rpc('receive_purchase_order'"), 'Receiving must use the server-side transaction RPC.')
assert.ok(transactionPages.includes("supabase.rpc('post_inventory_transfer'"), 'Transfer posting must use the server-side transaction RPC.')
assert.ok(transactionPages.includes("supabase.rpc('post_stock_count'"), 'Stock-count posting must use the server-side transaction RPC.')

assert.ok(statementMigration.includes('CREATE OR REPLACE FUNCTION public.generate_organization_statement'), 'Statement generation RPC is missing.')
assert.ok(statementMigration.includes('REVOKE INSERT, UPDATE, DELETE ON public.statements FROM anon, authenticated'), 'Statements must be immutable from direct browser DML.')
assert.ok(statementMigration.includes('statement_generation_forbidden'), 'Statement generation must enforce tenant-admin authorization.')
assert.ok(statementMigration.includes('RETURN v_statement_id'), 'Statement generation must replay an existing snapshot for the same organization and period.')
assert.ok(adminOperations.includes("supabase.rpc('generate_organization_statement'"), 'Statement screen is not wired to the server-side generation RPC.')
assert.ok(adminOperations.includes('total_invoiced,total_paid'), 'Statement list must show the saved invoice/payment totals.')
assert.ok(utilityPages.includes(".eq('organization_id', organizationId)"), 'CSV exports must be restricted to the active organization.')
assert.ok(utilityPages.includes('Prevent spreadsheet formula injection'), 'CSV exports must mitigate spreadsheet formula injection.')
assert.ok(utilityPages.includes(".eq('barcode', code)"), 'Barcode lookup must use the actual database barcode column.')
assert.ok(adminOperations.includes("supabase.rpc('confirm_order_payment'"), 'Admin payment review must use the authorized confirmation RPC.')
assert.ok(adminScreens.includes("supabase.from('customers')"), 'Admin customer screen must read the customers table, not organization-members.')
assert.ok(adminScreens.includes("supabase.from('audit_logs')"), 'Audit screen must read the persisted audit log.')
assert.ok(adminScreens.includes('supabase.auth.getUser()'), 'Health screen must verify the real authentication session.')
assert.ok(adminScreens.includes(".eq('organization_id', organization.id)"), 'Admin business reads must be organization-scoped.')
assert.ok(adminScreens.includes('setError(queryError.message)'), 'Admin data views must surface real query errors.')

assert.ok(securityMigration.includes('ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY'), 'Customer PII table must enable RLS.')
assert.ok(securityMigration.includes('customers_member_read'), 'Customer RLS must scope reads to the active organization or profile owner.')
assert.ok(securityMigration.includes('REVOKE SELECT ON public.products FROM PUBLIC, anon, authenticated'), 'Product table must revoke unrestricted browser reads.')
assert.ok(securityMigration.includes('CREATE OR REPLACE VIEW public.admin_product_catalog'), 'Staff product pricing must use the secure admin view.')
assert.ok(securityMigration.includes('CREATE TRIGGER products_audit_catalog_changes'), 'Product changes must be auditable.')
assert.ok(adminScreens.includes("from('admin_product_catalog')"), 'Admin catalog screens must use the tenant-authorized catalog view.')
assert.ok(productDetail.includes("const productSource = isAdmin ? 'admin_product_catalog' : 'products'"), 'Product details must separate staff pricing reads from storefront reads.')
assert.ok(legacyApi.includes("from('admin_product_catalog')"), 'Legacy staff product API must use the secure admin catalog view.')
assert.ok(legacyApi.includes("update({ is_active: false })"), 'Product deletion must preserve order history through soft deactivation.')
assert.ok(!safeProductSelect.includes('reserved_stock'), 'Customer product projection must not expose reserved inventory.')
assert.ok(!safeProductSelect.includes('base_price') && !safeProductSelect.includes('cost_price'), 'Customer product projection must never select financial values.')

required(offlineWorker, /request\\.method !== 'GET'/, 'Offline cache must never intercept non-GET requests.')
required(offlineWorker, /url\\.origin !== self\\.location\\.origin/, 'Offline cache must never intercept cross-origin API requests.')
required(offlineWorker, /request\\.mode === 'navigate'/, 'Offline shell must recover the SPA document for direct-route navigation.')
required(offlineWorker, /url\\.pathname\\.startsWith\\('\\/assets\\/'\\)/, 'Offline static caching must be limited to built immutable assets.')
assert.ok(offlineWorker.includes("if (request.method !== 'GET') return"), 'Offline cache must never intercept non-GET requests.')
assert.ok(offlineWorker.includes('if (url.origin !== self.location.origin) return'), 'Offline cache must never intercept cross-origin API requests.')
assert.ok(offlineWorker.includes("if (request.mode === 'navigate')"), 'Offline shell must recover the SPA document for direct-route navigation.')
assert.ok(offlineWorker.includes("const hashedAsset = url.pathname.startsWith('/assets/')"), 'Offline static caching must be limited to built immutable assets.')
assert.ok(offlineWorker.includes("const shellStatic = url.pathname === '/logo.svg' || url.pathname === '/manifest.webmanifest'"), 'Offline static caching may include only public brand metadata outside hashed assets.')
assert.ok(mainEntry.includes("navigator.serviceWorker.register('/sw.js'"), 'Production must register the public app-shell service worker.')
assert.ok(htmlShell.includes('<link rel="manifest" href="/manifest.webmanifest" />'), 'Installable app manifest must be linked from the document.')
assert.ok(webManifest.includes('"lang": "ar"'), 'PWA manifest must preserve the Arabic locale.')
assert.ok(offlineUi.includes('navigator.onLine'), 'Offline banner must report browser connectivity changes.')
assert.ok(offlineUi.includes('لن تُحفظ الطلبات أو المدفوعات أو تغييرات المخزون دون اتصال بالخادم'), 'Offline UX must explicitly deny fake transaction success.')
assert.ok(offlineBoundary.includes('لا يخزّن عامل الخدمة استجابات Supabase/API أو بيانات العملاء'), 'Offline policy must prohibit caching private business data.')
assert.ok(offlineBoundary.includes('لا توجد قائمة انتظار محلية للطلبات أو الدفع'), 'Offline policy must record that sensitive transaction queues are not implemented.')
assert.ok(appRoutes.includes('<ConnectivityStatus />'), 'Global offline status must be wired into the application tree.')

console.log(`Static contract checks passed: ${imageNames.length} indexed UI images, ${duplicateFiles} duplicate files, price-free customer projections, centralized policy controls, pricing/order/payment safeguards, and connected inventory/procurement/finance workflows.`)
console.log('These checks are static guardrails only; they do not replace SQL migration execution, RLS tests, or browser end-to-end verification.')
