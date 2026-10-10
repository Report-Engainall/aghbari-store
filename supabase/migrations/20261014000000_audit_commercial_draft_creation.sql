-- Record creation of commercial drafts so the integrated operational assistant can observe
-- the start of purchasing, transfer and stock-count workflows.
-- This is metadata-only: no notes, item lines, credentials or free-form payloads are copied.
-- Trigger writes are atomic with the original insert and add no client-side write path.

CREATE OR REPLACE FUNCTION public.audit_commercial_draft_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row jsonb := to_jsonb(NEW);
  v_actor_profile_id uuid;
  v_action text;
  v_entity_type text;
  v_safe_metadata jsonb;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'purchase_orders' THEN
      v_action := 'purchase_order_created';
      v_entity_type := 'purchase_order';
      v_safe_metadata := jsonb_build_object(
        'purchase_number', v_row->>'purchase_number',
        'status', v_row->>'status',
        'supplier_id', v_row->>'supplier_id',
        'warehouse_id', v_row->>'warehouse_id',
        'total_amount', v_row->'total_amount',
        'currency', v_row->>'currency'
      );
    WHEN 'inventory_transfers' THEN
      v_action := 'inventory_transfer_created';
      v_entity_type := 'inventory_transfer';
      v_safe_metadata := jsonb_build_object(
        'transfer_number', v_row->>'transfer_number',
        'status', v_row->>'status',
        'from_warehouse_id', v_row->>'from_warehouse_id',
        'to_warehouse_id', v_row->>'to_warehouse_id'
      );
    WHEN 'stock_counts' THEN
      v_action := 'stock_count_created';
      v_entity_type := 'stock_count';
      v_safe_metadata := jsonb_build_object(
        'count_number', v_row->>'count_number',
        'status', v_row->>'status',
        'warehouse_id', v_row->>'warehouse_id'
      );
    ELSE
      RAISE EXCEPTION 'unsupported_commercial_audit_table';
  END CASE;

  SELECT p.id
    INTO v_actor_profile_id
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, new_value
  ) VALUES (
    (v_row->>'organization_id')::uuid,
    v_actor_profile_id,
    v_action,
    v_entity_type,
    (v_row->>'id')::uuid,
    v_safe_metadata
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_commercial_draft_creation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_purchase_order_creation ON public.purchase_orders;
CREATE TRIGGER audit_purchase_order_creation
AFTER INSERT ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.audit_commercial_draft_creation();

DROP TRIGGER IF EXISTS audit_inventory_transfer_creation ON public.inventory_transfers;
CREATE TRIGGER audit_inventory_transfer_creation
AFTER INSERT ON public.inventory_transfers
FOR EACH ROW EXECUTE FUNCTION public.audit_commercial_draft_creation();

DROP TRIGGER IF EXISTS audit_stock_count_creation ON public.stock_counts;
CREATE TRIGGER audit_stock_count_creation
AFTER INSERT ON public.stock_counts
FOR EACH ROW EXECUTE FUNCTION public.audit_commercial_draft_creation();
