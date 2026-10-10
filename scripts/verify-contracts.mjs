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
const [readme, index, pricingMigration, safeProductSelect, storefront, store, catalog, productDetail, policyCenter, policiesHook] =
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
required(pricingMigration, /AFTER INSERT OR UPDATE OR DELETE ON pricing_rules/, 'Price recalculation must respond to rule activation, update and deletion.')
required(pricingMigration, /LIMIT 1\s*\),\s*p\.base_price,\s*0\)/, 'Pricing must fall back to base price when no matching active rule exists.')
required(pricingMigration, /CREATE OR REPLACE FUNCTION public\.approve_order_quantities/, 'Atomic quantity approval RPC is missing.')
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
for (const view of [
  'customer_order_summaries',
  'customer_order_item_summaries',
  'customer_sales_invoice_summaries',
  'customer_payment_summaries',
  'customer_statement_summaries',
]) {
  required(pricingMigration, new RegExp('ALTER VIEW public\\\\.' + view + ' SET \\(security_invoker = true\\)'), view + ' must run with invoker security and base-table RLS.')
}
assert.equal((pricingMigration.match(/CREATE POLICY [^\n]*idempotency/gi) || []).length, 0, 'Idempotency keys must not be directly accessible through client table policies.')

console.log(`Static contract checks passed: ${imageNames.length} indexed UI images, ${duplicateFiles} duplicate files, price-free customer projections, centralized policy controls, pricing fallbacks, and order/payment invariants.`)
console.log('These checks are static guardrails only; they do not replace SQL migration execution, RLS tests, or browser end-to-end verification.')
