-- Tenant-safe customer directory and column-level product-price confidentiality.
-- The catalog's public surface exposes descriptive/availability columns only.
-- Authorized staff use admin_product_catalog, whose WHERE clause enforces active tenant membership.

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_member_read ON public.customers;
CREATE POLICY customers_member_read ON public.customers FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = customers.organization_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role IN ('owner','admin','manager','sales','customer_manager','accountant')
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = customers.profile_id AND p.auth_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS customers_staff_insert ON public.customers;
CREATE POLICY customers_staff_insert ON public.customers FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = customers.organization_id
    AND om.user_id = auth.uid()
    AND om.status = 'active'
    AND om.role IN ('owner','admin','manager','customer_manager')
));

DROP POLICY IF EXISTS customers_staff_update ON public.customers;
CREATE POLICY customers_staff_update ON public.customers FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = customers.organization_id
    AND om.user_id = auth.uid()
    AND om.status = 'active'
    AND om.role IN ('owner','admin','manager','customer_manager')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = customers.organization_id
    AND om.user_id = auth.uid()
    AND om.status = 'active'
    AND om.role IN ('owner','admin','manager','customer_manager')
));

-- Products can still be listed publicly, but price/cost columns are not readable from the base table.
REVOKE SELECT ON public.products FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, organization_id, category_id, brand_id, item_code, sku,
  name, name_ar, slug, description, unit, box_quantity, carton_quantity,
  min_order_qty, stock_quantity, reserved_stock, min_stock, max_stock,
  weight, barcode, image_url, is_active, is_featured, is_new, tags,
  status, created_at, updated_at
) ON public.products TO anon, authenticated;

-- The authenticated staff surface exposes price fields only when the caller is an active member
-- of the product's organization and has a permitted commerce role.
CREATE OR REPLACE VIEW public.admin_product_catalog
WITH (security_invoker = false)
AS
SELECT p.*
FROM public.products p
WHERE EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = p.organization_id
    AND om.user_id = auth.uid()
    AND om.status = 'active'
    AND om.role IN ('owner','admin','manager','sales','customer_manager','accountant')
);

REVOKE ALL ON public.admin_product_catalog FROM PUBLIC, anon;
GRANT SELECT ON public.admin_product_catalog TO authenticated;

-- Product creation/maintenance is limited to tenant managers. No anonymous catalog writes.
REVOKE INSERT, UPDATE, DELETE ON public.products FROM PUBLIC, anon;
GRANT INSERT, UPDATE ON public.products TO authenticated;

DROP POLICY IF EXISTS products_staff_insert ON public.products;
CREATE POLICY products_staff_insert ON public.products FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = products.organization_id
    AND om.user_id = auth.uid()
    AND om.status = 'active'
    AND om.role IN ('owner','admin','manager')
));

DROP POLICY IF EXISTS products_staff_update ON public.products;
CREATE POLICY products_staff_update ON public.products FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = products.organization_id
    AND om.user_id = auth.uid()
    AND om.status = 'active'
    AND om.role IN ('owner','admin','manager')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = products.organization_id
    AND om.user_id = auth.uid()
    AND om.status = 'active'
    AND om.role IN ('owner','admin','manager')
));

CREATE OR REPLACE FUNCTION public.audit_product_catalog_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_actor_profile_id uuid;
  v_action text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  SELECT p.id INTO v_actor_profile_id
  FROM public.profiles p WHERE p.auth_user_id = v_user_id LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    v_action := 'product.created';
    v_old := NULL;
    v_new := jsonb_build_object(
      'sku', NEW.sku, 'item_code', NEW.item_code, 'name', NEW.name,
      'base_price', NEW.base_price, 'retail_price', NEW.retail_price,
      'wholesale_price', NEW.wholesale_price, 'bulk_price', NEW.bulk_price,
      'cost_price', NEW.cost_price, 'is_active', NEW.is_active
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF ROW(OLD.sku, OLD.item_code, OLD.name, OLD.name_ar, OLD.base_price, OLD.price,
           OLD.retail_price, OLD.wholesale_price, OLD.bulk_price, OLD.cost_price, OLD.is_active)
       IS NOT DISTINCT FROM
       ROW(NEW.sku, NEW.item_code, NEW.name, NEW.name_ar, NEW.base_price, NEW.price,
           NEW.retail_price, NEW.wholesale_price, NEW.bulk_price, NEW.cost_price, NEW.is_active)
    THEN RETURN NEW; END IF;
    v_action := 'product.updated';
    v_old := jsonb_build_object(
      'sku', OLD.sku, 'item_code', OLD.item_code, 'name', OLD.name,
      'base_price', OLD.base_price, 'retail_price', OLD.retail_price,
      'wholesale_price', OLD.wholesale_price, 'bulk_price', OLD.bulk_price,
      'cost_price', OLD.cost_price, 'is_active', OLD.is_active
    );
    v_new := jsonb_build_object(
      'sku', NEW.sku, 'item_code', NEW.item_code, 'name', NEW.name,
      'base_price', NEW.base_price, 'retail_price', NEW.retail_price,
      'wholesale_price', NEW.wholesale_price, 'bulk_price', NEW.bulk_price,
      'cost_price', NEW.cost_price, 'is_active', NEW.is_active
    );
  ELSE
    v_action := 'product.deleted';
    v_old := jsonb_build_object('id', OLD.id, 'sku', OLD.sku, 'name', OLD.name);
    v_new := NULL;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  ) VALUES (
    COALESCE(NEW.organization_id, OLD.organization_id),
    v_actor_profile_id, v_action, 'product',
    COALESCE(NEW.id, OLD.id), v_old, v_new
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS products_audit_catalog_changes ON public.products;
CREATE TRIGGER products_audit_catalog_changes
AFTER INSERT OR UPDATE OR DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.audit_product_catalog_changes();

REVOKE ALL ON FUNCTION public.audit_product_catalog_changes() FROM PUBLIC, anon, authenticated;
