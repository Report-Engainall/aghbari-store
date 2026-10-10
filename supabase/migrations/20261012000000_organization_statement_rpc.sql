-- Generate immutable, idempotent organization statement snapshots through a privileged RPC.
-- A statement is a snapshot for an explicitly bounded period; a repeated call returns the existing snapshot.

DROP POLICY IF EXISTS "stmt_select_org" ON public.statements;
CREATE POLICY "stmt_select_org" ON public.statements FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = statements.organization_id
    AND om.user_id = auth.uid()
    AND om.status = 'active'
));

-- Keep financial statement snapshots read-only to browser roles. Creation is RPC-only.
REVOKE INSERT, UPDATE, DELETE ON public.statements FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.generate_organization_statement(
  p_organization_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_statement_id uuid;
  v_statement_number text;
  v_opening_balance numeric(14,2) := 0;
  v_total_invoiced numeric(14,2) := 0;
  v_total_paid numeric(14,2) := 0;
  v_closing_balance numeric(14,2) := 0;
  v_actor_profile_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end THEN
    RAISE EXCEPTION 'invalid_statement_period';
  END IF;
  IF p_period_end - p_period_start > 366 THEN RAISE EXCEPTION 'statement_period_too_long'; END IF;

  -- Serialize generation for this organization to make repeated/parallel calls idempotent.
  PERFORM 1 FROM public.organizations o WHERE o.id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization_not_found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = v_user_id
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
  ) THEN RAISE EXCEPTION 'statement_generation_forbidden'; END IF;

  SELECT s.id INTO v_statement_id
  FROM public.statements s
  WHERE s.organization_id = p_organization_id
    AND s.period_start = p_period_start
    AND s.period_end = p_period_end
  LIMIT 1;
  IF v_statement_id IS NOT NULL THEN RETURN v_statement_id; END IF;

  SELECT COALESCE(SUM(i.total - COALESCE(i.paid_amount, 0)), 0)
    INTO v_opening_balance
  FROM public.invoices i
  WHERE i.organization_id = p_organization_id
    AND i.issue_date < p_period_start
    AND i.status <> 'cancelled';

  SELECT COALESCE(SUM(i.total), 0)
    INTO v_total_invoiced
  FROM public.invoices i
  WHERE i.organization_id = p_organization_id
    AND i.issue_date >= p_period_start
    AND i.issue_date <= p_period_end
    AND i.status <> 'cancelled';

  SELECT COALESCE(SUM(p.amount), 0)
    INTO v_total_paid
  FROM public.payments p
  WHERE p.organization_id = p_organization_id
    AND p.status = 'confirmed'
    AND p.paid_date >= p_period_start
    AND p.paid_date <= p_period_end;

  v_closing_balance := v_opening_balance + v_total_invoiced - v_total_paid;
  v_statement_number := 'STM-' || to_char(p_period_start, 'YYYYMMDD') || '-' ||
    to_char(p_period_end, 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.statements (
    statement_number, organization_id, period_start, period_end,
    opening_balance, closing_balance, total_invoiced, total_paid, status
  ) VALUES (
    v_statement_number, p_organization_id, p_period_start, p_period_end,
    v_opening_balance, v_closing_balance, v_total_invoiced, v_total_paid, 'generated'
  )
  RETURNING id INTO v_statement_id;

  SELECT p.id INTO v_actor_profile_id
  FROM public.profiles p
  WHERE p.auth_user_id = v_user_id
  LIMIT 1;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  ) VALUES (
    p_organization_id, v_actor_profile_id, 'statement.generated', 'statement', v_statement_id,
    NULL, jsonb_build_object(
      'period_start', p_period_start, 'period_end', p_period_end,
      'opening_balance', v_opening_balance, 'total_invoiced', v_total_invoiced,
      'total_paid', v_total_paid, 'closing_balance', v_closing_balance
    )
  );

  RETURN v_statement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_organization_statement(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_organization_statement(uuid, date, date) TO authenticated;
