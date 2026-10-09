/*
# Commerce policy center, approved quantities, and deterministic retail/wholesale pricing

This migration is forward-only and preserves historical requested quantities and base prices.
All organization scope is verified on the server from the authenticated user's membership.
*/

-- NULL period bounds need a separate unique guard because ordinary UNIQUE constraints treat NULLs as distinct.
CREATE UNIQUE INDEX IF NOT EXISTS idx_import_uploads_hash_without_period
ON import_uploads (organization_id, profile_id, file_hash)
WHERE period_start IS NULL AND period_end IS NULL;

-- Align legacy category records with the current slug-based catalog UI.
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS icon text;
UPDATE public.categories
SET slug = COALESCE(
  NULLIF(trim(slug), ''),
  COALESCE(NULLIF(regexp_replace(lower(COALESCE(code, name, '')), '[^a-z0-9]+', '-', 'g'), ''), 'category')
    || '-' || substr(id::text, 1, 8)
)
WHERE slug IS NULL OR trim(slug) = '';
ALTER TABLE public.categories ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_organization_slug
  ON public.categories(organization_id, slug);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS approved_quantity numeric(15,3);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_items integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_amount numeric(15,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_adjustment_note text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Existing invoices remain sales invoices. New orders receive a pro-forma invoice only;
-- an official sales invoice is created/finalized only after an administrator confirms payment.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_kind text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS finalized_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS finalized_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_code text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_name_snapshot text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS main_description text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_address jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_amount numeric(15,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_items integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_adjustment_note text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE orders ALTER COLUMN customer_id DROP NOT NULL;
UPDATE orders SET total = COALESCE(total, total_amount, subtotal, 0),
                  total_amount = COALESCE(total_amount, total, subtotal, 0),
                  subtotal = COALESCE(subtotal, total, total_amount, 0);

UPDATE invoices SET invoice_kind = 'sales' WHERE invoice_kind IS NULL;
ALTER TABLE invoices ALTER COLUMN invoice_kind SET DEFAULT 'sales';
ALTER TABLE invoices ALTER COLUMN invoice_kind SET NOT NULL;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;

ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
CHECK (status IN ('draft','issued','partial','paid','overdue','cancelled'));

ALTER TABLE invoices ADD CONSTRAINT invoices_kind_check
CHECK (invoice_kind IN ('proforma','sales'));


CREATE TABLE IF NOT EXISTS commerce_policy_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  customer_prices_hidden boolean NOT NULL DEFAULT true,
  require_quantity_approval boolean NOT NULL DEFAULT true,
  payment_request_after_approval boolean NOT NULL DEFAULT true,
  quantity_input_tone text NOT NULL DEFAULT 'sky'
    CHECK (quantity_input_tone IN ('sky','mint','slate')),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE commerce_policy_settings DROP CONSTRAINT IF EXISTS commerce_policy_prices_hidden;
ALTER TABLE commerce_policy_settings
  ADD CONSTRAINT commerce_policy_prices_hidden CHECK (customer_prices_hidden = true);
ALTER TABLE commerce_policy_settings DROP CONSTRAINT IF EXISTS commerce_policy_mandatory_workflow;
ALTER TABLE commerce_policy_settings ADD CONSTRAINT commerce_policy_mandatory_workflow CHECK (
  customer_prices_hidden = true
  AND require_quantity_approval = true
  AND payment_request_after_approval = true
  AND offline_orders_disabled = true
  AND ai_external_data_requires_consent = true
  AND ai_rule_based_fallback = true
);


-- Policy registry values are scoped to the organization and constrained at the database boundary.
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS upload_chunk_size_mb integer NOT NULL DEFAULT 4;
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS processing_chunk_size integer NOT NULL DEFAULT 500;
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS max_file_size_mb integer NOT NULL DEFAULT 100;
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS max_import_rows integer NOT NULL DEFAULT 100000;
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS max_import_columns integer NOT NULL DEFAULT 100;
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS max_cell_length integer NOT NULL DEFAULT 4000;
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS max_archive_expansion_factor integer NOT NULL DEFAULT 10;
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS dqs_excellent_min integer NOT NULL DEFAULT 90;
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS dqs_acceptable_min integer NOT NULL DEFAULT 75;
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS dqs_warning_min integer NOT NULL DEFAULT 50;
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS import_retention_days integer NOT NULL DEFAULT 30;
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS idempotency_ttl_hours integer NOT NULL DEFAULT 24;
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS max_processing_timeout_seconds integer NOT NULL DEFAULT 300;
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS api_p95_target_ms integer NOT NULL DEFAULT 300;
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS search_p95_target_ms integer NOT NULL DEFAULT 150;
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS ai_daily_token_quota bigint NOT NULL DEFAULT 0;
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS ai_monthly_token_quota bigint NOT NULL DEFAULT 0;
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS ai_request_budget_usd numeric(10,4) NOT NULL DEFAULT 0;
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS ai_external_data_requires_consent boolean NOT NULL DEFAULT true;
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS ai_rule_based_fallback boolean NOT NULL DEFAULT true;
ALTER TABLE commerce_policy_settings ADD COLUMN IF NOT EXISTS offline_orders_disabled boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commerce_policy_limits_check') THEN
    ALTER TABLE commerce_policy_settings ADD CONSTRAINT commerce_policy_limits_check CHECK (
      upload_chunk_size_mb BETWEEN 2 AND 5
      AND processing_chunk_size BETWEEN 500 AND 2000
      AND max_file_size_mb BETWEEN 1 AND 100
      AND max_import_rows BETWEEN 1 AND 100000
      AND max_import_columns BETWEEN 1 AND 100
      AND max_cell_length BETWEEN 1 AND 4000
      AND max_archive_expansion_factor BETWEEN 1 AND 10
      AND dqs_excellent_min BETWEEN 50 AND 100
      AND dqs_acceptable_min BETWEEN 25 AND 99
      AND dqs_warning_min BETWEEN 0 AND 98
      AND dqs_excellent_min > dqs_acceptable_min
      AND dqs_acceptable_min > dqs_warning_min
      AND import_retention_days BETWEEN 1 AND 3650
      AND idempotency_ttl_hours BETWEEN 1 AND 168
      AND max_processing_timeout_seconds BETWEEN 10 AND 3600
      AND api_p95_target_ms BETWEEN 50 AND 10000
      AND search_p95_target_ms BETWEEN 25 AND 5000
      AND ai_daily_token_quota >= 0
      AND ai_monthly_token_quota >= 0
      AND ai_request_budget_usd >= 0
      AND offline_orders_disabled = true
    );
  END IF;
END;
$$;

ALTER TABLE commerce_policy_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS commerce_policy_settings_read_member ON commerce_policy_settings;
CREATE POLICY commerce_policy_settings_read_member
  ON commerce_policy_settings FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id));

DROP POLICY IF EXISTS commerce_policy_settings_insert_admin ON commerce_policy_settings;
CREATE POLICY commerce_policy_settings_insert_admin
  ON commerce_policy_settings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = commerce_policy_settings.organization_id
      AND om.user_id = auth.uid() AND om.status = 'active'
      AND om.role IN ('owner','admin')
  ));

DROP POLICY IF EXISTS commerce_policy_settings_update_admin ON commerce_policy_settings;
CREATE POLICY commerce_policy_settings_update_admin
  ON commerce_policy_settings FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = commerce_policy_settings.organization_id
      AND om.user_id = auth.uid() AND om.status = 'active'
      AND om.role IN ('owner','admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = commerce_policy_settings.organization_id
      AND om.user_id = auth.uid() AND om.status = 'active'
      AND om.role IN ('owner','admin')
  ));

DROP POLICY IF EXISTS commerce_policy_settings_delete_admin ON commerce_policy_settings;
CREATE POLICY commerce_policy_settings_delete_admin
  ON commerce_policy_settings FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = commerce_policy_settings.organization_id
      AND om.user_id = auth.uid() AND om.status = 'active'
      AND om.role IN ('owner','admin')
  ));

-- Legacy pricing_rules columns are retained, while this canonical contract is used by new UI/RPC code.
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS price_level text;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS calculation_method text;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS value numeric(14,4);
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS active boolean;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS min_quantity integer;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE pricing_rules ALTER COLUMN created_by SET DEFAULT auth.uid();

UPDATE pricing_rules
SET price_level = COALESCE(price_level, CASE WHEN scope_type = 'retail' THEN 'retail' WHEN scope_type = 'wholesale' THEN 'wholesale' ELSE 'both' END),
    calculation_method = COALESCE(calculation_method, CASE
      WHEN adjustment_type IN ('margin_percent','margin') THEN 'margin_percent'
      WHEN adjustment_type IN ('fixed_price','fixed') THEN 'fixed_price'
      WHEN adjustment_type IN ('amount_adjustment','amount','fixed_amount') THEN 'amount_adjustment'
      ELSE 'markup_percent' END),
    value = COALESCE(value, adjustment_value, 0),
    active = COALESCE(active, is_active, true),
    min_quantity = COALESCE(min_quantity, 1);

ALTER TABLE pricing_rules ALTER COLUMN price_level SET DEFAULT 'both';
ALTER TABLE pricing_rules ALTER COLUMN price_level SET NOT NULL;
ALTER TABLE pricing_rules ALTER COLUMN calculation_method SET DEFAULT 'markup_percent';
ALTER TABLE pricing_rules ALTER COLUMN calculation_method SET NOT NULL;
ALTER TABLE pricing_rules ALTER COLUMN value SET DEFAULT 0;
ALTER TABLE pricing_rules ALTER COLUMN value SET NOT NULL;
ALTER TABLE pricing_rules ALTER COLUMN active SET DEFAULT true;
ALTER TABLE pricing_rules ALTER COLUMN active SET NOT NULL;
ALTER TABLE pricing_rules ALTER COLUMN min_quantity SET DEFAULT 1;
ALTER TABLE pricing_rules ALTER COLUMN min_quantity SET NOT NULL;

-- Rule edits are administrative actions, not ordinary member actions.
DROP POLICY IF EXISTS pricing_rules_insert_org ON pricing_rules;
CREATE POLICY pricing_rules_insert_org ON pricing_rules FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM organization_members om WHERE om.organization_id = pricing_rules.organization_id
    AND om.user_id = auth.uid() AND om.status = 'active' AND om.role IN ('owner','admin')
));
DROP POLICY IF EXISTS pricing_rules_update_org ON pricing_rules;
CREATE POLICY pricing_rules_update_org ON pricing_rules FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM organization_members om WHERE om.organization_id = pricing_rules.organization_id
    AND om.user_id = auth.uid() AND om.status = 'active' AND om.role IN ('owner','admin')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM organization_members om WHERE om.organization_id = pricing_rules.organization_id
    AND om.user_id = auth.uid() AND om.status = 'active' AND om.role IN ('owner','admin')
));
DROP POLICY IF EXISTS pricing_rules_delete_org ON pricing_rules;
CREATE POLICY pricing_rules_delete_org ON pricing_rules FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM organization_members om WHERE om.organization_id = pricing_rules.organization_id
    AND om.user_id = auth.uid() AND om.status = 'active' AND om.role IN ('owner','admin')
));

CREATE OR REPLACE FUNCTION public.calculate_commerce_price(
  p_product_id uuid,
  p_quantity integer,
  p_price_level text
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_org_id uuid;
  v_base numeric(14,4);
  v_method text;
  v_value numeric(14,4);
  v_price numeric(14,4);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_price_level NOT IN ('retail','wholesale') THEN
    RAISE EXCEPTION 'invalid_price_request';
  END IF;

  SELECT p.organization_id, COALESCE(p.base_price, p.price, 0)
    INTO v_org_id, v_base
  FROM public.products p WHERE p.id = p_product_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'product_not_found'; END IF;
  IF NOT private.is_org_member(v_org_id) THEN RAISE EXCEPTION 'organization_forbidden'; END IF;

  SELECT r.calculation_method, r.value INTO v_method, v_value
  FROM public.pricing_rules r
  WHERE r.organization_id = v_org_id
    AND r.active = true
    AND COALESCE(r.min_quantity, 1) <= p_quantity
    AND r.price_level IN (p_price_level, 'both')
  ORDER BY CASE WHEN r.price_level = p_price_level THEN 0 ELSE 1 END,
           r.priority ASC, r.created_at DESC, r.id
  LIMIT 1;

  IF v_method IS NULL THEN RETURN GREATEST(v_base, 0); END IF;
  CASE v_method
    WHEN 'markup_percent' THEN v_price := v_base * (1 + (v_value / 100));
    WHEN 'margin_percent' THEN
      IF v_value < 0 OR v_value >= 100 THEN RAISE EXCEPTION 'invalid_margin_percent'; END IF;
      v_price := v_base / NULLIF(1 - (v_value / 100), 0);
    WHEN 'fixed_price' THEN v_price := v_value;
    WHEN 'amount_adjustment' THEN v_price := v_base + v_value;
    ELSE RAISE EXCEPTION 'unsupported_pricing_method';
  END CASE;
  RETURN ROUND(GREATEST(COALESCE(v_price, v_base), 0), 2);
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_commerce_price(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calculate_commerce_price(uuid, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.calculate_commerce_price(uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.recalculate_organization_product_prices(p_organization_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private
AS $$
  WITH computed AS (
    SELECT p.id,
      COALESCE((
        SELECT CASE r.calculation_method
          WHEN 'markup_percent' THEN p.base_price * (1 + (r.value / 100))
          WHEN 'margin_percent' THEN CASE WHEN r.value >= 100 THEN p.base_price ELSE p.base_price / NULLIF(1 - (r.value / 100), 0) END
          WHEN 'fixed_price' THEN r.value
          WHEN 'amount_adjustment' THEN p.base_price + r.value
          ELSE p.base_price
        END
        FROM pricing_rules r
        WHERE r.organization_id = p.organization_id AND r.active = true
          AND r.price_level IN ('retail','both')
          AND COALESCE(r.min_quantity, 1) <= 1
        ORDER BY CASE WHEN r.price_level = 'retail' THEN 0 ELSE 1 END, r.priority ASC, r.created_at DESC, r.id
        LIMIT 1
      ), p.base_price, 0)::numeric(12,2) AS retail_price,
      COALESCE((
        SELECT CASE r.calculation_method
          WHEN 'markup_percent' THEN p.base_price * (1 + (r.value / 100))
          WHEN 'margin_percent' THEN CASE WHEN r.value >= 100 THEN p.base_price ELSE p.base_price / NULLIF(1 - (r.value / 100), 0) END
          WHEN 'fixed_price' THEN r.value
          WHEN 'amount_adjustment' THEN p.base_price + r.value
          ELSE p.base_price
        END
        FROM pricing_rules r
        WHERE r.organization_id = p.organization_id AND r.active = true
          AND r.price_level IN ('wholesale','both')
          AND COALESCE(r.min_quantity, 1) <= 1
        ORDER BY CASE WHEN r.price_level = 'wholesale' THEN 0 ELSE 1 END, r.priority ASC, r.created_at DESC, r.id
        LIMIT 1
      ), p.base_price, 0)::numeric(12,2) AS wholesale_price
    FROM products p WHERE p.organization_id = p_organization_id
  )
  UPDATE products p
  SET retail_price = GREATEST(c.retail_price, 0),
      wholesale_price = GREATEST(c.wholesale_price, 0),
      price = GREATEST(c.retail_price, 0),
      bulk_price = GREATEST(c.wholesale_price, 0),
      updated_at = now()
  FROM computed c WHERE c.id = p.id;
$$;

CREATE OR REPLACE FUNCTION public.sync_organization_prices_after_rule_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_organization_product_prices(OLD.organization_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
      PERFORM public.recalculate_organization_product_prices(OLD.organization_id);
    END IF;
    PERFORM public.recalculate_organization_product_prices(NEW.organization_id);
    RETURN NEW;
  ELSE
    PERFORM public.recalculate_organization_product_prices(NEW.organization_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS sync_product_prices_after_rule_change ON pricing_rules;
CREATE TRIGGER sync_product_prices_after_rule_change
AFTER INSERT OR UPDATE OR DELETE ON pricing_rules
FOR EACH ROW EXECUTE FUNCTION public.sync_organization_prices_after_rule_change();

CREATE OR REPLACE FUNCTION public.sync_prices_after_product_base_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  -- The recalculation itself updates derived price columns. Ignore nested trigger calls
  -- to prevent recursive recalculation while retaining canonical base-price changes.
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  PERFORM public.recalculate_organization_product_prices(NEW.organization_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_product_prices_after_base_change ON products;
CREATE TRIGGER sync_product_prices_after_base_change
AFTER INSERT OR UPDATE OF base_price, price ON products
FOR EACH ROW EXECUTE FUNCTION public.sync_prices_after_product_base_change();

CREATE OR REPLACE FUNCTION public.keep_product_base_price_canonical()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  -- Product price recalculation runs from AFTER triggers. Do not mistake its derived-price writes for a base-price edit.
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.base_price := COALESCE(NULLIF(NEW.base_price, 0), NEW.price, 0);
    NEW.price := COALESCE(NEW.base_price, 0);
  ELSIF NEW.base_price IS DISTINCT FROM OLD.base_price THEN
    NEW.price := COALESCE(NEW.base_price, 0);
  ELSIF NEW.price IS DISTINCT FROM OLD.price THEN
    NEW.base_price := COALESCE(NEW.price, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS keep_product_base_price_canonical_before_write ON products;
CREATE TRIGGER keep_product_base_price_canonical_before_write
BEFORE INSERT OR UPDATE OF base_price, price ON products
FOR EACH ROW EXECUTE FUNCTION public.keep_product_base_price_canonical();


-- Historical rows with no active pricing rule always resolve to the immutable base_price.
DO $$
DECLARE org_row record;
BEGIN
  FOR org_row IN SELECT DISTINCT organization_id FROM products LOOP
    PERFORM public.recalculate_organization_product_prices(org_row.organization_id);
  END LOOP;
END $$;

-- Replace the original order RPC so all order prices use the single server-side pricing evaluator
-- and idempotency keys cannot be replayed with a different cart or request body.
CREATE OR REPLACE FUNCTION public.create_order_from_cart(
  p_shipping_address jsonb,
  p_billing_address jsonb,
  p_notes text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_active_membership_count integer := 0;
  v_customer_id uuid;
  v_customer_tier text := 'retail';
  v_price_level text := 'retail';
  v_order_id uuid;
  v_invoice_id uuid;
  v_existing uuid;
  v_existing_hash text;
  v_existing_status text;
  v_idempotency_id uuid;
  v_claimed boolean := false;
  v_cart_hash text;
  v_request_hash text;
  v_order_number text := 'ORD-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  v_invoice_number text := 'PRO-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  v_subtotal numeric(14,2) := 0;
  v_line_total numeric(14,2);
  v_unit_price numeric(12,2);
  v_multiplier integer;
  item record;
BEGIN
  IF v_user_id IS NULL OR p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;

  SELECT count(*) INTO v_active_membership_count
  FROM public.organization_members
  WHERE user_id = v_user_id AND status = 'active';

  IF v_active_membership_count = 0 THEN
    RAISE EXCEPTION 'organization_required';
  ELSIF v_active_membership_count > 1 THEN
    -- Never pick an arbitrary tenant when an identity belongs to multiple organizations.
    -- A trusted server-side active-organization context must be wired before multi-tenant ordering is enabled.
    RAISE EXCEPTION 'organization_context_required';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.organization_members
  WHERE user_id = v_user_id AND status = 'active'
  LIMIT 1;

  -- Derive the customer class from the authenticated user's linked customer record.
  -- No price level or organization identifier is trusted from the browser.
  SELECT c.id, c.tier
    INTO v_customer_id, v_customer_tier
  FROM public.customers c
  JOIN public.profiles pr ON pr.id = c.profile_id
  WHERE c.organization_id = v_org_id
    AND pr.auth_user_id = v_user_id
    AND c.status = 'approved'
  ORDER BY c.created_at DESC
  LIMIT 1;

  v_price_level := CASE
    WHEN v_customer_tier = 'wholesale' THEN 'wholesale'
    ELSE 'retail'
  END;

  SELECT md5(COALESCE(string_agg(
    ci.product_id::text || ':' || ci.quantity::text || ':' || COALESCE(ci.unit_type, 'piece'),
    '|' ORDER BY ci.product_id::text, ci.unit_type, ci.id
  ), 'empty-cart'))
  INTO v_cart_hash
  FROM cart_items ci WHERE ci.user_id = v_user_id;

  v_request_hash := md5(
    COALESCE(p_shipping_address::text, '') || '|' ||
    COALESCE(p_billing_address::text, '') || '|' ||
    COALESCE(p_notes, '') || '|' || COALESCE(v_cart_hash, 'empty-cart')
  );

  INSERT INTO idempotency_keys (organization_id, idempotency_key, request_hash, operation_type, status, created_at, expires_at)
  VALUES (v_org_id, p_idempotency_key, v_request_hash, 'create_order', 'processing', now(), now() + make_interval(hours => COALESCE((SELECT cps.idempotency_ttl_hours FROM public.commerce_policy_settings cps WHERE cps.organization_id = v_org_id), 24)))
  ON CONFLICT (organization_id, idempotency_key, operation_type) DO UPDATE
    SET request_hash = EXCLUDED.request_hash,
        response_reference = NULL,
        status = 'processing',
        created_at = now(),
        expires_at = now() + make_interval(hours => COALESCE((SELECT cps.idempotency_ttl_hours FROM public.commerce_policy_settings cps WHERE cps.organization_id = v_org_id), 24))
    WHERE idempotency_keys.expires_at <= now()
       OR (idempotency_keys.status = 'failed' AND idempotency_keys.request_hash = EXCLUDED.request_hash)
  RETURNING id INTO v_idempotency_id;

  IF FOUND THEN
    v_claimed := true;
  ELSE
    SELECT response_reference, request_hash, status
      INTO v_existing, v_existing_hash, v_existing_status
    FROM idempotency_keys
    WHERE organization_id = v_org_id
      AND idempotency_key = p_idempotency_key
      AND operation_type = 'create_order';

    IF v_existing_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused_with_different_request';
    END IF;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
    IF v_existing_status = 'processing' THEN RAISE EXCEPTION 'idempotent_request_in_progress'; END IF;
    RAISE EXCEPTION 'idempotent_request_not_reusable';
  END IF;

  INSERT INTO orders (order_number, organization_id, user_id, customer_id, status, shipping_address, billing_address, notes, idempotency_key)
  VALUES (v_order_number, v_org_id, v_user_id, v_customer_id, 'pending', p_shipping_address, p_billing_address, p_notes, p_idempotency_key)
  RETURNING id INTO v_order_id;

  FOR item IN
    SELECT ci.*, p.organization_id AS product_organization_id,
           p.sku, p.item_code, p.name, p.name_ar, p.unit, p.base_price,
           p.price, p.bulk_price, p.retail_price, p.wholesale_price, p.stock_quantity,
           p.min_order_qty, p.box_quantity, p.carton_quantity
    FROM cart_items ci JOIN products p ON p.id = ci.product_id
    WHERE ci.user_id = v_user_id
    FOR UPDATE OF p
  LOOP
    IF item.product_organization_id IS DISTINCT FROM v_org_id THEN
      RAISE EXCEPTION 'cross_organization_cart_product';
    END IF;
    IF item.quantity < item.min_order_qty THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;
    v_multiplier := CASE item.unit_type
      WHEN 'carton' THEN greatest(item.carton_quantity, 1)
      WHEN 'box' THEN greatest(item.box_quantity, 1)
      ELSE 1
    END;
    IF item.quantity * v_multiplier > item.stock_quantity THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;
    v_unit_price := public.calculate_commerce_price(
      item.product_id,
      item.quantity * v_multiplier,
      v_price_level
    );
    v_line_total := v_unit_price * item.quantity * v_multiplier;
    v_subtotal := v_subtotal + v_line_total;
    INSERT INTO order_items (
      order_id, product_id, sku, item_code, name, product_name_snapshot,
      unit_type, unit_snapshot, quantity, unit_multiplier_snapshot, unit_price, unit_price_snapshot,
      discount, discount_snapshot, tax_snapshot, line_total
    ) VALUES (
      v_order_id, item.product_id, item.sku, COALESCE(item.item_code, item.sku),
      COALESCE(item.name_ar, item.name), COALESCE(item.name_ar, item.name),
      item.unit_type, item.unit, item.quantity, v_multiplier, v_unit_price, v_unit_price,
      0, 0, 0, v_line_total
    );
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = v_order_id) THEN RAISE EXCEPTION 'empty_cart'; END IF;
  UPDATE orders
  SET subtotal = v_subtotal, total = v_subtotal, total_amount = v_subtotal,
      total_items = (SELECT COUNT(*) FROM order_items WHERE order_id = v_order_id),
      updated_at = now()
  WHERE id = v_order_id;

  INSERT INTO invoices (invoice_number, order_id, organization_id, subtotal, total, status, invoice_kind, customer_name_snapshot, main_description)
  SELECT v_invoice_number, v_order_id, v_org_id, v_subtotal, v_subtotal, 'draft', 'proforma', o.name, 'طلب شراء من منصة الأغبري'
  FROM organizations o WHERE o.id = v_org_id;
  SELECT id INTO v_invoice_id FROM invoices WHERE order_id = v_order_id;

  INSERT INTO outbox_events (organization_id, event_key, event_type, aggregate_type, aggregate_id, payload)
  VALUES (v_org_id, 'order-created:' || v_order_id::text, 'order.created', 'order', v_order_id,
          jsonb_build_object('order_id', v_order_id, 'invoice_id', v_invoice_id));

  UPDATE idempotency_keys
  SET response_reference = v_order_id, status = 'completed'
  WHERE id = v_idempotency_id;

  DELETE FROM cart_items WHERE user_id = v_user_id;
  RETURN v_order_id;
EXCEPTION WHEN OTHERS THEN
  IF v_claimed AND v_idempotency_id IS NOT NULL THEN
    UPDATE idempotency_keys SET status = 'failed'
    WHERE id = v_idempotency_id AND response_reference IS NULL;
  END IF;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_from_cart(jsonb, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order_from_cart(jsonb, jsonb, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_order_from_cart(jsonb, jsonb, text, text) TO authenticated;


-- Unify the legacy (from_status/to_status) and modern (status) audit schemas without
-- depending on whether the legacy profile id happens to equal auth.uid().
ALTER TABLE public.order_status_history ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.order_status_history ADD COLUMN IF NOT EXISTS from_status text;
ALTER TABLE public.order_status_history ADD COLUMN IF NOT EXISTS to_status text;
ALTER TABLE public.order_status_history ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
UPDATE public.order_status_history
SET status = COALESCE(status, to_status, from_status, 'legacy'),
    to_status = COALESCE(to_status, status, from_status, 'legacy');
ALTER TABLE public.order_status_history ALTER COLUMN to_status DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_order_status_history_aliases()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  NEW.status := COALESCE(NEW.status, NEW.to_status, NEW.from_status, 'unknown');
  NEW.to_status := COALESCE(NEW.to_status, NEW.status);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sync_order_status_history_aliases_before_write ON public.order_status_history;
CREATE TRIGGER sync_order_status_history_aliases_before_write
BEFORE INSERT OR UPDATE ON public.order_status_history
FOR EACH ROW EXECUTE FUNCTION public.sync_order_status_history_aliases();

CREATE OR REPLACE FUNCTION public.approve_order_quantities(
  p_order_id uuid,
  p_quantities jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_order_status text;
  v_entry record;
  v_item_id uuid;
  v_quantity numeric(15,3);
  v_requested numeric(15,3);
  v_total numeric(14,2);
  v_item_count integer;
  v_changed boolean := false;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF p_quantities IS NULL OR jsonb_typeof(p_quantities) <> 'object' OR p_quantities = '{}'::jsonb THEN
    RAISE EXCEPTION 'approved_quantities_required';
  END IF;

  SELECT o.organization_id, o.status INTO v_organization_id, v_order_status
  FROM orders o WHERE o.id = p_order_id FOR UPDATE;
  IF v_organization_id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order_status NOT IN ('pending','review') THEN RAISE EXCEPTION 'order_not_open_for_quantity_approval'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = v_organization_id AND om.user_id = v_user_id
      AND om.status = 'active' AND om.role IN ('owner','admin')
  ) THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.invoices inv
    WHERE inv.order_id = p_order_id AND inv.invoice_kind = 'sales'
  ) THEN RAISE EXCEPTION 'sales_invoice_already_finalized'; END IF;
  IF (SELECT count(*) FROM public.order_items oi WHERE oi.order_id = p_order_id) <> jsonb_object_length(p_quantities) THEN
    RAISE EXCEPTION 'all_order_items_required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = p_order_id) THEN
    RAISE EXCEPTION 'order_items_required';
  END IF;

  FOR v_entry IN SELECT key, value #>> '{}' AS quantity_text FROM jsonb_each(p_quantities)
  LOOP
    BEGIN
      v_item_id := v_entry.key::uuid;
      v_quantity := v_entry.quantity_text::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'invalid_approved_quantity';
    END;
    IF v_quantity < 0 OR v_quantity <> trunc(v_quantity) THEN
      RAISE EXCEPTION 'invalid_approved_quantity';
    END IF;

    SELECT oi.quantity INTO v_requested
    FROM order_items oi WHERE oi.id = v_item_id AND oi.order_id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'order_item_not_found'; END IF;
    IF v_quantity > v_requested THEN RAISE EXCEPTION 'approved_quantity_exceeds_requested'; END IF;
    IF v_quantity IS DISTINCT FROM (SELECT COALESCE(oi.approved_quantity, oi.quantity) FROM order_items oi WHERE oi.id = v_item_id) THEN
      v_changed := true;
    END IF;
    UPDATE order_items
    SET approved_quantity = v_quantity
    WHERE id = v_item_id AND order_id = p_order_id;
  END LOOP;

  UPDATE order_items oi
  SET line_total = ROUND(
    COALESCE(oi.approved_quantity, oi.quantity) * COALESCE(oi.unit_multiplier_snapshot, 1) * COALESCE(oi.unit_price_snapshot, oi.unit_price, 0)
    - COALESCE(oi.discount_snapshot, oi.discount, 0)
    + COALESCE(oi.tax_snapshot, 0), 2)
  WHERE oi.order_id = p_order_id;

  SELECT COALESCE(SUM(oi.line_total), 0), COUNT(*) INTO v_total, v_item_count
  FROM order_items oi WHERE oi.order_id = p_order_id;

  UPDATE orders
  SET subtotal = v_total, total = v_total, total_amount = v_total, total_items = v_item_count,
      customer_adjustment_note = CASE
        WHEN EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = p_order_id AND oi.approved_quantity IS NOT NULL AND oi.approved_quantity IS DISTINCT FROM oi.quantity)
          THEN 'تنبيه: تم تعديل الأصناف/الكميات بحسب الكميات المتوفرة.'
        ELSE NULL END,
      updated_at = now()
  WHERE id = p_order_id;

  UPDATE invoices SET subtotal = v_total, total = v_total
  WHERE order_id = p_order_id;

  INSERT INTO outbox_events (organization_id, event_key, event_type, aggregate_type, aggregate_id, payload, status, available_at)
  VALUES (v_organization_id, 'order-quantities-approved:' || p_order_id::text || ':' || gen_random_uuid()::text,
          'order.quantities_approved', 'order', p_order_id,
          jsonb_build_object('order_id', p_order_id, 'changed', v_changed, 'updated_by', v_user_id), 'pending', now());

  RETURN jsonb_build_object('order_id', p_order_id, 'total', v_total, 'item_count', v_item_count, 'changed', v_changed);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_order_quantities(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_order_quantities(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_order_quantities(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.recalculate_organization_product_prices(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalculate_organization_product_prices(uuid) FROM anon;



-- Only administrators may directly update an order. Customers submit orders/payment requests via RPC.
DO $$
DECLARE policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders' AND cmd IN ('UPDATE','ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.orders', policy_row.policyname);
  END LOOP;
END;
$$;

CREATE POLICY orders_update_admin_only ON public.orders
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = orders.organization_id
    AND om.user_id = auth.uid() AND om.status = 'active'
    AND om.role IN ('owner','admin')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = orders.organization_id
    AND om.user_id = auth.uid() AND om.status = 'active'
    AND om.role IN ('owner','admin')
));

CREATE OR REPLACE FUNCTION public.admin_update_order_status(
  p_order_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_old_status text;
  v_order_number text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF p_status NOT IN ('review','approved','processing','fulfilled','dispatched','delivered','cancelled','rejected') THEN
    RAISE EXCEPTION 'invalid_order_status';
  END IF;

  SELECT organization_id, status, order_number
    INTO v_org_id, v_old_status, v_order_number
  FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_org_id AND om.user_id = v_user_id
      AND om.status = 'active' AND om.role IN ('owner','admin')
  ) THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF v_old_status IN ('cancelled','rejected','delivered') AND p_status <> v_old_status THEN
    RAISE EXCEPTION 'terminal_order_status';
  END IF;
  IF p_status IN ('processing','fulfilled','dispatched','delivered') AND NOT EXISTS (
    SELECT 1 FROM public.invoices inv
    WHERE inv.order_id = p_order_id AND inv.invoice_kind = 'sales'
      AND inv.status IN ('paid','partial')
  ) THEN
    RAISE EXCEPTION 'payment_confirmation_required';
  END IF;
  IF p_status = 'approved' AND EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.approved_quantity IS NULL
  ) THEN
    RAISE EXCEPTION 'quantity_approval_required';
  END IF;
  IF v_old_status = p_status THEN RETURN jsonb_build_object('order_id',p_order_id,'status',p_status,'changed',false); END IF;

  UPDATE public.orders SET status = p_status, updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, status, from_status, to_status, actor_user_id, notes)
  VALUES (p_order_id, p_status, v_old_status, p_status, v_user_id, 'تحديث خادمي للحالة: ' || v_old_status || ' → ' || p_status);

  INSERT INTO public.outbox_events (organization_id, event_key, event_type, aggregate_type, aggregate_id, payload, status, available_at)
  VALUES (v_org_id, 'order-status:' || p_order_id::text || ':' || p_status || ':' || gen_random_uuid()::text,
          'order.status_changed', 'order', p_order_id,
          jsonb_build_object('order_id', p_order_id, 'order_number', v_order_number, 'from', v_old_status, 'to', p_status, 'actor_id', v_user_id),
          'pending', now());

  RETURN jsonb_build_object('order_id',p_order_id,'status',p_status,'changed',true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_order_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_order_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_order_adjustment_note(
  p_order_id uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF length(COALESCE(p_note,'')) > 2000 THEN RAISE EXCEPTION 'adjustment_note_too_long'; END IF;
  SELECT organization_id INTO v_org_id FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id=v_org_id AND om.user_id=v_user_id
      AND om.status='active' AND om.role IN ('owner','admin')
  ) THEN RAISE EXCEPTION 'admin_required'; END IF;

  UPDATE public.orders SET customer_adjustment_note = NULLIF(trim(COALESCE(p_note,'')), ''), updated_at=now()
  WHERE id=p_order_id;

  INSERT INTO public.outbox_events (organization_id, event_key, event_type, aggregate_type, aggregate_id, payload, status, available_at)
  VALUES (v_org_id, 'order-adjustment-note:' || p_order_id::text || ':' || gen_random_uuid()::text,
          'order.adjustment_note_changed', 'order', p_order_id,
          jsonb_build_object('order_id',p_order_id,'updated_by',v_user_id),
          'pending', now());
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_order_adjustment_note(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_order_adjustment_note(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_order_adjustment_note(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_order_payment(
  p_order_id uuid,
  p_amount numeric,
  p_method text DEFAULT 'transfer',
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_owner_id uuid;
  v_order_status text;
  v_invoice_id uuid;
  v_invoice_kind text;
  v_payment_id uuid;
  v_payment_number text := 'PAY-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000000000 THEN RAISE EXCEPTION 'invalid_payment_amount'; END IF;
  IF p_method NOT IN ('transfer','cash','check','card','wallet') THEN RAISE EXCEPTION 'invalid_payment_method'; END IF;
  IF length(COALESCE(p_reference,'')) > 300 OR length(COALESCE(p_notes,'')) > 2000 THEN
    RAISE EXCEPTION 'payment_metadata_too_long';
  END IF;

  SELECT organization_id, user_id, status
    INTO v_org_id, v_owner_id, v_order_status
  FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_owner_id IS DISTINCT FROM v_user_id THEN RAISE EXCEPTION 'order_not_owned'; END IF;
  IF v_order_status <> 'approved' THEN RAISE EXCEPTION 'order_not_approved_for_payment'; END IF;

  SELECT id, invoice_kind INTO v_invoice_id, v_invoice_kind
  FROM public.invoices
  WHERE order_id=p_order_id AND organization_id=v_org_id
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF v_invoice_id IS NULL OR v_invoice_kind <> 'proforma' THEN RAISE EXCEPTION 'proforma_invoice_not_available'; END IF;

  INSERT INTO public.payments (payment_number, invoice_id, organization_id, amount, method, status, reference, notes)
  VALUES (v_payment_number, v_invoice_id, v_org_id, p_amount, p_method, 'pending',
          NULLIF(trim(COALESCE(p_reference,'')),''), NULLIF(trim(COALESCE(p_notes,'')),''))
  RETURNING id INTO v_payment_id;

  INSERT INTO public.outbox_events (organization_id,event_key,event_type,aggregate_type,aggregate_id,payload,status,available_at)
  VALUES (v_org_id, 'payment-submitted:' || v_payment_id::text, 'payment.submitted', 'payment', v_payment_id,
          jsonb_build_object('payment_id',v_payment_id,'order_id',p_order_id,'submitted_by',v_user_id),
          'pending',now());

  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_order_payment(uuid, numeric, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_order_payment(uuid, numeric, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_order_payment(uuid, numeric, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_order_payment(
  p_payment_id uuid,
  p_confirm boolean DEFAULT true,
  p_admin_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_payment_status text;
  v_payment_amount numeric(14,2);
  v_invoice_id uuid;
  v_invoice_kind text;
  v_invoice_status text;
  v_invoice_total numeric(14,2);
  v_invoice_paid numeric(14,2);
  v_order_id uuid;
  v_order_status text;
  v_paid_total numeric(14,2);
  v_invoice_number text;
  v_new_status text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF length(COALESCE(p_admin_notes,'')) > 2000 THEN RAISE EXCEPTION 'payment_metadata_too_long'; END IF;

  SELECT pay.organization_id, pay.status, pay.amount, pay.invoice_id, inv.invoice_kind, inv.status,
         inv.total, inv.paid_amount, o.id, o.status
  INTO v_org_id, v_payment_status, v_payment_amount, v_invoice_id, v_invoice_kind, v_invoice_status,
       v_invoice_total, v_invoice_paid, v_order_id, v_order_status
  FROM public.payments pay
  JOIN public.invoices inv ON inv.id=pay.invoice_id
  JOIN public.orders o ON o.id=inv.order_id
  WHERE pay.id=p_payment_id
  FOR UPDATE OF pay, inv, o;

  IF v_invoice_id IS NULL THEN RAISE EXCEPTION 'payment_not_found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id=v_org_id AND om.user_id=v_user_id
      AND om.status='active' AND om.role IN ('owner','admin')
  ) THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF v_payment_status <> 'pending' THEN RAISE EXCEPTION 'payment_already_reviewed'; END IF;

  IF NOT p_confirm THEN
    UPDATE public.payments SET status='rejected', notes=COALESCE(NULLIF(trim(COALESCE(p_admin_notes,'')),''),notes)
    WHERE id=p_payment_id;
    INSERT INTO public.outbox_events (organization_id,event_key,event_type,aggregate_type,aggregate_id,payload,status,available_at)
    VALUES (v_org_id,'payment-rejected:' || p_payment_id::text,'payment.rejected','payment',p_payment_id,
            jsonb_build_object('payment_id',p_payment_id,'order_id',v_order_id,'reviewed_by',v_user_id),
            'pending',now());
    RETURN jsonb_build_object('payment_id',p_payment_id,'status','rejected','invoice_kind',v_invoice_kind);
  END IF;

  IF v_invoice_kind <> 'proforma' OR v_invoice_status <> 'draft' THEN
    RAISE EXCEPTION 'proforma_invoice_not_available';
  END IF;
  IF v_order_status <> 'approved' THEN RAISE EXCEPTION 'order_not_approved_for_payment'; END IF;

  UPDATE public.payments
  SET status='confirmed', paid_date=CURRENT_DATE,
      notes=COALESCE(NULLIF(trim(COALESCE(p_admin_notes,'')),''),notes)
  WHERE id=p_payment_id;

  SELECT COALESCE(SUM(amount),0) INTO v_paid_total
  FROM public.payments WHERE invoice_id=v_invoice_id AND status='confirmed';
  IF v_paid_total > v_invoice_total + 0.009 THEN RAISE EXCEPTION 'payment_exceeds_invoice_total'; END IF;

  IF v_paid_total + 0.009 >= v_invoice_total THEN
    v_invoice_number := 'INV-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    UPDATE public.invoices
    SET invoice_kind='sales', invoice_number=v_invoice_number, status='paid',
        paid_amount=v_paid_total, issue_date=CURRENT_DATE,
        finalized_at=now(), finalized_by=v_user_id
    WHERE id=v_invoice_id;
    UPDATE public.orders
    SET payment_status='paid', status='processing', updated_at=now()
    WHERE id=v_order_id;
    INSERT INTO public.order_status_history (order_id,status,from_status,to_status,actor_user_id,notes)
    VALUES (v_order_id,'processing',v_order_status,'processing',v_user_id,'تم إصدار فاتورة البيع بعد تأكيد سداد المبلغ.');
    v_new_status := 'sales_invoice_issued';
  ELSE
    UPDATE public.invoices SET paid_amount=v_paid_total WHERE id=v_invoice_id;
    UPDATE public.orders SET payment_status='partial', updated_at=now() WHERE id=v_order_id;
    v_new_status := 'partial_payment_confirmed';
  END IF;

  INSERT INTO public.outbox_events (organization_id,event_key,event_type,aggregate_type,aggregate_id,payload,status,available_at)
  VALUES (v_org_id,'payment-confirmed:' || p_payment_id::text,'payment.confirmed','payment',p_payment_id,
          jsonb_build_object('payment_id',p_payment_id,'order_id',v_order_id,'invoice_id',v_invoice_id,
                             'confirmed_total',v_paid_total,'invoice_status',v_new_status,'reviewed_by',v_user_id),
          'pending',now());

  RETURN jsonb_build_object('payment_id',p_payment_id,'status','confirmed','confirmed_total',v_paid_total,
                            'invoice_kind',CASE WHEN v_new_status='sales_invoice_issued' THEN 'sales' ELSE 'proforma' END,
                            'result',v_new_status);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_order_payment(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_order_payment(uuid, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_order_payment(uuid, boolean, text) TO authenticated;


-- Customer-safe views omit every numeric money field. Base table reads remain for trusted staff;
-- customer app endpoints should read these projections instead of selecting raw financial rows.
DO $$
DECLARE policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders' AND cmd IN ('SELECT','INSERT','UPDATE','DELETE','ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.orders', policy_row.policyname);
  END LOOP;
END;
$$;

CREATE POLICY orders_read_staff_only ON public.orders
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = orders.organization_id AND om.user_id = auth.uid()
    AND om.status = 'active'
    AND om.role IN ('owner','admin','manager','warehouse','accountant','sales','developer','system_admin','customer_manager')
));

CREATE POLICY orders_update_admin_only ON public.orders
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = orders.organization_id AND om.user_id = auth.uid()
    AND om.status = 'active' AND om.role IN ('owner','admin','system_admin')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = orders.organization_id AND om.user_id = auth.uid()
    AND om.status = 'active' AND om.role IN ('owner','admin','system_admin')
));

-- The existing UPDATE/INSERT/DELETE policies on sensitive child tables are also narrowed.
DO $$
DECLARE policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('order_items','invoices','payments')
      AND cmd IN ('SELECT','INSERT','UPDATE','DELETE','ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_row.policyname, policy_row.tablename);
  END LOOP;
END;
$$;

CREATE POLICY order_items_read_staff_only ON public.order_items
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  JOIN public.organization_members om ON om.organization_id = o.organization_id
  WHERE o.id = order_items.order_id AND om.user_id = auth.uid()
    AND om.status = 'active'
    AND om.role IN ('owner','admin','manager','warehouse','accountant','sales','developer','system_admin','customer_manager')
));

CREATE POLICY invoices_read_staff_only ON public.invoices
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = invoices.organization_id AND om.user_id = auth.uid()
    AND om.status = 'active'
    AND om.role IN ('owner','admin','manager','warehouse','accountant','sales','developer','system_admin','customer_manager')
));

CREATE POLICY payments_read_staff_only ON public.payments
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = payments.organization_id AND om.user_id = auth.uid()
    AND om.status = 'active'
    AND om.role IN ('owner','admin','manager','warehouse','accountant','sales','developer','system_admin','customer_manager')
));

CREATE OR REPLACE VIEW public.customer_order_summaries AS
SELECT o.id, o.organization_id, o.user_id, o.order_number, o.status,
       o.payment_status, o.total_items, o.notes, o.customer_adjustment_note,
       o.created_at, o.updated_at
FROM public.orders o
WHERE EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = o.organization_id AND om.user_id = auth.uid() AND om.status = 'active'
)
AND (
  o.user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.organization_members staff
    WHERE staff.organization_id = o.organization_id AND staff.user_id = auth.uid()
      AND staff.status = 'active' AND staff.role IN ('owner','admin')
  )
);

CREATE OR REPLACE VIEW public.customer_order_item_summaries AS
SELECT oi.id, oi.order_id, o.organization_id, oi.product_id,
       COALESCE(oi.product_name_snapshot, oi.name) AS product_name,
       COALESCE(oi.item_code, oi.sku) AS item_code,
       oi.unit_snapshot, oi.quantity, oi.approved_quantity
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
WHERE EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = o.organization_id AND om.user_id = auth.uid() AND om.status = 'active'
)
AND (
  o.user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.organization_members staff
    WHERE staff.organization_id = o.organization_id AND staff.user_id = auth.uid()
      AND staff.status = 'active' AND staff.role IN ('owner','admin')
  )
);

CREATE OR REPLACE VIEW public.customer_sales_invoice_summaries AS
SELECT i.id, i.order_id, i.organization_id, i.invoice_number, i.status,
       i.issue_date, i.due_date, i.created_at
FROM public.invoices i
JOIN public.orders o ON o.id = i.order_id
WHERE i.invoice_kind = 'sales'
  AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = i.organization_id AND om.user_id = auth.uid() AND om.status = 'active'
  )
  AND (
    o.user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_members staff
      WHERE staff.organization_id = o.organization_id AND staff.user_id = auth.uid()
        AND staff.status = 'active' AND staff.role IN ('owner','admin')
    )
  );

CREATE OR REPLACE VIEW public.customer_payment_summaries AS
SELECT p.id, p.invoice_id, p.organization_id, p.payment_number, p.method, p.status, p.created_at, p.reference
FROM public.payments p
JOIN public.invoices i ON i.id = p.invoice_id
JOIN public.orders o ON o.id = i.order_id
WHERE EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = p.organization_id AND om.user_id = auth.uid() AND om.status = 'active'
)
AND (
  o.user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.organization_members staff
    WHERE staff.organization_id = o.organization_id AND staff.user_id = auth.uid()
      AND staff.status = 'active' AND staff.role IN ('owner','admin')
  )
);

CREATE OR REPLACE VIEW public.customer_statement_summaries AS
SELECT s.id, s.organization_id, s.statement_number, s.period_start, s.period_end, s.status, s.created_at
FROM public.statements s
WHERE EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = s.organization_id AND om.user_id = auth.uid() AND om.status = 'active'
);

GRANT SELECT ON public.customer_order_summaries TO authenticated;
GRANT SELECT ON public.customer_order_item_summaries TO authenticated;
GRANT SELECT ON public.customer_sales_invoice_summaries TO authenticated;
GRANT SELECT ON public.customer_payment_summaries TO authenticated;
GRANT SELECT ON public.customer_statement_summaries TO authenticated;

-- Customer-facing views must obey the invoking user's privileges and RLS.
-- The app must not depend on the default SECURITY DEFINER behavior of public views.
ALTER VIEW public.customer_order_summaries SET (security_invoker = true);
ALTER VIEW public.customer_order_item_summaries SET (security_invoker = true);
ALTER VIEW public.customer_sales_invoice_summaries SET (security_invoker = true);
ALTER VIEW public.customer_payment_summaries SET (security_invoker = true);
ALTER VIEW public.customer_statement_summaries SET (security_invoker = true);

-- Customers may read only their own orders and dependent lines/documents.
-- Staff policies above remain separate; policies are permissive-OR, so this adds a narrowly scoped owner path.
DROP POLICY IF EXISTS orders_customer_read_own ON public.orders;
CREATE POLICY orders_customer_read_own ON public.orders
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS order_items_customer_read_own ON public.order_items;
CREATE POLICY order_items_customer_read_own ON public.order_items
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_items.order_id AND o.user_id = (SELECT auth.uid())
));

DROP POLICY IF EXISTS invoices_customer_read_own ON public.invoices;
CREATE POLICY invoices_customer_read_own ON public.invoices
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = invoices.order_id AND o.user_id = (SELECT auth.uid())
));

DROP POLICY IF EXISTS payments_customer_read_own ON public.payments;
CREATE POLICY payments_customer_read_own ON public.payments
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.invoices i
  JOIN public.orders o ON o.id = i.order_id
  WHERE i.id = payments.invoice_id AND o.user_id = (SELECT auth.uid())
));




-- Restrict import/profile mutation and pricing-rule writes to organization administrators.
-- The data API must not let an ordinary member rewrite import manifests, snapshots, or price rules.
DO $$
DECLARE policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('import_profiles','import_uploads','import_chunks','import_records','pricing_rules','idempotency_keys')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_row.policyname, policy_row.tablename);
  END LOOP;
END;
$$;

CREATE POLICY import_profiles_read_org_admin
ON public.import_profiles FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = import_profiles.organization_id
      AND om.user_id = auth.uid() AND om.status = 'active'
      AND om.role IN ('owner','admin'))
);

CREATE POLICY import_profiles_insert_org_admin
ON public.import_profiles FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = import_profiles.organization_id
      AND om.user_id = auth.uid() AND om.status = 'active'
      AND om.role IN ('owner','admin'))
);

CREATE POLICY import_profiles_update_org_admin
ON public.import_profiles FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = import_profiles.organization_id
      AND om.user_id = auth.uid() AND om.status = 'active'
      AND om.role IN ('owner','admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = import_profiles.organization_id
      AND om.user_id = auth.uid() AND om.status = 'active'
      AND om.role IN ('owner','admin'))
);

CREATE POLICY import_profiles_delete_org_admin
ON public.import_profiles FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = import_profiles.organization_id
      AND om.user_id = auth.uid() AND om.status = 'active'
      AND om.role IN ('owner','admin'))
);

CREATE POLICY import_uploads_read_org_admin
ON public.import_uploads FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = import_uploads.organization_id
      AND om.user_id = auth.uid() AND om.status = 'active'
      AND om.role IN ('owner','admin'))
);

CREATE POLICY import_uploads_insert_org_admin
ON public.import_uploads FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = import_uploads.organization_id
      AND om.user_id = auth.uid() AND om.status = 'active'
      AND om.role IN ('owner','admin'))
);

CREATE POLICY import_uploads_update_org_admin
ON public.import_uploads FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = import_uploads.organization_id
      AND om.user_id = auth.uid() AND om.status = 'active'
      AND om.role IN ('owner','admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = import_uploads.organization_id
      AND om.user_id = auth.uid() AND om.status = 'active'
      AND om.role IN ('owner','admin'))
);

CREATE POLICY import_uploads_delete_org_admin
ON public.import_uploads FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = import_uploads.organization_id
      AND om.user_id = auth.uid() AND om.status = 'active'
      AND om.role IN ('owner','admin'))
);

CREATE POLICY import_chunks_read_org_admin
ON public.import_chunks FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.import_uploads u
  JOIN public.organization_members om ON om.organization_id = u.organization_id
  WHERE u.id = import_chunks.upload_id AND om.user_id = auth.uid()
    AND om.status = 'active' AND om.role IN ('owner','admin')
));

CREATE POLICY import_chunks_insert_org_admin
ON public.import_chunks FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.import_uploads u
  JOIN public.organization_members om ON om.organization_id = u.organization_id
  WHERE u.id = import_chunks.upload_id AND om.user_id = auth.uid()
    AND om.status = 'active' AND om.role IN ('owner','admin')
));

CREATE POLICY import_chunks_update_org_admin
ON public.import_chunks FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.import_uploads u
  JOIN public.organization_members om ON om.organization_id = u.organization_id
  WHERE u.id = import_chunks.upload_id AND om.user_id = auth.uid()
    AND om.status = 'active' AND om.role IN ('owner','admin')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.import_uploads u
  JOIN public.organization_members om ON om.organization_id = u.organization_id
  WHERE u.id = import_chunks.upload_id AND om.user_id = auth.uid()
    AND om.status = 'active' AND om.role IN ('owner','admin')
));

CREATE POLICY import_chunks_delete_org_admin
ON public.import_chunks FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.import_uploads u
  JOIN public.organization_members om ON om.organization_id = u.organization_id
  WHERE u.id = import_chunks.upload_id AND om.user_id = auth.uid()
    AND om.status = 'active' AND om.role IN ('owner','admin')
));

CREATE POLICY import_records_read_org_admin
ON public.import_records FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.import_uploads u
  JOIN public.organization_members om ON om.organization_id = u.organization_id
  WHERE u.id = import_records.upload_id AND om.user_id = auth.uid()
    AND om.status = 'active' AND om.role IN ('owner','admin')
));

CREATE POLICY import_records_insert_org_admin
ON public.import_records FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.import_uploads u
  JOIN public.organization_members om ON om.organization_id = u.organization_id
  WHERE u.id = import_records.upload_id AND om.user_id = auth.uid()
    AND om.status = 'active' AND om.role IN ('owner','admin')
));

CREATE POLICY import_records_update_org_admin
ON public.import_records FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.import_uploads u
  JOIN public.organization_members om ON om.organization_id = u.organization_id
  WHERE u.id = import_records.upload_id AND om.user_id = auth.uid()
    AND om.status = 'active' AND om.role IN ('owner','admin')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.import_uploads u
  JOIN public.organization_members om ON om.organization_id = u.organization_id
  WHERE u.id = import_records.upload_id AND om.user_id = auth.uid()
    AND om.status = 'active' AND om.role IN ('owner','admin')
));

CREATE POLICY import_records_delete_org_admin
ON public.import_records FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.import_uploads u
  JOIN public.organization_members om ON om.organization_id = u.organization_id
  WHERE u.id = import_records.upload_id AND om.user_id = auth.uid()
    AND om.status = 'active' AND om.role IN ('owner','admin')
));

CREATE POLICY pricing_rules_read_org
ON public.pricing_rules FOR SELECT TO authenticated
USING (private.is_org_member(organization_id));

CREATE POLICY pricing_rules_insert_admin
ON public.pricing_rules FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = pricing_rules.organization_id
      AND om.user_id = auth.uid() AND om.status = 'active'
      AND om.role IN ('owner','admin'))
);

CREATE POLICY pricing_rules_update_admin
ON public.pricing_rules FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = pricing_rules.organization_id
      AND om.user_id = auth.uid() AND om.status = 'active'
      AND om.role IN ('owner','admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = pricing_rules.organization_id
      AND om.user_id = auth.uid() AND om.status = 'active'
      AND om.role IN ('owner','admin'))
);

CREATE POLICY pricing_rules_delete_admin
ON public.pricing_rules FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = pricing_rules.organization_id
      AND om.user_id = auth.uid() AND om.status = 'active'
      AND om.role IN ('owner','admin'))
);

-- Idempotency keys are written only inside privileged, transactional RPCs. Do not expose
-- direct insert/update/delete access that could rewrite replay protection state.


