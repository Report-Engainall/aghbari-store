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

const aiAssistant = await read('src/pages/admin/AIAssistant.tsx')
const aiIntegration = await read('docs/AI-PORTAL-INTEGRATION.md')
const [rootReadme, projectMemory, canonicalSpec, sourceIndex, executionState, progressLedger] = await Promise.all([
  read('README.md'),
  read('PROJECT_MEMORY.md'),
  read('docs/canonical/AGHBARI-MASTER-PROJECT-SPECIFICATION.md'),
  read('docs/canonical/AGHBARI-SOURCE-REQUIREMENTS-INDEX.md'),
  read('ops/AGHBARI-LATEST-EXECUTION-STATE.md'),
  read('ops/AGHBARI-DEVELOPMENT-PROGRESS.md'),
])
const [backupWorkflow, backupCheckWorkflow, sqlMigrationWorkflow, backupCreate, backupVerify, backupRestore, backupGuide] = await Promise.all([
  read('.github/workflows/encrypted-postgres-backup.yml'),
  read('.github/workflows/backup-tools-validation.yml'),
  read('.github/workflows/sql-migrations.yml'),
  read('scripts/backup/create-encrypted-backup.sh'),
  read('scripts/backup/verify-encrypted-backup.sh'),
  read('scripts/backup/restore-postgres.sh'),
  read('scripts/backup/README.md'),
])
const commercialAuditMigration = await read('supabase/migrations/20261014000000_audit_commercial_draft_creation.sql')

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
assert.ok(pricingMigration.includes("r.price_level IN ('retail','both')"), 'Pricing recalculation must target retail rules and rules configured for both columns.')
assert.ok(pricingMigration.includes("r.price_level IN ('wholesale','both')"), 'Pricing recalculation must target wholesale rules and rules configured for both columns.')
assert.ok(pricingMigration.includes('AFTER INSERT OR UPDATE OR DELETE ON pricing_rules'), 'Rule insertion, update, disable and deletion must trigger derived-price recalculation.')
assert.ok(adminScreens.includes("const [loadError, setLoadError] = useState('')"), 'Pricing must retain a distinct backend-read error state.')
assert.ok(adminScreens.includes('loadError ? <ErrorState description={loadError} onRetry={() => void load()}'), 'Pricing read failure must offer explicit retry instead of displaying an empty state.')
assert.ok(adminScreens.includes('window.confirm('), 'Pricing-rule deletion must require confirmation.')
assert.ok(adminScreens.includes('لا يمكن إلا لمسؤول المؤسسة حذف قواعد التسعير'), 'Pricing-rule deletion must be guarded by explicit admin authorization in the handler.')
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
assert.ok(adminScreens.includes("useCount('customers'"), 'The dashboard customer KPI must count actual customer records.')
assert.ok(adminScreens.includes("value: 'غير متحقق'"), 'The dashboard must not claim system health without checking services.')
assert.ok(adminScreens.includes('if (queryError)'), 'AI lists must surface database read errors instead of showing an empty state as success.')
assert.ok(adminScreens.includes('requestId.current !== requestNumber'), 'AI list pages must ignore stale responses across organization changes.')
assert.ok(!adminScreens.includes("value: 'سليم'"), 'The dashboard must not contain an unverified hard-coded healthy status.')
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

assert.ok(offlineWorker.includes("if (request.method !== 'GET') return"), 'Offline cache must never intercept non-GET requests.')
assert.ok(offlineWorker.includes('if (url.origin !== self.location.origin) return'), 'Offline cache must never intercept cross-origin API requests.')
assert.ok(offlineWorker.includes("if (request.mode === 'navigate')"), 'Offline shell must recover the SPA document for direct-route navigation.')
assert.ok(offlineWorker.includes("const hashedAsset = url.pathname.startsWith('/assets/')"), 'Offline static caching must be limited to built immutable assets.')
assert.ok(offlineWorker.includes("const shellStatic = url.pathname === '/logo.svg' || url.pathname === '/manifest.webmanifest'"), 'Offline static caching may include only public brand metadata outside hashed assets.')
assert.ok(mainEntry.includes("navigator.serviceWorker.register('/sw.js'"), 'Production must register the public app-shell service worker.')
assert.ok(htmlShell.includes('<link rel="manifest" href="/manifest.webmanifest" />'), 'Installable app manifest must be linked from the document.')
assert.ok(webManifest.includes('"lang": "ar"'), 'PWA manifest must preserve the Arabic locale.')
assert.doesNotThrow(() => JSON.parse(webManifest), 'PWA manifest must be valid JSON.')
assert.ok(offlineUi.includes('navigator.onLine'), 'Offline banner must report browser connectivity changes.')
assert.ok(offlineUi.includes('لن تُحفظ الطلبات أو المدفوعات أو تغييرات المخزون دون اتصال بالخادم'), 'Offline UX must explicitly deny fake transaction success.')
assert.ok(offlineBoundary.includes('لا يخزّن عامل الخدمة استجابات Supabase/API أو بيانات العملاء'), 'Offline policy must prohibit caching private business data.')
assert.ok(offlineBoundary.includes('لا توجد قائمة انتظار محلية للطلبات أو الدفع'), 'Offline policy must record that sensitive transaction queues are not implemented.')
assert.ok(appRoutes.includes('<ConnectivityStatus />'), 'Global offline status must be wired into the application tree.')
assert.ok(appRoutes.includes("const AIAssistant = lazy(() => import('@/pages/admin/AIAssistant'))"), 'AI assistant must be a first-party lazy-loaded page in the main application.')
assert.ok(appRoutes.includes('<Route path="ai/assistant" element={suspendPage(<AIAssistant />)} />'), 'AI assistant route must use its dedicated integrated lazy page.')
assert.ok(appRoutes.includes("const storefrontPages = () => import('@/pages/storefront/StorefrontPages')") && appRoutes.includes("const adminPages = () => import('@/pages/admin/AdminPages')"), 'Storefront and administration modules must remain route-lazy rather than eager imports.')
assert.ok(appRoutes.includes('function PageLoading()') && appRoutes.includes('role="status"') && appRoutes.includes('aria-live="polite"'), 'Lazy routes must retain an accessible loading fallback.')
assert.ok(!appRoutes.includes("from '@/pages/admin/AdminPages'") && !appRoutes.includes("from '@/pages/storefront/StorefrontPages'"), 'Major storefront and admin page modules must not be reintroduced as eager imports.')
assert.ok((appRoutes.match(/suspendPage\\(<[A-Z]/g) || []).length >= 75, 'Lazy loading boundaries must remain applied across the full route tree, not just the AI page.')
assert.ok(adminShell.includes("to: '/admin/ai/assistant', label: 'المساعد الذكي'"), 'AI assistant must be reachable from the shared administration navigation.')
for (const table of ['ai_reports', 'ai_alerts', 'ai_tasks']) {
  assert.ok(aiAssistant.includes(`from('${table}')`), `The integrated assistant must read its supported source table: ${table}`)
}
assert.ok(aiAssistant.includes(".eq('organization_id', organizationId)"), 'AI assistant queries must explicitly scope records to the active organization.')
assert.ok(aiAssistant.includes("from('audit_logs')"), 'Integrated AI assistant must read recent persisted operational activity.')
assert.ok(aiAssistant.includes("from('outbox_events')"), 'Integrated AI assistant must read transactional outbox events as operational activity.')
assert.ok(aiAssistant.includes("select('id,event_type,aggregate_type,status,created_at')"), 'Outbox event inspection must use a minimal projection without reading payload content.')
assert.ok(aiAssistant.includes(".eq('organization_id', organizationId)"), 'Outbox events must be explicitly scoped to the active organization.')
assert.ok(aiAssistant.includes("const combinedActivity = [...auditActivity, ...outboxActivity]"), 'Audit and outbox records must form one time-sorted operational activity stream.')
assert.ok(aiAssistant.includes('dead_letter') && aiAssistant.includes('failed'), 'Deterministic review rules must identify failed/dead-letter outbox states.')
assert.ok(aiAssistant.includes('${sourceLabel(row)}${activityStatusLabel(row)}'), 'Review results must show where each candidate came from and its saved status.')
assert.ok(aiAssistant.includes("label: 'الأحداث التشغيلية المسجلة'"), 'Unified audit/outbox activity must be labelled as operational events, not only audit rows.')
assert.ok(aiAssistant.includes('تعذر تحميل الأحداث التشغيلية'), 'Outbox read errors must be surfaced rather than represented as an empty timeline.')
assert.ok(commercialAuditMigration.includes("CREATE OR REPLACE FUNCTION public.audit_commercial_draft_creation()"), 'Commercial draft creation must use one shared audit trigger function.')
assert.ok(commercialAuditMigration.includes("SET search_path = ''") && commercialAuditMigration.includes('auth.uid()'), 'Commercial audit trigger must pin a safe search path and derive its actor from the authenticated context.')
assert.ok(commercialAuditMigration.includes('AFTER INSERT ON public.purchase_orders') && commercialAuditMigration.includes('AFTER INSERT ON public.inventory_transfers') && commercialAuditMigration.includes('AFTER INSERT ON public.stock_counts'), 'New purchase orders, inventory-transfer drafts and stock-count drafts must be recorded atomically.')
assert.ok(commercialAuditMigration.includes("'purchase_order_created'") && commercialAuditMigration.includes("'inventory_transfer_created'") && commercialAuditMigration.includes("'stock_count_created'"), 'Commercial creation audit events must have distinct semantic action names.')
assert.ok(commercialAuditMigration.includes('REVOKE ALL ON FUNCTION public.audit_commercial_draft_creation() FROM PUBLIC, anon, authenticated'), 'Commercial audit trigger helper must not be directly callable by browser roles.')
assert.ok(sqlMigrationWorkflow.includes("purchase order creation audit event missing") && sqlMigrationWorkflow.includes("inventory transfer creation audit event missing") && sqlMigrationWorkflow.includes("stock count creation audit event missing"), 'PostgreSQL integration smoke test must prove all three draft audit triggers write tenant-scoped records.')
assert.ok(sqlMigrationWorkflow.includes("organization_id = v_org AND entity_type = 'purchase_order'") && sqlMigrationWorkflow.includes("organization_id = v_org AND entity_type = 'inventory_transfer'") && sqlMigrationWorkflow.includes("organization_id = v_org AND entity_type = 'stock_count'"), 'Draft audit smoke tests must verify the target organization and entity IDs.')
assert.ok(!commercialAuditMigration.includes("v_row->>'notes'") && !commercialAuditMigration.includes("'payload'"), 'Commercial draft audit must not copy free-form notes or event payloads.')
assert.ok(aiAssistant.includes("select('id,action,entity_type,created_at')"), 'Operational activity must use a minimal audit projection instead of reading event payloads or unnecessary identifiers.')
assert.ok(aiAssistant.includes('reviewCandidates') && aiAssistant.includes('لا يثبت شمول الأحداث'), 'Activity review flags must be deterministic and explicitly disclose incomplete audit coverage.')
assert.ok(aiAssistant.indexOf("q.includes('تستحق')") < aiAssistant.indexOf("q.includes('حركة')"), 'Explicit risk/review questions must reach review-candidate rules before the generic activity summary handler.')
assert.ok(aiAssistant.includes('setMessages([welcomeMessage])'), 'The assistant must discard conversation context when the active organization changes.')
assert.ok(aiAssistant.includes('requestId.current !== requestNumber'), 'The assistant must ignore stale responses after organization or request changes.')
assert.ok(aiAssistant.includes('لا يوجد نموذج توليدي مفعّل لهذا المساعد'), 'The assistant must disclose that no generative provider is configured.')
assert.ok(aiIntegration.includes('ليست منتجًا مستقلًا أو تطبيقًا منفصلًا'), 'The integration decision must explicitly prohibit treating AI as a separate application.')
assert.ok(rootReadme.includes('PROJECT_MEMORY.md'), 'Root README must direct developers to persistent project memory.')
assert.ok(projectMemory.includes('AI belongs inside Aghbari'), 'Persistent memory must preserve the integrated local/private AI directive.')
assert.ok(canonicalSpec.includes('Unified Import Engine') || canonicalSpec.includes('Unified import engine') || canonicalSpec.includes('E1. Single official pipeline'), 'Canonical specification must preserve the single import-engine requirement.')
assert.ok(canonicalSpec.includes('REQ-IMP-001') && canonicalSpec.includes('REQ-AI-001') && canonicalSpec.includes('REQ-SEC-001'), 'Canonical specification must preserve the mandatory acceptance scenarios.')
assert.ok(sourceIndex.includes('الأغبري | Aghbari Commerce') && sourceIndex.includes('العامري') && sourceIndex.includes('بوابة العامري الذكية'), 'Source index must preserve the sole product identity and legacy-brand exclusion rule.')
assert.ok(executionState.includes('Exact next executable action'), 'Execution state must preserve a durable resume pointer.')
assert.ok(progressLedger.includes('Status vocabulary'), 'Progress ledger must preserve evidence-based status semantics.')
assert.ok(backupWorkflow.includes("cron: '17 2 * * *'"), 'Encrypted database backup must have a daily schedule.')
assert.ok(backupWorkflow.includes('secrets.SUPABASE_DB_URL') && backupWorkflow.includes('secrets.BACKUP_AGE_RECIPIENT'), 'Scheduled backup must require explicit database and public encryption-recipient secrets.')
assert.ok(backupWorkflow.includes('retention-days: 14'), 'Encrypted artifact retention must be explicit.')
assert.ok(backupWorkflow.includes('age public recipient') && backupWorkflow.includes('exit 1'), 'Backup workflow must fail closed with an explicit blocked result when prerequisites are absent.')
assert.ok(!backupWorkflow.includes('echo "- BLOCKED: configure repository secret `'), 'Backup diagnostic strings must never execute backtick command substitutions.')
assert.ok(backupWorkflow.includes("printf '%s\\n' '- BLOCKED: configure repository secret SUPABASE_DB_URL"), 'Missing database configuration must be reported safely without executing shell substitutions.')
assert.ok(backupWorkflow.includes("printf '%s\\n' '- BLOCKED: configure repository secret BACKUP_AGE_RECIPIENT"), 'Missing encryption configuration must be reported safely without executing shell substitutions.')
assert.ok(backupCreate.includes('pg_dump') && backupCreate.includes('--format=custom'), 'Backup tool must create a PostgreSQL logical archive, not a fake CSV backup.')
assert.ok(backupCreate.includes('age --encrypt') && backupCreate.includes('ciphertext_sha256'), 'Backup tool must encrypt the archive and create an integrity manifest.')
assert.ok(backupCreate.includes('SUPABASE_DB_URL') && !backupCreate.includes('echo "$SUPABASE_DB_URL"'), 'Database connection material must not be printed by the backup tool.')
assert.ok(backupVerify.includes('ciphertext_sha256') && backupVerify.includes('pg_restore --list'), 'Backup verification must check the hash and recognize the decrypted archive format.')
assert.ok(backupVerify.includes('json.load(handle)') && backupVerify.includes('hashlib.sha256()'), 'Backup verification must parse the manifest as JSON and validate the actual artifact digest.')
assert.ok(backupVerify.includes('ciphertext_bytes') && backupVerify.includes('artifact_file'), 'Backup verification must validate artifact size and manifest identity as well as its hash.')
assert.ok(backupRestore.includes('RESTORE_CONFIRM') && backupRestore.includes('I_HAVE_VERIFIED_THE_TARGET'), 'Restore must require explicit destination confirmation.')
assert.ok(backupRestore.includes('RESTORE_EXPECTED_HOST') && backupRestore.includes('actual_target_host'), 'Restore must match the URL against an independently specified expected hostname.')
assert.ok(backupRestore.includes('I_ACCEPT_PRODUCTION_DATA_OVERWRITE') && backupRestore.includes('--clean'), 'Production overwrite must need a separate explicit acknowledgment.')
assert.ok(backupRestore.includes('Production restore requires BACKUP_AGE_RECIPIENT'), 'Production restore must require an encryption recipient for its pre-restore snapshot.')
assert.ok(backupRestore.includes('RESTORE_PRE_RESTORE_BACKUP_DIR" != /*') && backupRestore.includes('canonical_repo_root'), 'Production restore backup storage must be an absolute directory outside the source repository.')
assert.ok(backupCreate.includes('canonical_output_dir') && backupCreate.includes('canonical_repo_root') && backupCreate.includes('group/world writable'), 'Backup output must reject repository paths and writable shared directories without changing existing directory permissions.')
assert.ok(backupRestore.includes('RESTORE_PRE_RESTORE_BACKUP_DIR') && backupRestore.includes('pre-restore backup directory must be empty'), 'Production restore must use a dedicated empty directory to avoid confusing current safety backups with stale artifacts.')
assert.ok(backupRestore.includes('bash "$script_dir/create-encrypted-backup.sh"'), 'Production restore must create a fresh backup of its target before overwrite.')
assert.ok(backupRestore.includes('verify-encrypted-backup.sh') && backupRestore.includes('Verified pre-restore snapshot retained at:'), 'Production restore must verify and retain the pre-restore snapshot before destructive work.')
assert.ok(backupRestore.includes('PGSSLMODE=require'), 'Restore must request TLS for PostgreSQL connections.')
assert.ok(backupGuide.includes('complete Supabase-project backup') && backupGuide.includes('isolated target first'), 'Backup documentation must disclose scope and require isolated restore before claiming recovery.');
assert.ok(backupCheckWorkflow.includes('bash -n') && backupCheckWorkflow.includes('shellcheck'), 'Backup shell tools must have a syntax/ShellCheck workflow gate.')

console.log(`Static contract checks passed: ${imageNames.length} indexed UI images, ${duplicateFiles} duplicate files, price-free customer projections, centralized policy controls, pricing/order/payment safeguards, and connected inventory/procurement/finance workflows.`)
console.log('These checks are static guardrails only; they do not replace SQL migration execution, RLS tests, or browser end-to-end verification.')
