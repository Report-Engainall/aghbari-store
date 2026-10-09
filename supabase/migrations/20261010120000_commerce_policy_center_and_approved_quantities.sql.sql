/*
# Commerce policy center, approved quantities, and deterministic retail/wholesale pricing

This migration is forward-only and preserves historical requested quantities and base prices.
All organization scope is verified on the server from the authenticated user's membership.
*/

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS approved_quantity numeric(15,3);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_items integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_amount numeric(15,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_adjustment_note text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

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
AS $
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
$;

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
AS $
BEGIN
  PERFORM public.recalculate_organization_product_prices(NEW.organization_id);
  RETURN NEW;
END;
$;

DROP TRIGGER IF EXISTS sync_product_prices_after_base_change ON products;
CREATE TRIGGER sync_product_prices_after_base_change
AFTER INSERT OR UPDATE OF base_price ON products
FOR EACH ROW EXECUTE FUNCTION public.sync_prices_after_product_base_change();

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
AS $
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
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
  v_invoice_number text := 'INV-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  v_subtotal numeric(14,2) := 0;
  v_line_total numeric(14,2);
  v_unit_price numeric(12,2);
  v_multiplier integer;
  item record;
BEGIN
  IF v_user_id IS NULL OR p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM organization_members
  WHERE user_id = v_user_id AND status = 'active'
  ORDER BY created_at
  LIMIT 1;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'organization_required'; END IF;

  SELECT md5(COALESCE(string_agg(
    ci.product_id::text || ':' || ci.quantity::text || ':' || COALESCE(ci.unit_type, 'piece'),
    '|' ORDER BY ci.product_id::text, ci.unit_type
  ), 'empty-cart'))
  INTO v_cart_hash
  FROM cart_items ci WHERE ci.user_id = v_user_id;

  v_request_hash := md5(
    COALESCE(p_shipping_address::text, '') || '|' ||
    COALESCE(p_billing_address::text, '') || '|' ||
    COALESCE(p_notes, '') || '|' || COALESCE(v_cart_hash, 'empty-cart')
  );

  INSERT INTO idempotency_keys (organization_id, idempotency_key, request_hash, operation_type, status, created_at, expires_at)
  VALUES (v_org_id, p_idempotency_key, v_request_hash, 'create_order', 'processing', now(), now() + interval '24 hours')
  ON CONFLICT (organization_id, idempotency_key, operation_type) DO UPDATE
    SET request_hash = EXCLUDED.request_hash,
        response_reference = NULL,
        status = 'processing',
        created_at = now(),
        expires_at = now() + interval '24 hours'
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

  INSERT INTO orders (order_number, organization_id, user_id, status, shipping_address, billing_address, notes, idempotency_key)
  VALUES (v_order_number, v_org_id, v_user_id, 'pending', p_shipping_address, p_billing_address, p_notes, p_idempotency_key)
  RETURNING id INTO v_order_id;

  FOR item IN
    SELECT ci.*, p.sku, p.item_code, p.name, p.name_ar, p.unit, p.base_price,
           p.price, p.bulk_price, p.retail_price, p.wholesale_price, p.stock_quantity,
           p.min_order_qty, p.box_quantity, p.carton_quantity
    FROM cart_items ci JOIN products p ON p.id = ci.product_id
    WHERE ci.user_id = v_user_id
    FOR UPDATE OF p
  LOOP
    IF item.quantity < item.min_order_qty OR item.quantity > item.stock_quantity THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;
    v_multiplier := CASE item.unit_type
      WHEN 'carton' THEN greatest(item.carton_quantity, 1)
      WHEN 'box' THEN greatest(item.box_quantity, 1)
      ELSE 1
    END;
    v_unit_price := public.calculate_commerce_price(
      item.product_id,
      item.quantity,
      CASE WHEN item.quantity >= 10 THEN 'wholesale' ELSE 'retail' END
    );
    v_line_total := v_unit_price * item.quantity * v_multiplier;
    v_subtotal := v_subtotal + v_line_total;
    INSERT INTO order_items (
      order_id, product_id, sku, item_code, name, product_name_snapshot,
      unit_type, unit_snapshot, quantity, unit_price, unit_price_snapshot,
      discount, discount_snapshot, tax_snapshot, line_total
    ) VALUES (
      v_order_id, item.product_id, item.sku, COALESCE(item.item_code, item.sku),
      COALESCE(item.name_ar, item.name), COALESCE(item.name_ar, item.name),
      item.unit_type, item.unit, item.quantity, v_unit_price, v_unit_price,
      0, 0, 0, v_line_total
    );
  END LOOP;

  IF v_subtotal = 0 THEN RAISE EXCEPTION 'empty_cart'; END IF;
  UPDATE orders
  SET subtotal = v_subtotal, total = v_subtotal, total_amount = v_subtotal,
      total_items = (SELECT COUNT(*) FROM order_items WHERE order_id = v_order_id),
      updated_at = now()
  WHERE id = v_order_id;

  INSERT INTO invoices (invoice_number, order_id, organization_id, subtotal, total, status, customer_name_snapshot, main_description)
  SELECT v_invoice_number, v_order_id, v_org_id, v_subtotal, v_subtotal, 'issued', o.name, 'طلب شراء من منصة الأغبري'
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
$;

REVOKE ALL ON FUNCTION public.create_order_from_cart(jsonb, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order_from_cart(jsonb, jsonb, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_order_from_cart(jsonb, jsonb, text, text) TO authenticated;

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

  SELECT o.organization_id INTO v_organization_id
  FROM orders o WHERE o.id = p_order_id FOR UPDATE;
  IF v_organization_id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = v_organization_id AND om.user_id = v_user_id
      AND om.status = 'active' AND om.role IN ('owner','admin')
  ) THEN RAISE EXCEPTION 'admin_required'; END IF;

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
    COALESCE(oi.approved_quantity, oi.quantity) * COALESCE(oi.unit_price_snapshot, oi.unit_price, 0)
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
