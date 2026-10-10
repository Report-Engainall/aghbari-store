# Platform Administrator and Organization Approval

## Operating model

New company registrations are created with `organizations.status = 'pending'` and `organizations.is_active = false`. Their owner can read the submitted company details and correct the company name, but tenant catalog, customer, inventory, order and finance operations stay unavailable until approval.

Approval is a global platform permission, not an organization membership role. Tenant owners and ordinary tenant administrators cannot list or approve other organizations. Approval and rejection are performed through `list_pending_organizations()` and `review_organization(...)`; the review function updates both the status and active flag in one transaction and records the decision in `audit_logs`.

## Bootstrap the first platform administrator

1. Create the operator's user account through the normal sign-up flow and confirm the email address.
2. Apply and verify the repository database migrations before granting the global role.
3. In the trusted Supabase SQL Editor (never the public client), replace `operator@example.com` with that verified operator email and run:

```sql
DO $bootstrap_platform_admin$
DECLARE
  v_email text := lower('operator@example.com');
  v_user_id uuid;
  v_profile_id uuid;
  v_full_name text;
BEGIN
  SELECT u.id, COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), u.email)
    INTO v_user_id, v_full_name
  FROM auth.users u
  WHERE lower(u.email) = v_email
    AND u.email_confirmed_at IS NOT NULL;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'A confirmed Auth user with that email was not found';
  END IF;

  INSERT INTO public.profiles (auth_user_id, full_name, email, is_active)
  VALUES (v_user_id, COALESCE(v_full_name, v_email), v_email, true)
  ON CONFLICT (auth_user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        is_active = true,
        updated_at = pg_catalog.now()
  RETURNING id INTO v_profile_id;

  INSERT INTO public.user_roles (profile_id, role)
  SELECT v_profile_id, 'system_admin'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.profile_id = v_profile_id AND ur.role = 'system_admin'
  );
END
$bootstrap_platform_admin$;
```

The migration revokes client-side INSERT/UPDATE/DELETE on `user_roles`, so tenant administrators cannot grant themselves the global platform role. The bootstrap should be executed only by a trusted database operator and only for the intended platform administrator.

## Review workflow

After sign-in, a provisioned platform administrator is directed to **Platform → Organization approvals**. The queue only returns pending, inactive organizations. Approve activates the organization (`status = 'active'`, `is_active = true`); reject marks it inactive. Both decisions require the global platform role, lock the pending organization row during review, and write an audit record. Repeated review of a non-pending organization is rejected.

## Verification boundary

CI validates the database migration chain and the approval RPC under PostgreSQL 17. The live Supabase migration and a real browser/admin-account acceptance test must still be completed as separate release evidence. Do not expose a service-role key in the browser or commit it to this repository.
