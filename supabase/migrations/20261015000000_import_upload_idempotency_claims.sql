-- Server-side arbitration for file imports.
-- Historical upload rows are preserved; one canonical claim points at the newest row
-- for each tenant/profile/hash/period scope. The unique claim key safely serializes
-- concurrent requests even when period_start/period_end are NULL.

CREATE TABLE IF NOT EXISTS public.import_upload_claims (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.import_profiles(id) ON DELETE CASCADE,
  file_hash text NOT NULL CHECK (length(file_hash) = 64),
  period_key text NOT NULL,
  upload_id uuid REFERENCES public.import_uploads(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, profile_id, file_hash, period_key),
  UNIQUE (upload_id)
);

WITH keyed_uploads AS (
  SELECT
    u.organization_id,
    u.profile_id,
    lower(u.file_hash) AS file_hash,
    COALESCE(u.period_start::text, '~') || '|' || COALESCE(u.period_end::text, '~') AS period_key,
    u.id AS upload_id,
    u.uploaded_at
  FROM public.import_uploads u
),
canonical_uploads AS (
  SELECT DISTINCT ON (organization_id, profile_id, file_hash, period_key)
    organization_id, profile_id, file_hash, period_key, upload_id, uploaded_at
  FROM keyed_uploads
  ORDER BY organization_id, profile_id, file_hash, period_key, uploaded_at DESC, upload_id DESC
)
INSERT INTO public.import_upload_claims (
  organization_id, profile_id, file_hash, period_key, upload_id, created_at
)
SELECT organization_id, profile_id, file_hash, period_key, upload_id, uploaded_at
FROM canonical_uploads
ON CONFLICT (organization_id, profile_id, file_hash, period_key) DO NOTHING;

ALTER TABLE public.import_upload_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_upload_claims FROM PUBLIC, anon, authenticated;

-- Upload identity determines the idempotency key and cannot be edited after claim.
-- Browser roles may update processing metadata but cannot bypass the claim RPC to
-- create or delete upload history directly.
CREATE OR REPLACE FUNCTION public.guard_import_upload_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
     OR NEW.file_hash IS DISTINCT FROM OLD.file_hash
     OR NEW.period_start IS DISTINCT FROM OLD.period_start
     OR NEW.period_end IS DISTINCT FROM OLD.period_end
     OR NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at THEN
    RAISE EXCEPTION 'import_upload_identity_immutable';
  END IF;
  RETURN NEW;
END;
$;

REVOKE ALL ON FUNCTION public.guard_import_upload_identity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS import_upload_identity_immutable ON public.import_uploads;
CREATE TRIGGER import_upload_identity_immutable
BEFORE UPDATE ON public.import_uploads
FOR EACH ROW EXECUTE FUNCTION public.guard_import_upload_identity();

REVOKE INSERT, DELETE ON public.import_uploads FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_import_upload(
  p_organization_id uuid,
  p_profile_id uuid,
  p_file_name text,
  p_file_type text,
  p_file_size bigint,
  p_file_hash text,
  p_period_start date,
  p_period_end date,
  p_expires_at timestamptz,
  p_initial_status text,
  p_error_code text,
  p_error_message text
)
RETURNS TABLE (
  claimed_upload_id uuid,
  was_created boolean,
  stored_file_name text,
  stored_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_hash text := lower(trim(COALESCE(p_file_hash, '')));
  v_period_key text;
  v_created boolean := false;
  v_upload_id uuid;
  v_existing_upload_id uuid;
  v_existing_file_name text;
  v_existing_status text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = v_user_id
      AND om.status = 'active'
      AND om.role IN ('owner','admin')
  ) THEN
    RAISE EXCEPTION 'import_upload_forbidden';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.import_profiles ip
    WHERE ip.id = p_profile_id
      AND ip.organization_id = p_organization_id
      AND ip.status = 'active'
  ) THEN
    RAISE EXCEPTION 'import_profile_not_available';
  END IF;

  IF NULLIF(trim(COALESCE(p_file_name, '')), '') IS NULL OR length(p_file_name) > 512 THEN
    RAISE EXCEPTION 'invalid_import_file_name';
  END IF;
  IF p_file_type IS NULL OR lower(p_file_type) NOT IN ('csv','xlsx','xls','pdf') THEN
    RAISE EXCEPTION 'invalid_import_file_type';
  END IF;
  IF p_file_size IS NULL OR p_file_size <= 0 OR p_file_size > 104857600 THEN
    RAISE EXCEPTION 'invalid_import_file_size';
  END IF;
  IF v_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_import_file_hash'; END IF;
  IF (p_period_start IS NULL) <> (p_period_end IS NULL) THEN
    RAISE EXCEPTION 'import_period_requires_both_dates';
  END IF;
  IF p_period_start IS NOT NULL AND p_period_end < p_period_start THEN
    RAISE EXCEPTION 'invalid_import_period';
  END IF;
  IF p_initial_status IS NULL OR p_initial_status NOT IN ('staged','manual_review') THEN
    RAISE EXCEPTION 'invalid_initial_import_status';
  END IF;
  IF p_initial_status = 'manual_review'
     AND (p_error_code IS DISTINCT FROM 'PARSER_NOT_AVAILABLE' OR NULLIF(trim(COALESCE(p_error_message,'')), '') IS NULL) THEN
    RAISE EXCEPTION 'manual_review_requires_parser_notice';
  END IF;
  IF p_initial_status = 'staged' AND (p_error_code IS NOT NULL OR p_error_message IS NOT NULL) THEN
    RAISE EXCEPTION 'staged_import_cannot_carry_parser_error';
  END IF;

  v_period_key := COALESCE(p_period_start::text, '~') || '|' || COALESCE(p_period_end::text, '~');

  -- Reserve the key first. A competing transaction waits on the unique key and then
  -- observes the committed upload; if this transaction fails, its reservation rolls back.
  INSERT INTO public.import_upload_claims (
    organization_id, profile_id, file_hash, period_key, upload_id
  ) VALUES (
    p_organization_id, p_profile_id, v_hash, v_period_key, NULL
  )
  ON CONFLICT (organization_id, profile_id, file_hash, period_key) DO NOTHING
  RETURNING true INTO v_created;
  v_created := COALESCE(v_created, false);

  IF v_created THEN
    INSERT INTO public.import_uploads (
      organization_id, profile_id, file_name, file_type, file_size, file_hash,
      period_start, period_end, status, error_code, error_message, expires_at
    ) VALUES (
      p_organization_id, p_profile_id, trim(p_file_name), lower(p_file_type), p_file_size, v_hash,
      p_period_start, p_period_end, p_initial_status, p_error_code, p_error_message,
      COALESCE(p_expires_at, now() + interval '30 days')
    )
    RETURNING id INTO v_upload_id;

    UPDATE public.import_upload_claims c
    SET upload_id = v_upload_id
    WHERE c.organization_id = p_organization_id
      AND c.profile_id = p_profile_id
      AND c.file_hash = v_hash
      AND c.period_key = v_period_key
      AND c.upload_id IS NULL;

    IF NOT FOUND THEN RAISE EXCEPTION 'import_upload_claim_link_failed'; END IF;
    RETURN QUERY SELECT v_upload_id, true, trim(p_file_name), p_initial_status;
    RETURN;
  END IF;

  SELECT c.upload_id, u.file_name, u.status
    INTO v_existing_upload_id, v_existing_file_name, v_existing_status
  FROM public.import_upload_claims c
  JOIN public.import_uploads u ON u.id = c.upload_id
  WHERE c.organization_id = p_organization_id
    AND c.profile_id = p_profile_id
    AND c.file_hash = v_hash
    AND c.period_key = v_period_key
  FOR UPDATE OF c;

  IF NOT FOUND OR v_existing_upload_id IS NULL THEN
    RAISE EXCEPTION 'import_upload_claim_incomplete';
  END IF;

  RETURN QUERY SELECT v_existing_upload_id, false, v_existing_file_name, v_existing_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_failed_import_retry(
  p_organization_id uuid,
  p_upload_id uuid,
  p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_claimed_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = v_user_id
      AND om.status = 'active'
      AND om.role IN ('owner','admin')
  ) THEN
    RAISE EXCEPTION 'import_retry_forbidden';
  END IF;

  -- Compare-and-swap on the FAILED state: exactly one simultaneous retry may claim it.
  UPDATE public.import_uploads u
  SET status = 'detecting',
      error_code = NULL,
      error_message = NULL,
      snapshot = NULL,
      quality_score = NULL,
      quality_breakdown = '{}',
      completed_at = NULL,
      expires_at = COALESCE(p_expires_at, now() + interval '30 days')
  WHERE u.id = p_upload_id
    AND u.organization_id = p_organization_id
    AND u.status = 'failed'
    AND EXISTS (
      SELECT 1 FROM public.import_upload_claims c
      WHERE c.organization_id = u.organization_id
        AND c.profile_id = u.profile_id
        AND c.file_hash = lower(u.file_hash)
        AND c.upload_id = u.id
    )
  RETURNING u.id INTO v_claimed_id;

  RETURN v_claimed_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_import_upload(uuid, uuid, text, text, bigint, text, date, date, timestamptz, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_import_upload(uuid, uuid, text, text, bigint, text, date, date, timestamptz, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_failed_import_retry(uuid, uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_failed_import_retry(uuid, uuid, timestamptz) TO authenticated;
