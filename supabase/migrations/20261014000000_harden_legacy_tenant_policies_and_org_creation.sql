-- Security hardening for the legacy multi-tenant schema and safe company onboarding.
-- This migration removes prototype-wide policies, closes direct membership writes, and
-- restores tenant-scoped read/write policies for the operational tables used by the app.

-- Preserve the activation state of pre-existing legacy organizations exactly once.
DO $organization_status_backfill$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'status'
  ) THEN
    ALTER TABLE public.organizations ADD COLUMN status text;
    UPDATE public.organizations
    SET status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END;
  ELSE
    UPDATE public.organizations SET status = 'pending' WHERE status IS NULL;
  END IF;
  -- Pending/suspended tenants must never remain operational because of a legacy
  -- is_active=true default. Active/inactive legacy states are preserved above.
  UPDATE public.organizations
  SET is_active = false
  WHERE status IN ('pending', 'suspended', 'inactive');
  ALTER TABLE public.organizations ALTER COLUMN status SET DEFAULT 'pending';
  ALTER TABLE public.organizations ALTER COLUMN status SET NOT NULL;
END
$organization_status_backfill$;

DO $status_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.organizations'::regclass
      AND conname = 'organizations_status_allowed_check'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_status_allowed_check
      CHECK (status IN ('pending', 'active', 'suspended', 'inactive'));
  END IF;
END
$status_constraint$;

-- Legacy bootstrap policies were permissive and therefore OR-ed with newer tenant rules.
DO $drop_legacy_anon_policies$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND left(policyname, 5) = 'anon_'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      policy_row.policyname, policy_row.schemaname, policy_row.tablename
    );
  END LOOP;
END
$drop_legacy_anon_policies$;

-- Remove remaining broad prototype policies from the older commerce migration.
DROP POLICY IF EXISTS org_insert_authenticated ON public.organizations;
DROP POLICY IF EXISTS orgmem_insert_self ON public.organization_members;
DROP POLICY IF EXISTS orgmem_update_self ON public.organization_members;
DROP POLICY IF EXISTS orgmem_delete_self ON public.organization_members;
DROP POLICY IF EXISTS cat_select_all ON public.categories;
DROP POLICY IF EXISTS prod_select_all ON public.products;
DROP POLICY IF EXISTS var_select_all ON public.product_variants;
DROP POLICY IF EXISTS img_select_all ON public.product_images;
DROP POLICY IF EXISTS ai_select_auth ON public.ai_tasks;
DROP POLICY IF EXISTS aialert_select_auth ON public.ai_alerts;
DROP POLICY IF EXISTS audit_select_auth ON public.audit_logs;
DROP POLICY IF EXISTS implog_select_auth ON public.import_logs;

-- RLS policies need schema USAGE to invoke only the explicitly granted private helpers.
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- A membership is operational only after the tenant itself has been approved and activated.
-- A new owner can still read their own pending organization through the separate read policy below.
CREATE OR REPLACE FUNCTION private.is_org_member(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $is_org_member$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE om.organization_id = p_organization_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND o.status = 'active'
      AND o.is_active = true
  );
$is_org_member$;

CREATE OR REPLACE FUNCTION private.is_org_admin(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $is_org_admin$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE om.organization_id = p_organization_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
      AND o.status = 'active'
      AND o.is_active = true
  );
$is_org_admin$;

ALTER FUNCTION private.is_org_member(uuid) SET search_path = '';
REVOKE ALL ON FUNCTION private.is_org_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_org_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION private.is_org_admin(uuid) TO authenticated;

-- Platform approval is global and cannot be granted by tenant owners through the browser.
-- Provision the first platform administrator through the trusted Supabase SQL editor; user_roles
-- has no browser write grants after this migration.
CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $is_platform_admin$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.profile_id = p.id
    WHERE p.auth_user_id = auth.uid()
      AND p.is_active = true
      AND ur.role = 'system_admin'
  );
$is_platform_admin$;

REVOKE ALL ON FUNCTION private.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_platform_admin() FROM anon;
GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $is_platform_admin_public$
  SELECT private.is_platform_admin();
$is_platform_admin_public$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_pending_organizations()
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $list_pending_organizations$
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'platform_admin_required';
  END IF;

  RETURN QUERY
  SELECT org.id, org.name, org.email, org.phone, org.created_at
  FROM public.organizations org
  WHERE org.status = 'pending' AND org.is_active = false
  ORDER BY org.created_at ASC;
END
$list_pending_organizations$;

REVOKE ALL ON FUNCTION public.list_pending_organizations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_pending_organizations() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_pending_organizations() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.review_organization(
  p_organization_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $review_organization$
DECLARE
  v_current_status text;
  v_current_active boolean;
  v_new_status text;
  v_new_active boolean;
  v_actor_profile_id uuid;
  v_reason text := NULLIF(pg_catalog.btrim(p_reason), '');
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'platform_admin_required';
  END IF;
  IF p_organization_id IS NULL OR p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'invalid_organization_review_decision';
  END IF;
  IF v_reason IS NOT NULL AND pg_catalog.char_length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'organization_review_reason_too_long';
  END IF;

  SELECT org.status, org.is_active
    INTO v_current_status, v_current_active
  FROM public.organizations org
  WHERE org.id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization_not_found';
  END IF;
  IF v_current_status <> 'pending' OR v_current_active THEN
    RAISE EXCEPTION 'organization_is_not_pending';
  END IF;

  v_new_status := CASE WHEN p_decision = 'approve' THEN 'active' ELSE 'inactive' END;
  v_new_active := (p_decision = 'approve');

  UPDATE public.organizations
  SET status = v_new_status, is_active = v_new_active, updated_at = pg_catalog.now()
  WHERE id = p_organization_id;

  SELECT p.id INTO v_actor_profile_id
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  ) VALUES (
    p_organization_id,
    v_actor_profile_id,
    CASE WHEN p_decision = 'approve' THEN 'organization.approved' ELSE 'organization.rejected' END,
    'organization',
    p_organization_id,
    pg_catalog.jsonb_build_object('status', v_current_status, 'is_active', v_current_active),
    pg_catalog.jsonb_build_object('status', v_new_status, 'is_active', v_new_active, 'reason', v_reason)
  );

  RETURN pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id,
    'status', v_new_status,
    'is_active', v_new_active
  );
END
$review_organization$;

REVOKE ALL ON FUNCTION public.review_organization(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_organization(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_organization(uuid, text, text) TO authenticated, service_role;


-- A user may read their own membership and the memberships of their active tenant,
-- but cannot self-assign an owner/admin role or remove/change membership records.
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orgmem_select_member ON public.organization_members;
CREATE POLICY orgmem_select_member
ON public.organization_members FOR SELECT TO authenticated
USING (auth.uid() = user_id OR private.is_org_member(organization_id));

REVOKE INSERT, UPDATE, DELETE ON public.organization_members FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.organization_members TO authenticated;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_select_authenticated ON public.organizations;
CREATE POLICY org_select_authenticated
ON public.organizations FOR SELECT TO authenticated
USING (
  private.is_org_member(id)
  OR EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role = 'owner'
  )
);

DROP POLICY IF EXISTS org_update_owner ON public.organizations;
CREATE POLICY org_update_owner
ON public.organizations FOR UPDATE TO authenticated
USING (private.is_org_admin(id))
WITH CHECK (private.is_org_admin(id));

DROP POLICY IF EXISTS organizations_pending_owner_update_name ON public.organizations;
CREATE POLICY organizations_pending_owner_update_name
ON public.organizations FOR UPDATE TO authenticated
USING (
  status = 'pending' AND is_active = false
  AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role = 'owner'
  )
)
WITH CHECK (
  status = 'pending' AND is_active = false
  AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role = 'owner'
  )
);

-- Keep company verification/activation and financial controls server-managed.
REVOKE INSERT, DELETE ON public.organizations FROM PUBLIC, anon, authenticated;
REVOKE UPDATE ON public.organizations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.organizations TO authenticated;
GRANT UPDATE (name) ON public.organizations TO authenticated;

-- Atomically create a pending company and its first owner membership. No client-supplied
-- user ID or organization ID is accepted; retries for the same signed-in user are idempotent.
CREATE OR REPLACE FUNCTION public.create_organization_for_current_user(
  p_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $create_organization$
DECLARE
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_membership_status text;
  v_name text := NULLIF(pg_catalog.btrim(p_name), '');
  v_email text := NULLIF(pg_catalog.btrim(p_email), '');
  v_phone text := NULLIF(pg_catalog.btrim(p_phone), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF v_name IS NULL OR pg_catalog.char_length(v_name) > 160 THEN
    RAISE EXCEPTION 'invalid_organization_name';
  END IF;
  IF v_email IS NOT NULL AND (pg_catalog.char_length(v_email) > 254 OR v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN
    RAISE EXCEPTION 'invalid_organization_email';
  END IF;
  IF v_phone IS NOT NULL AND pg_catalog.char_length(v_phone) > 40 THEN
    RAISE EXCEPTION 'invalid_organization_phone';
  END IF;

  -- Serialize concurrent retries for one user to prevent duplicate tenant creation.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  SELECT om.organization_id, om.status
    INTO v_organization_id, v_membership_status
  FROM public.organization_members om
  WHERE om.user_id = v_user_id
  ORDER BY CASE WHEN om.status = 'active' THEN 0 ELSE 1 END, om.created_at
  LIMIT 1;

  IF v_organization_id IS NOT NULL THEN
    IF v_membership_status = 'active' THEN
      RETURN v_organization_id;
    END IF;
    RAISE EXCEPTION 'organization_membership_requires_review';
  END IF;

  INSERT INTO public.organizations (name, email, phone, status, is_active)
  VALUES (v_name, v_email, v_phone, 'pending', false)
  RETURNING id INTO v_organization_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (v_organization_id, v_user_id, 'owner', 'active');

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  ) VALUES (
    v_organization_id,
    (SELECT p.id FROM public.profiles p WHERE p.auth_user_id = v_user_id LIMIT 1),
    'organization.created', 'organization', v_organization_id, NULL,
    pg_catalog.jsonb_build_object('name', v_name, 'status', 'pending')
  );

  RETURN v_organization_id;
END
$create_organization$;

REVOKE ALL ON FUNCTION public.create_organization_for_current_user(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_organization_for_current_user(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_organization_for_current_user(text, text, text) TO authenticated;

-- User profiles remain self-editable only for non-security fields. Role grants are read-only.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_member_read ON public.profiles;
CREATE POLICY profiles_member_read
ON public.profiles FOR SELECT TO authenticated
USING (
  auth_user_id = auth.uid()
  OR (organization_id IS NOT NULL AND private.is_org_member(organization_id))
);
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update
ON public.profiles FOR UPDATE TO authenticated
USING (auth_user_id = auth.uid())
WITH CHECK (auth_user_id = auth.uid());
REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, phone, avatar_url) ON public.profiles TO authenticated;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_roles_admin_read ON public.user_roles;
CREATE POLICY user_roles_admin_read
ON public.user_roles FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = user_roles.profile_id
    AND p.organization_id IS NOT NULL
    AND private.is_org_admin(p.organization_id)
));
REVOKE ALL ON public.user_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_roles TO authenticated;

-- Shared addresses require active membership. Rebuild old policies that ignored suspended/invited status.
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS addr_select_org ON public.addresses;
DROP POLICY IF EXISTS addr_insert_org ON public.addresses;
DROP POLICY IF EXISTS addr_update_org ON public.addresses;
DROP POLICY IF EXISTS addr_delete_org ON public.addresses;
DROP POLICY IF EXISTS addresses_active_member_read ON public.addresses;
DROP POLICY IF EXISTS addresses_active_member_insert ON public.addresses;
DROP POLICY IF EXISTS addresses_active_member_update ON public.addresses;
DROP POLICY IF EXISTS addresses_active_member_delete ON public.addresses;
CREATE POLICY addresses_active_member_read
ON public.addresses FOR SELECT TO authenticated
USING (private.is_org_member(organization_id));
CREATE POLICY addresses_active_member_insert
ON public.addresses FOR INSERT TO authenticated
WITH CHECK (private.is_org_member(organization_id));
CREATE POLICY addresses_active_member_update
ON public.addresses FOR UPDATE TO authenticated
USING (private.is_org_member(organization_id))
WITH CHECK (private.is_org_member(organization_id));
CREATE POLICY addresses_active_member_delete
ON public.addresses FOR DELETE TO authenticated
USING (private.is_org_member(organization_id));
REVOKE ALL ON public.addresses FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;

-- A user's cart may only contain catalog items belonging to one of their active organizations.
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cart_select_own ON public.cart_items;
DROP POLICY IF EXISTS cart_insert_own ON public.cart_items;
DROP POLICY IF EXISTS cart_update_own ON public.cart_items;
DROP POLICY IF EXISTS cart_delete_own ON public.cart_items;
DROP POLICY IF EXISTS cart_insert_own_active_tenant ON public.cart_items;
DROP POLICY IF EXISTS cart_update_own_active_tenant ON public.cart_items;
DROP POLICY IF EXISTS cart_select_own_active_tenant ON public.cart_items;
CREATE POLICY cart_select_own_active_tenant
ON public.cart_items FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = cart_items.product_id
      AND private.is_org_member(p.organization_id)
  )
);
CREATE POLICY cart_insert_own_active_tenant
ON public.cart_items FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = cart_items.product_id
      AND private.is_org_member(p.organization_id)
  )
);
CREATE POLICY cart_update_own_active_tenant
ON public.cart_items FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = cart_items.product_id
      AND private.is_org_member(p.organization_id)
  )
);
-- Always allow cleanup of a user's own stale/cross-tenant cart row.
CREATE POLICY cart_delete_own
ON public.cart_items FOR DELETE TO authenticated
USING (user_id = auth.uid());
REVOKE ALL ON public.cart_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;

-- Wishlist rows are user-owned, but new entries must reference the user's active tenant catalog.
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wish_select_own ON public.wishlist_items;
DROP POLICY IF EXISTS wish_insert_own ON public.wishlist_items;
DROP POLICY IF EXISTS wish_delete_own ON public.wishlist_items;
DROP POLICY IF EXISTS wish_insert_own_active_tenant ON public.wishlist_items;
DROP POLICY IF EXISTS wish_select_own_active_tenant ON public.wishlist_items;
CREATE POLICY wish_select_own_active_tenant
ON public.wishlist_items FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = wishlist_items.product_id
      AND private.is_org_member(p.organization_id)
  )
);
CREATE POLICY wish_insert_own_active_tenant
ON public.wishlist_items FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = wishlist_items.product_id
      AND private.is_org_member(p.organization_id)
  )
);
CREATE POLICY wish_delete_own
ON public.wishlist_items FOR DELETE TO authenticated
USING (user_id = auth.uid());
REVOKE ALL ON public.wishlist_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.wishlist_items TO authenticated;

-- Reorder templates must remain attached to both their owner and an active tenant.
ALTER TABLE public.reorder_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tmpl_select_org ON public.reorder_templates;
DROP POLICY IF EXISTS tmpl_insert_own ON public.reorder_templates;
DROP POLICY IF EXISTS tmpl_update_own ON public.reorder_templates;
DROP POLICY IF EXISTS tmpl_delete_own ON public.reorder_templates;
DROP POLICY IF EXISTS reorder_templates_owner_read ON public.reorder_templates;
DROP POLICY IF EXISTS reorder_templates_owner_insert ON public.reorder_templates;
DROP POLICY IF EXISTS reorder_templates_owner_update ON public.reorder_templates;
DROP POLICY IF EXISTS reorder_templates_owner_delete ON public.reorder_templates;
CREATE POLICY reorder_templates_owner_read
ON public.reorder_templates FOR SELECT TO authenticated
USING (user_id = auth.uid() AND private.is_org_member(organization_id));
CREATE POLICY reorder_templates_owner_insert
ON public.reorder_templates FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND private.is_org_member(organization_id));
CREATE POLICY reorder_templates_owner_update
ON public.reorder_templates FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND private.is_org_member(organization_id))
WITH CHECK (user_id = auth.uid() AND private.is_org_member(organization_id));
CREATE POLICY reorder_templates_owner_delete
ON public.reorder_templates FOR DELETE TO authenticated
USING (user_id = auth.uid() AND private.is_org_member(organization_id));
REVOKE ALL ON public.reorder_templates FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reorder_templates TO authenticated;

-- Order-status history is append-only via trusted transaction RPCs, never browser-authored.
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ordhist_select_org ON public.order_status_history;
DROP POLICY IF EXISTS ordhist_insert_org ON public.order_status_history;
DROP POLICY IF EXISTS order_status_history_active_tenant_read ON public.order_status_history;
CREATE POLICY order_status_history_active_tenant_read
ON public.order_status_history FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_status_history.order_id
    AND private.is_org_member(o.organization_id)
));
REVOKE ALL ON public.order_status_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_status_history TO authenticated;

-- Replace prototype transaction SELECT policies that ignored tenant approval.
DROP POLICY IF EXISTS ord_select_org ON public.orders;
DROP POLICY IF EXISTS ord_insert_org ON public.orders;
DROP POLICY IF EXISTS ord_update_org ON public.orders;
DROP POLICY IF EXISTS orders_active_tenant_read ON public.orders;
CREATE POLICY orders_active_tenant_read
ON public.orders FOR SELECT TO authenticated
USING (private.is_org_member(organization_id));

DROP POLICY IF EXISTS orditem_select_org ON public.order_items;
DROP POLICY IF EXISTS order_items_active_tenant_read ON public.order_items;
CREATE POLICY order_items_active_tenant_read
ON public.order_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_items.order_id
    AND private.is_org_member(o.organization_id)
));

DROP POLICY IF EXISTS inv_select_org ON public.invoices;
DROP POLICY IF EXISTS invoices_active_tenant_read ON public.invoices;
CREATE POLICY invoices_active_tenant_read
ON public.invoices FOR SELECT TO authenticated
USING (private.is_org_member(organization_id));

DROP POLICY IF EXISTS pay_select_org ON public.payments;
DROP POLICY IF EXISTS payments_active_tenant_read ON public.payments;
CREATE POLICY payments_active_tenant_read
ON public.payments FOR SELECT TO authenticated
USING (private.is_org_member(organization_id));

DROP POLICY IF EXISTS stmt_select_org ON public.statements;
DROP POLICY IF EXISTS statements_active_tenant_read ON public.statements;
CREATE POLICY statements_active_tenant_read
ON public.statements FOR SELECT TO authenticated
USING (private.is_org_member(organization_id));

-- Commerce transactions are written only by the audited/idempotent SECURITY DEFINER RPCs.
REVOKE ALL ON
  public.orders, public.order_items, public.invoices, public.payments
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON
  public.orders, public.order_items, public.invoices, public.payments
  TO authenticated;

-- Audit and outbox records are immutable to browser clients. Database triggers and the
-- privileged transaction RPCs remain the only write paths.
REVOKE ALL ON public.audit_logs, public.outbox_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.audit_logs, public.outbox_events TO authenticated;

-- Price tiers are visible only when the member is in the same tenant as both the tier and product.
ALTER TABLE public.price_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tier_select_org ON public.price_tiers;
DROP POLICY IF EXISTS price_tiers_same_tenant_read ON public.price_tiers;
CREATE POLICY price_tiers_same_tenant_read
ON public.price_tiers FOR SELECT TO authenticated
USING (
  private.is_org_member(organization_id)
  AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = price_tiers.product_id
      AND p.organization_id = price_tiers.organization_id
  )
);
REVOKE ALL ON public.price_tiers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.price_tiers TO authenticated;

-- Catalog and organization-scoped master data.
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS categories_member_read ON public.categories;
CREATE POLICY categories_member_read
ON public.categories FOR SELECT TO authenticated
USING (private.is_org_member(organization_id));
DROP POLICY IF EXISTS categories_admin_insert ON public.categories;
CREATE POLICY categories_admin_insert
ON public.categories FOR INSERT TO authenticated
WITH CHECK (private.is_org_admin(organization_id));
DROP POLICY IF EXISTS categories_admin_update ON public.categories;
CREATE POLICY categories_admin_update
ON public.categories FOR UPDATE TO authenticated
USING (private.is_org_admin(organization_id))
WITH CHECK (private.is_org_admin(organization_id));
DROP POLICY IF EXISTS categories_admin_delete ON public.categories;
CREATE POLICY categories_admin_delete
ON public.categories FOR DELETE TO authenticated
USING (private.is_org_admin(organization_id));
REVOKE ALL ON public.categories FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_member_read ON public.products;
CREATE POLICY products_member_read
ON public.products FOR SELECT TO authenticated
USING (private.is_org_member(organization_id));

-- Replace legacy catalog write rules with approval-aware tenant rules.
DROP POLICY IF EXISTS products_staff_insert ON public.products;
DROP POLICY IF EXISTS products_staff_update ON public.products;
DROP POLICY IF EXISTS products_active_staff_insert ON public.products;
CREATE POLICY products_active_staff_insert
ON public.products FOR INSERT TO authenticated
WITH CHECK (
  private.is_org_member(organization_id)
  AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = products.organization_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role IN ('owner','admin','manager')
  )
);
DROP POLICY IF EXISTS products_active_staff_update ON public.products;
CREATE POLICY products_active_staff_update
ON public.products FOR UPDATE TO authenticated
USING (
  private.is_org_member(organization_id)
  AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = products.organization_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role IN ('owner','admin','manager')
  )
)
WITH CHECK (
  private.is_org_member(organization_id)
  AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = products.organization_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role IN ('owner','admin','manager')
  )
);

-- The staff pricing view must not bypass tenant approval.
CREATE OR REPLACE VIEW public.admin_product_catalog
WITH (security_invoker = false)
AS
SELECT p.*
FROM public.products p
WHERE private.is_org_member(p.organization_id)
  AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p.organization_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role IN ('owner','admin','manager','sales','customer_manager','accountant')
  );
REVOKE ALL ON public.admin_product_catalog FROM PUBLIC, anon;
GRANT SELECT ON public.admin_product_catalog TO authenticated;

-- Descriptive catalog columns only. Pricing and cost data stay behind the staff-only view/RPCs.
REVOKE SELECT ON public.products FROM PUBLIC, anon, authenticated;
REVOKE SELECT (
  id, organization_id, category_id, brand_id, item_code, sku,
  name, name_ar, slug, description, unit, box_quantity, carton_quantity,
  min_order_qty, stock_quantity, barcode, image_url, is_active, is_featured,
  is_new, tags, status, created_at, updated_at
) ON public.products FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, organization_id, category_id, brand_id, item_code, sku,
  name, name_ar, slug, description, unit, box_quantity, carton_quantity,
  min_order_qty, stock_quantity, barcode, image_url, is_active, is_featured,
  is_new, tags, status, created_at, updated_at
) ON public.products TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.products FROM PUBLIC, anon;
GRANT INSERT, UPDATE ON public.products TO authenticated;

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS variants_member_read ON public.product_variants;
CREATE POLICY variants_member_read
ON public.product_variants FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_variants.product_id
    AND private.is_org_member(p.organization_id)
));
DROP POLICY IF EXISTS variants_admin_insert ON public.product_variants;
CREATE POLICY variants_admin_insert
ON public.product_variants FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_variants.product_id
    AND private.is_org_admin(p.organization_id)
));
DROP POLICY IF EXISTS variants_admin_update ON public.product_variants;
CREATE POLICY variants_admin_update
ON public.product_variants FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_variants.product_id
    AND private.is_org_admin(p.organization_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_variants.product_id
    AND private.is_org_admin(p.organization_id)
));
DROP POLICY IF EXISTS variants_admin_delete ON public.product_variants;
CREATE POLICY variants_admin_delete
ON public.product_variants FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_variants.product_id
    AND private.is_org_admin(p.organization_id)
));
REVOKE ALL ON public.product_variants FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, product_id, sku, name, stock_quantity, attributes, created_at)
  ON public.product_variants TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS images_member_read ON public.product_images;
CREATE POLICY images_member_read
ON public.product_images FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_images.product_id
    AND private.is_org_member(p.organization_id)
));
DROP POLICY IF EXISTS images_admin_insert ON public.product_images;
CREATE POLICY images_admin_insert
ON public.product_images FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_images.product_id
    AND private.is_org_admin(p.organization_id)
));
DROP POLICY IF EXISTS images_admin_update ON public.product_images;
CREATE POLICY images_admin_update
ON public.product_images FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_images.product_id
    AND private.is_org_admin(p.organization_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_images.product_id
    AND private.is_org_admin(p.organization_id)
));
DROP POLICY IF EXISTS images_admin_delete ON public.product_images;
CREATE POLICY images_admin_delete
ON public.product_images FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_images.product_id
    AND private.is_org_admin(p.organization_id)
));
REVOKE ALL ON public.product_images FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_images TO authenticated;

ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_media_member_read ON public.product_media;
CREATE POLICY product_media_member_read
ON public.product_media FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_media.product_id
    AND private.is_org_member(p.organization_id)
));
DROP POLICY IF EXISTS product_media_admin_insert ON public.product_media;
CREATE POLICY product_media_admin_insert
ON public.product_media FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_media.product_id
    AND private.is_org_admin(p.organization_id)
));
DROP POLICY IF EXISTS product_media_admin_update ON public.product_media;
CREATE POLICY product_media_admin_update
ON public.product_media FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_media.product_id
    AND private.is_org_admin(p.organization_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_media.product_id
    AND private.is_org_admin(p.organization_id)
));
DROP POLICY IF EXISTS product_media_admin_delete ON public.product_media;
CREATE POLICY product_media_admin_delete
ON public.product_media FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_media.product_id
    AND private.is_org_admin(p.organization_id)
));
REVOKE ALL ON public.product_media FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_media TO authenticated;

-- Warehouse, branch and supplier maintenance is tenant-scoped and admin-only for writes.
DO $master_data_policies$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['branches', 'warehouses', 'suppliers']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_member_read', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.is_org_member(organization_id))',
      table_name || '_member_read', table_name
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_admin_insert', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (private.is_org_admin(organization_id))',
      table_name || '_admin_insert', table_name
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_admin_update', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (private.is_org_admin(organization_id)) WITH CHECK (private.is_org_admin(organization_id))',
      table_name || '_admin_update', table_name
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_admin_delete', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (private.is_org_admin(organization_id))',
      table_name || '_admin_delete', table_name
    );
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', table_name);
  END LOOP;
END
$master_data_policies$;

-- Customer-directory access must respect platform approval, not just stale membership rows.
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customers_member_read ON public.customers;
CREATE POLICY customers_member_read
ON public.customers FOR SELECT TO authenticated
USING (
  private.is_org_member(organization_id)
  AND (
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
  )
);
DROP POLICY IF EXISTS customers_staff_insert ON public.customers;
CREATE POLICY customers_staff_insert
ON public.customers FOR INSERT TO authenticated
WITH CHECK (
  private.is_org_member(organization_id)
  AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = customers.organization_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role IN ('owner','admin','manager','customer_manager')
  )
);
DROP POLICY IF EXISTS customers_staff_update ON public.customers;
CREATE POLICY customers_staff_update
ON public.customers FOR UPDATE TO authenticated
USING (
  private.is_org_member(organization_id)
  AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = customers.organization_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role IN ('owner','admin','manager','customer_manager')
  )
)
WITH CHECK (
  private.is_org_member(organization_id)
  AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = customers.organization_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role IN ('owner','admin','manager','customer_manager')
  )
);
REVOKE ALL ON public.customers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;

-- Price history, stock ledgers, AI operations and import job details are read-only in the browser.
ALTER TABLE public.price_change_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS price_change_log_admin_read ON public.price_change_log;
CREATE POLICY price_change_log_admin_read
ON public.price_change_log FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = price_change_log.product_id
    AND private.is_org_admin(p.organization_id)
));
REVOKE ALL ON public.price_change_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.price_change_log TO authenticated;

ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_prices FROM PUBLIC, anon, authenticated;

ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_balances_admin_read ON public.inventory_balances;
CREATE POLICY inventory_balances_admin_read
ON public.inventory_balances FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  JOIN public.warehouses w ON w.id = inventory_balances.warehouse_id
  WHERE p.id = inventory_balances.product_id
    AND p.organization_id = w.organization_id
    AND private.is_org_admin(p.organization_id)
));
REVOKE ALL ON public.inventory_balances FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.inventory_balances TO authenticated;

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_movements_admin_read ON public.inventory_movements;
CREATE POLICY inventory_movements_admin_read
ON public.inventory_movements FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  JOIN public.warehouses w ON w.id = inventory_movements.warehouse_id
  WHERE p.id = inventory_movements.product_id
    AND p.organization_id = w.organization_id
    AND private.is_org_admin(p.organization_id)
));
REVOKE ALL ON public.inventory_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.inventory_movements TO authenticated;

ALTER TABLE public.ai_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_tasks_admin_read ON public.ai_tasks;
CREATE POLICY ai_tasks_admin_read
ON public.ai_tasks FOR SELECT TO authenticated
USING (private.is_org_admin(organization_id));
REVOKE ALL ON public.ai_tasks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_tasks TO authenticated;

ALTER TABLE public.ai_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_alerts_admin_read ON public.ai_alerts;
CREATE POLICY ai_alerts_admin_read
ON public.ai_alerts FOR SELECT TO authenticated
USING (private.is_org_admin(organization_id));
REVOKE ALL ON public.ai_alerts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_alerts TO authenticated;

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_jobs_admin_read ON public.import_jobs;
CREATE POLICY import_jobs_admin_read
ON public.import_jobs FOR SELECT TO authenticated
USING (organization_id IS NOT NULL AND private.is_org_admin(organization_id));
REVOKE ALL ON public.import_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.import_jobs TO authenticated;

ALTER TABLE public.import_job_rows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_job_rows_admin_read ON public.import_job_rows;
CREATE POLICY import_job_rows_admin_read
ON public.import_job_rows FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.import_jobs j
  WHERE j.id = import_job_rows.import_job_id
    AND j.organization_id IS NOT NULL
    AND private.is_org_admin(j.organization_id)
));
REVOKE ALL ON public.import_job_rows FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.import_job_rows TO authenticated;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_owner_or_admin_read ON public.notifications;
CREATE POLICY notifications_owner_or_admin_read
ON public.notifications FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p
          WHERE p.id = notifications.profile_id AND p.auth_user_id = auth.uid())
  OR (organization_id IS NOT NULL AND private.is_org_admin(organization_id))
);
DROP POLICY IF EXISTS notifications_owner_mark_read ON public.notifications;
CREATE POLICY notifications_owner_mark_read
ON public.notifications FOR UPDATE TO authenticated
USING (
  notifications.user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = notifications.profile_id AND p.auth_user_id = auth.uid())
)
WITH CHECK (
  notifications.user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = notifications.profile_id AND p.auth_user_id = auth.uid())
);
REVOKE ALL ON public.notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE (read, is_read) ON public.notifications TO authenticated;

-- Import logs are not consistently organization-tagged in older installations; restrict them
-- to the authenticated actor until an organization key is present in the canonical schema.
ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_logs_creator_read ON public.import_logs;
CREATE POLICY import_logs_creator_read
ON public.import_logs FOR SELECT TO authenticated
USING (created_by = auth.uid());
REVOKE ALL ON public.import_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.import_logs TO authenticated;

-- These policies intentionally keep the legacy global brand dictionary read-only/public.
DROP POLICY IF EXISTS brand_insert_all ON public.brands;
DROP POLICY IF EXISTS brand_update_all ON public.brands;
DROP POLICY IF EXISTS brand_delete_all ON public.brands;
REVOKE INSERT, UPDATE, DELETE ON public.brands FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.brands TO anon, authenticated;
