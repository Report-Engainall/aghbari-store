-- Aghbari Commerce operational workflows: procurement, stock transfer, count, and expenses.
-- Every inventory-affecting command is executed in a single server-side transaction.
-- No production data is changed by adding this migration to the repository.

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  purchase_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ordered','partially_received','received','cancelled')),
  currency text NOT NULL DEFAULT 'USD',
  notes text,
  total_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ordered_at timestamptz,
  received_at timestamptz,
  UNIQUE (organization_id, purchase_number)
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity_ordered numeric(15,3) NOT NULL CHECK (quantity_ordered > 0),
  quantity_received numeric(15,3) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_cost numeric(14,4) NOT NULL CHECK (unit_cost >= 0),
  line_total numeric(14,2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_order_id, product_id),
  CHECK (quantity_received <= quantity_ordered)
);

CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  receipt_number text NOT NULL,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','reversed')),
  notes text,
  received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, receipt_number)
);

CREATE TABLE IF NOT EXISTS public.goods_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id uuid NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id uuid NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity_received numeric(15,3) NOT NULL CHECK (quantity_received > 0),
  unit_cost numeric(14,4) NOT NULL CHECK (unit_cost >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  transfer_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','cancelled')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  UNIQUE (organization_id, transfer_number),
  CHECK (from_warehouse_id <> to_warehouse_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.inventory_transfers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric(15,3) NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transfer_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  count_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','cancelled')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  UNIQUE (organization_id, count_number)
);

CREATE TABLE IF NOT EXISTS public.stock_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_count_id uuid NOT NULL REFERENCES public.stock_counts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  system_quantity numeric(15,3) NOT NULL CHECK (system_quantity >= 0),
  counted_quantity numeric(15,3) NOT NULL CHECK (counted_quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_count_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  expense_number text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD',
  expense_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','voided')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, expense_number)
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_org_date ON public.purchase_orders(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_items_order ON public.purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_org_date ON public.goods_receipts(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_org_date ON public.inventory_transfers(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_counts_org_date ON public.stock_counts(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_org_date ON public.expenses(organization_id, expense_date DESC);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_count_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_orders_read_member ON public.purchase_orders;
CREATE POLICY purchase_orders_read_member ON public.purchase_orders FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = purchase_orders.organization_id AND om.user_id = auth.uid() AND om.status = 'active'
));
DROP POLICY IF EXISTS purchase_orders_admin_write ON public.purchase_orders;

DROP POLICY IF EXISTS purchase_order_items_read_member ON public.purchase_order_items;
CREATE POLICY purchase_order_items_read_member ON public.purchase_order_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.purchase_orders po JOIN public.organization_members om ON om.organization_id = po.organization_id
  WHERE po.id = purchase_order_items.purchase_order_id AND om.user_id = auth.uid() AND om.status = 'active'
));
DROP POLICY IF EXISTS purchase_order_items_admin_write ON public.purchase_order_items;

DROP POLICY IF EXISTS goods_receipts_read_member ON public.goods_receipts;
CREATE POLICY goods_receipts_read_member ON public.goods_receipts FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = goods_receipts.organization_id AND om.user_id = auth.uid() AND om.status = 'active'
));
DROP POLICY IF EXISTS goods_receipt_items_read_member ON public.goods_receipt_items;
CREATE POLICY goods_receipt_items_read_member ON public.goods_receipt_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.goods_receipts gr JOIN public.organization_members om ON om.organization_id = gr.organization_id
  WHERE gr.id = goods_receipt_items.goods_receipt_id AND om.user_id = auth.uid() AND om.status = 'active'
));

DROP POLICY IF EXISTS inventory_transfers_read_member ON public.inventory_transfers;
CREATE POLICY inventory_transfers_read_member ON public.inventory_transfers FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = inventory_transfers.organization_id AND om.user_id = auth.uid() AND om.status = 'active'
));
DROP POLICY IF EXISTS inventory_transfers_admin_write ON public.inventory_transfers;
DROP POLICY IF EXISTS inventory_transfer_items_read_member ON public.inventory_transfer_items;
CREATE POLICY inventory_transfer_items_read_member ON public.inventory_transfer_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.inventory_transfers t JOIN public.organization_members om ON om.organization_id = t.organization_id
  WHERE t.id = inventory_transfer_items.transfer_id AND om.user_id = auth.uid() AND om.status = 'active'
));
DROP POLICY IF EXISTS inventory_transfer_items_admin_write ON public.inventory_transfer_items;

DROP POLICY IF EXISTS stock_counts_read_member ON public.stock_counts;
CREATE POLICY stock_counts_read_member ON public.stock_counts FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = stock_counts.organization_id AND om.user_id = auth.uid() AND om.status = 'active'
));
DROP POLICY IF EXISTS stock_counts_admin_write ON public.stock_counts;
DROP POLICY IF EXISTS stock_count_items_read_member ON public.stock_count_items;
CREATE POLICY stock_count_items_read_member ON public.stock_count_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.stock_counts sc JOIN public.organization_members om ON om.organization_id = sc.organization_id
  WHERE sc.id = stock_count_items.stock_count_id AND om.user_id = auth.uid() AND om.status = 'active'
));
DROP POLICY IF EXISTS stock_count_items_admin_write ON public.stock_count_items;

DROP POLICY IF EXISTS expenses_read_member ON public.expenses;
CREATE POLICY expenses_read_member ON public.expenses FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = expenses.organization_id AND om.user_id = auth.uid() AND om.status = 'active'
));
DROP POLICY IF EXISTS expenses_admin_write ON public.expenses;

CREATE OR REPLACE FUNCTION public.create_purchase_order(
  p_organization_id uuid, p_supplier_id uuid, p_warehouse_id uuid, p_items jsonb, p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_purchase_id uuid;
  v_number text;
  v_total numeric(14,2);
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om WHERE om.organization_id = p_organization_id
      AND om.user_id = v_user_id AND om.status = 'active' AND om.role IN ('owner','admin')
  ) THEN RAISE EXCEPTION 'purchase_order_forbidden'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'purchase_items_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = p_supplier_id AND s.organization_id = p_organization_id AND s.status IN ('active','approved')) THEN
    RAISE EXCEPTION 'supplier_not_available';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = p_warehouse_id AND w.organization_id = p_organization_id AND w.is_active) THEN
    RAISE EXCEPTION 'warehouse_not_available';
  END IF;

  SELECT count(*), round(sum((i.quantity_ordered * i.unit_cost)::numeric), 2)
    INTO v_count, v_total
  FROM jsonb_to_recordset(p_items) AS i(product_id uuid, quantity_ordered numeric, unit_cost numeric);
  IF v_count = 0 OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_items) AS i(product_id uuid, quantity_ordered numeric, unit_cost numeric)
    WHERE i.product_id IS NULL OR i.quantity_ordered IS NULL OR i.quantity_ordered <= 0
      OR i.unit_cost IS NULL OR i.unit_cost < 0
  ) THEN RAISE EXCEPTION 'invalid_purchase_items'; END IF;
  IF EXISTS (
    SELECT i.product_id FROM jsonb_to_recordset(p_items) AS i(product_id uuid, quantity_ordered numeric, unit_cost numeric)
    GROUP BY i.product_id HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'duplicate_purchase_product'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_items) AS i(product_id uuid, quantity_ordered numeric, unit_cost numeric)
    LEFT JOIN public.products p ON p.id = i.product_id AND p.organization_id = p_organization_id
    WHERE p.id IS NULL
  ) THEN RAISE EXCEPTION 'product_not_available'; END IF;

  v_number := 'PO-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  INSERT INTO public.purchase_orders(organization_id,supplier_id,warehouse_id,purchase_number,status,notes,total_amount,created_by,ordered_at)
  VALUES(p_organization_id,p_supplier_id,p_warehouse_id,v_number,'ordered',NULLIF(trim(p_notes),''),COALESCE(v_total,0),v_user_id,now())
  RETURNING id INTO v_purchase_id;

  INSERT INTO public.purchase_order_items(purchase_order_id,product_id,quantity_ordered,unit_cost,line_total)
  SELECT v_purchase_id, i.product_id, i.quantity_ordered, i.unit_cost, round((i.quantity_ordered*i.unit_cost)::numeric,2)
  FROM jsonb_to_recordset(p_items) AS i(product_id uuid, quantity_ordered numeric, unit_cost numeric);

  RETURN v_purchase_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_organization_id uuid, p_purchase_order_id uuid, p_warehouse_id uuid, p_items jsonb, p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_po public.purchase_orders%ROWTYPE;
  v_receipt_id uuid;
  v_receipt_number text;
  v_item record;
  v_product_id uuid;
  v_unit_cost numeric(14,4);
  v_balance numeric(15,3);
  v_next_received numeric(15,3);
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om WHERE om.organization_id = p_organization_id
      AND om.user_id = v_user_id AND om.status = 'active' AND om.role IN ('owner','admin')
  ) THEN RAISE EXCEPTION 'receiving_forbidden'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'receipt_items_required'; END IF;

  SELECT * INTO v_po FROM public.purchase_orders po
  WHERE po.id = p_purchase_order_id AND po.organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND OR v_po.status NOT IN ('ordered','partially_received') THEN RAISE EXCEPTION 'purchase_order_not_receivable'; END IF;
  IF p_warehouse_id <> v_po.warehouse_id THEN RAISE EXCEPTION 'receipt_warehouse_must_match_purchase_order'; END IF;
  IF EXISTS (
    SELECT x.purchase_order_item_id
    FROM jsonb_to_recordset(p_items) AS x(purchase_order_item_id uuid, quantity numeric)
    GROUP BY x.purchase_order_item_id HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'duplicate_receipt_item'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_items) AS x(purchase_order_item_id uuid, quantity numeric)
    LEFT JOIN public.purchase_order_items poi ON poi.id = x.purchase_order_item_id AND poi.purchase_order_id = p_purchase_order_id
    WHERE poi.id IS NULL OR x.quantity IS NULL OR x.quantity <= 0
  ) THEN RAISE EXCEPTION 'invalid_receipt_item'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = p_warehouse_id AND w.organization_id = p_organization_id AND w.is_active) THEN
    RAISE EXCEPTION 'warehouse_not_available';
  END IF;
  SELECT p.id INTO v_profile_id FROM public.profiles p WHERE p.auth_user_id = v_user_id LIMIT 1;

  v_receipt_number := 'GR-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  INSERT INTO public.goods_receipts(organization_id,purchase_order_id,warehouse_id,receipt_number,status,notes,received_by)
  VALUES(p_organization_id,p_purchase_order_id,p_warehouse_id,v_receipt_number,'posted',NULLIF(trim(p_notes),''),v_user_id)
  RETURNING id INTO v_receipt_id;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(purchase_order_item_id uuid, quantity numeric) LOOP
    IF v_item.purchase_order_item_id IS NULL OR v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'invalid_receipt_item';
    END IF;
    PERFORM 1 FROM public.purchase_order_items poi
      WHERE poi.id = v_item.purchase_order_item_id AND poi.purchase_order_id = p_purchase_order_id
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'purchase_item_not_found'; END IF;

    UPDATE public.purchase_order_items poi
    SET quantity_received = poi.quantity_received + v_item.quantity
    WHERE poi.id = v_item.purchase_order_item_id
      AND poi.quantity_received + v_item.quantity <= poi.quantity_ordered
    RETURNING poi.quantity_received INTO v_next_received;
    IF NOT FOUND THEN RAISE EXCEPTION 'received_quantity_exceeds_ordered'; END IF;

    SELECT poi.product_id, poi.unit_cost INTO v_product_id, v_unit_cost
      FROM public.purchase_order_items poi WHERE poi.id = v_item.purchase_order_item_id;
    INSERT INTO public.goods_receipt_items(goods_receipt_id,purchase_order_item_id,product_id,quantity_received,unit_cost)
      VALUES(v_receipt_id,v_item.purchase_order_item_id,v_product_id,v_item.quantity,v_unit_cost);

    INSERT INTO public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,last_movement_at)
      VALUES(v_product_id,p_warehouse_id,v_item.quantity,0,now())
      ON CONFLICT(product_id,warehouse_id) DO UPDATE
      SET quantity_on_hand = public.inventory_balances.quantity_on_hand + EXCLUDED.quantity_on_hand,
          last_movement_at = now(), updated_at = now()
      RETURNING quantity_on_hand INTO v_balance;

    INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by)
      VALUES(v_product_id,p_warehouse_id,'purchase_receipt',v_item.quantity,v_balance,'goods_receipt',v_receipt_id,'استلام أمر شراء',v_profile_id);
  END LOOP;

  UPDATE public.purchase_orders po
  SET status = CASE
      WHEN NOT EXISTS (SELECT 1 FROM public.purchase_order_items i WHERE i.purchase_order_id = po.id AND i.quantity_received < i.quantity_ordered) THEN 'received'
      ELSE 'partially_received'
    END,
    received_at = CASE WHEN NOT EXISTS (SELECT 1 FROM public.purchase_order_items i WHERE i.purchase_order_id = po.id AND i.quantity_received < i.quantity_ordered) THEN now() ELSE po.received_at END,
    updated_at = now()
  WHERE po.id = p_purchase_order_id;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
  VALUES(p_organization_id,v_profile_id,'goods_receipt_posted','goods_receipt',v_receipt_id,
         jsonb_build_object('purchase_order_id',p_purchase_order_id,'receipt_number',v_receipt_number));

  RETURN v_receipt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_inventory_transfer(
  p_organization_id uuid, p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_items jsonb, p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_transfer_id uuid;
  v_number text;
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id=p_organization_id
    AND om.user_id=v_user_id AND om.status='active' AND om.role IN ('owner','admin')) THEN
    RAISE EXCEPTION 'inventory_transfer_forbidden';
  END IF;
  IF p_from_warehouse_id = p_to_warehouse_id THEN RAISE EXCEPTION 'transfer_warehouses_must_differ'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id=p_from_warehouse_id AND w.organization_id=p_organization_id AND w.is_active)
     OR NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id=p_to_warehouse_id AND w.organization_id=p_organization_id AND w.is_active) THEN
    RAISE EXCEPTION 'warehouse_not_available';
  END IF;
  IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'transfer_items_required'; END IF;
  SELECT count(*) INTO v_count FROM jsonb_to_recordset(p_items) AS i(product_id uuid, quantity numeric);
  IF v_count=0 OR EXISTS (SELECT 1 FROM jsonb_to_recordset(p_items) AS i(product_id uuid, quantity numeric)
    WHERE i.product_id IS NULL OR i.quantity IS NULL OR i.quantity<=0) THEN RAISE EXCEPTION 'invalid_transfer_items'; END IF;
  IF EXISTS (SELECT i.product_id FROM jsonb_to_recordset(p_items) AS i(product_id uuid, quantity numeric) GROUP BY i.product_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'duplicate_transfer_product';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_items) AS i(product_id uuid, quantity numeric)
    LEFT JOIN public.products p ON p.id=i.product_id AND p.organization_id=p_organization_id WHERE p.id IS NULL) THEN
    RAISE EXCEPTION 'product_not_available';
  END IF;
  v_number := 'TR-' || to_char(clock_timestamp(),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  INSERT INTO public.inventory_transfers(organization_id,from_warehouse_id,to_warehouse_id,transfer_number,status,notes,created_by)
  VALUES(p_organization_id,p_from_warehouse_id,p_to_warehouse_id,v_number,'draft',NULLIF(trim(p_notes),''),v_user_id)
  RETURNING id INTO v_transfer_id;
  INSERT INTO public.inventory_transfer_items(transfer_id,product_id,quantity)
  SELECT v_transfer_id,i.product_id,i.quantity FROM jsonb_to_recordset(p_items) AS i(product_id uuid, quantity numeric);
  RETURN v_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_inventory_transfer(p_organization_id uuid, p_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_transfer public.inventory_transfers%ROWTYPE;
  v_item record;
  v_source_balance numeric(15,3);
  v_target_balance numeric(15,3);
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id=p_organization_id
    AND om.user_id=v_user_id AND om.status='active' AND om.role IN ('owner','admin')) THEN
    RAISE EXCEPTION 'inventory_transfer_forbidden';
  END IF;
  SELECT * INTO v_transfer FROM public.inventory_transfers t
    WHERE t.id=p_transfer_id AND t.organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND OR v_transfer.status<>'draft' THEN RAISE EXCEPTION 'transfer_not_draft'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.inventory_transfer_items ti
    JOIN public.products p ON p.id = ti.product_id
    WHERE ti.transfer_id = p_transfer_id AND p.organization_id <> p_organization_id
  ) THEN RAISE EXCEPTION 'transfer_product_outside_organization'; END IF;
  SELECT p.id INTO v_profile_id FROM public.profiles p WHERE p.auth_user_id=v_user_id LIMIT 1;

  FOR v_item IN SELECT product_id,quantity FROM public.inventory_transfer_items WHERE transfer_id=p_transfer_id ORDER BY product_id LOOP
    PERFORM 1 FROM public.inventory_balances b WHERE b.product_id=v_item.product_id AND b.warehouse_id=v_transfer.from_warehouse_id FOR UPDATE;
    SELECT b.quantity_on_hand - b.quantity_reserved INTO v_source_balance FROM public.inventory_balances b
      WHERE b.product_id=v_item.product_id AND b.warehouse_id=v_transfer.from_warehouse_id;
    IF v_source_balance IS NULL OR v_source_balance < v_item.quantity THEN RAISE EXCEPTION 'insufficient_available_stock'; END IF;

    UPDATE public.inventory_balances SET quantity_on_hand=quantity_on_hand-v_item.quantity,last_movement_at=now(),updated_at=now()
      WHERE product_id=v_item.product_id AND warehouse_id=v_transfer.from_warehouse_id
      RETURNING quantity_on_hand INTO v_source_balance;
    INSERT INTO public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,last_movement_at)
      VALUES(v_item.product_id,v_transfer.to_warehouse_id,v_item.quantity,0,now())
      ON CONFLICT(product_id,warehouse_id) DO UPDATE
      SET quantity_on_hand=public.inventory_balances.quantity_on_hand+EXCLUDED.quantity_on_hand,last_movement_at=now(),updated_at=now()
      RETURNING quantity_on_hand INTO v_target_balance;

    INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by)
      VALUES(v_item.product_id,v_transfer.from_warehouse_id,'transfer_out',-v_item.quantity,v_source_balance,'inventory_transfer',p_transfer_id,'تحويل مخزون صادر',v_profile_id),
            (v_item.product_id,v_transfer.to_warehouse_id,'transfer_in',v_item.quantity,v_target_balance,'inventory_transfer',p_transfer_id,'تحويل مخزون وارد',v_profile_id);
  END LOOP;
  UPDATE public.inventory_transfers SET status='posted',posted_at=now() WHERE id=p_transfer_id;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
    VALUES(p_organization_id,v_profile_id,'inventory_transfer_posted','inventory_transfer',p_transfer_id,
           jsonb_build_object('from_warehouse_id',v_transfer.from_warehouse_id,'to_warehouse_id',v_transfer.to_warehouse_id));
  RETURN jsonb_build_object('transfer_id',p_transfer_id,'status','posted');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_stock_count(
  p_organization_id uuid, p_warehouse_id uuid, p_items jsonb, p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count_id uuid;
  v_number text;
  v_item record;
  v_system_quantity numeric(15,3);
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id=p_organization_id
    AND om.user_id=v_user_id AND om.status='active' AND om.role IN ('owner','admin')) THEN
    RAISE EXCEPTION 'stock_count_forbidden';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id=p_warehouse_id AND w.organization_id=p_organization_id AND w.is_active) THEN
    RAISE EXCEPTION 'warehouse_not_available';
  END IF;
  IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'count_items_required'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_items) AS i(product_id uuid,counted_quantity numeric)
     WHERE i.product_id IS NULL OR i.counted_quantity IS NULL OR i.counted_quantity<0) THEN
    RAISE EXCEPTION 'invalid_count_items';
  END IF;
  IF EXISTS (SELECT i.product_id FROM jsonb_to_recordset(p_items) AS i(product_id uuid,counted_quantity numeric)
     GROUP BY i.product_id HAVING count(*)>1) THEN RAISE EXCEPTION 'duplicate_count_product'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_items) AS i(product_id uuid,counted_quantity numeric)
    LEFT JOIN public.products p ON p.id=i.product_id AND p.organization_id=p_organization_id WHERE p.id IS NULL) THEN
    RAISE EXCEPTION 'product_not_available';
  END IF;
  v_number := 'SC-' || to_char(clock_timestamp(),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  INSERT INTO public.stock_counts(organization_id,warehouse_id,count_number,status,notes,created_by)
    VALUES(p_organization_id,p_warehouse_id,v_number,'draft',NULLIF(trim(p_notes),''),v_user_id) RETURNING id INTO v_count_id;
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS i(product_id uuid,counted_quantity numeric) LOOP
    SELECT b.quantity_on_hand INTO v_system_quantity FROM public.inventory_balances b
      WHERE b.product_id=v_item.product_id AND b.warehouse_id=p_warehouse_id;
    INSERT INTO public.stock_count_items(stock_count_id,product_id,system_quantity,counted_quantity)
      VALUES(v_count_id,v_item.product_id,COALESCE(v_system_quantity,0),v_item.counted_quantity);
  END LOOP;
  RETURN v_count_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_stock_count(p_organization_id uuid,p_stock_count_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_count public.stock_counts%ROWTYPE;
  v_item record;
  v_current numeric(15,3);
  v_reserved numeric(15,3);
  v_delta numeric(15,3);
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id=p_organization_id
    AND om.user_id=v_user_id AND om.status='active' AND om.role IN ('owner','admin')) THEN
    RAISE EXCEPTION 'stock_count_forbidden';
  END IF;
  SELECT * INTO v_count FROM public.stock_counts sc WHERE sc.id=p_stock_count_id AND sc.organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND OR v_count.status<>'draft' THEN RAISE EXCEPTION 'stock_count_not_draft'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.stock_count_items sci
    JOIN public.products p ON p.id = sci.product_id
    WHERE sci.stock_count_id = p_stock_count_id AND p.organization_id <> p_organization_id
  ) THEN RAISE EXCEPTION 'count_product_outside_organization'; END IF;
  SELECT p.id INTO v_profile_id FROM public.profiles p WHERE p.auth_user_id=v_user_id LIMIT 1;

  FOR v_item IN SELECT * FROM public.stock_count_items WHERE stock_count_id=p_stock_count_id ORDER BY product_id LOOP
    PERFORM 1 FROM public.inventory_balances b WHERE b.product_id=v_item.product_id AND b.warehouse_id=v_count.warehouse_id FOR UPDATE;
    SELECT b.quantity_on_hand,b.quantity_reserved INTO v_current,v_reserved FROM public.inventory_balances b
      WHERE b.product_id=v_item.product_id AND b.warehouse_id=v_count.warehouse_id;
    v_current := COALESCE(v_current,0); v_reserved := COALESCE(v_reserved,0);
    IF v_current <> v_item.system_quantity THEN RAISE EXCEPTION 'stock_changed_since_count'; END IF;
    IF v_item.counted_quantity < v_reserved THEN RAISE EXCEPTION 'count_below_reserved_quantity'; END IF;
    v_delta := v_item.counted_quantity-v_current;
    INSERT INTO public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,last_movement_at)
      VALUES(v_item.product_id,v_count.warehouse_id,v_item.counted_quantity,0,now())
      ON CONFLICT(product_id,warehouse_id) DO UPDATE
      SET quantity_on_hand=EXCLUDED.quantity_on_hand,last_movement_at=now(),updated_at=now();
    IF v_delta <> 0 THEN
      INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by)
        VALUES(v_item.product_id,v_count.warehouse_id,'count_adjustment',v_delta,v_item.counted_quantity,'stock_count',p_stock_count_id,'تسوية جرد مخزني',v_profile_id);
    END IF;
  END LOOP;
  UPDATE public.stock_counts SET status='posted',posted_at=now() WHERE id=p_stock_count_id;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
    VALUES(p_organization_id,v_profile_id,'stock_count_posted','stock_count',p_stock_count_id,jsonb_build_object('warehouse_id',v_count.warehouse_id));
  RETURN jsonb_build_object('stock_count_id',p_stock_count_id,'status','posted');
END;
$$;

CREATE OR REPLACE FUNCTION public.record_expense(
  p_organization_id uuid,p_category text,p_description text,p_amount numeric,p_currency text DEFAULT 'USD',p_expense_date date DEFAULT current_date
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user_id uuid := auth.uid(); v_expense_id uuid; v_number text; v_profile_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id=p_organization_id
    AND om.user_id=v_user_id AND om.status='active' AND om.role IN ('owner','admin')) THEN RAISE EXCEPTION 'expense_forbidden'; END IF;
  IF NULLIF(trim(p_category),'') IS NULL OR NULLIF(trim(p_description),'') IS NULL OR p_amount IS NULL OR p_amount<=0 THEN
    RAISE EXCEPTION 'invalid_expense';
  END IF;
  SELECT p.id INTO v_profile_id FROM public.profiles p WHERE p.auth_user_id=v_user_id LIMIT 1;
  v_number := 'EX-' || to_char(clock_timestamp(),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  INSERT INTO public.expenses(organization_id,expense_number,category,description,amount,currency,expense_date,created_by)
  VALUES(p_organization_id,v_number,trim(p_category),trim(p_description),p_amount,COALESCE(NULLIF(trim(p_currency),''),'USD'),COALESCE(p_expense_date,current_date),v_user_id)
  RETURNING id INTO v_expense_id;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
  VALUES(p_organization_id,v_profile_id,'expense_recorded','expense',v_expense_id,jsonb_build_object('amount',p_amount,'currency',p_currency));
  RETURN v_expense_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_order(uuid,uuid,uuid,jsonb,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid,uuid,uuid,jsonb,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_inventory_transfer(uuid,uuid,uuid,jsonb,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_inventory_transfer(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_stock_count(uuid,uuid,jsonb,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_stock_count(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_expense(uuid,text,text,numeric,text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order(uuid,uuid,uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid,uuid,uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_inventory_transfer(uuid,uuid,uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_inventory_transfer(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_stock_count(uuid,uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_stock_count(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_expense(uuid,text,text,numeric,text,date) TO authenticated;

-- Only server-side RPCs may mutate operational records. This prevents callers from
-- bypassing receipt/transfer/count validations or editing posted history through PostgREST.
REVOKE INSERT, UPDATE, DELETE ON public.purchase_orders, public.purchase_order_items,
  public.goods_receipts, public.goods_receipt_items, public.inventory_transfers,
  public.inventory_transfer_items, public.stock_counts, public.stock_count_items, public.expenses
FROM anon, authenticated;
GRANT SELECT ON public.purchase_orders, public.purchase_order_items, public.goods_receipts, public.goods_receipt_items,
  public.inventory_transfers, public.inventory_transfer_items, public.stock_counts, public.stock_count_items, public.expenses TO authenticated;

