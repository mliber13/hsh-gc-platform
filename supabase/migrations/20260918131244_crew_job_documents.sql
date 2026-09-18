-- Crew job documents: scope project_documents SELECT (the September sweep
-- missed this table) and grant crew read of plan/specification on jobs they
-- are assigned to or field-foreman of. Storage must match — the bucket is
-- private and the app mints a signed URL per open.
--
-- Follows 20260529120000_drywall_field_photos_bucket.sql (helper + path-ok +
-- pd_auth_*), but does NOT copy its org-wide crew read. A plan set is a
-- bigger leak than a site photo, and this path is not hot.
--
-- Not in this step: the eight GC layouts sitting in type = 'other' that would
-- want re-typing to 'plan' before crew reach GC jobs (schedule plan step 7).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Retype the 27 Main windows-and-doors quote. Typed 'plan', is a supplier
--    quote. Unreachable by crew today (GC job); armed once step 7 puts crew
--    on GC jobs.
-- ---------------------------------------------------------------------------
UPDATE public.project_documents
SET type = 'other'
WHERE type = 'plan'
  AND name ILIKE '%14664989%';

-- ---------------------------------------------------------------------------
-- 2. Table SELECT — org member and (not pure crew or the §1 rule).
--    Same two carve-outs as 20260911120000_crew_read_scoping:
--      user_can_edit()        — ['crew','office_drywall'] is an operator
--      user_is_field_foreman() — Jeremy is a foreman with no Lisbon assignment
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view documents in their organization" ON public.project_documents;
CREATE POLICY "Users can view documents in their organization" ON public.project_documents
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND (
      NOT public.user_has_crew_role()
      OR public.user_can_edit()
      OR (
        (public.user_is_field_foreman() OR public.crew_is_assigned_to_project(project_id))
        AND type IN ('plan', 'specification')
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Storage helpers — photos shape, document-scoped read.
--    Path: {orgId}/{projectId}/{epochMs}-{filename}
--    Type is not in the path, so crew read resolves the project_documents row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.project_document_path_ok(p_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    split_part(p_object_name, '/', 1) <> ''
    AND split_part(p_object_name, '/', 2) <> ''
    AND split_part(p_object_name, '/', 3) <> ''
    AND EXISTS (
      SELECT 1
      FROM public.projects pr
      WHERE pr.id::text = split_part(p_object_name, '/', 2)
        AND pr.organization_id::text = split_part(p_object_name, '/', 1)
    );
$$;

COMMENT ON FUNCTION public.project_document_path_ok(text) IS
  'True when a project-documents object name is {org}/{project}/{file} and that project belongs to that org. Fail-closed on a malformed path.';

CREATE OR REPLACE FUNCTION public.user_can_access_project_documents(
  p_org_id_text text,
  p_for_write boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.organization_id::text = p_org_id_text
      AND public.is_user_active()
      AND (
        CASE
          WHEN p_for_write THEN
            public.user_can_edit()
          ELSE
            -- Operators and viewers: org-wide read. Pure crew does not pass
            -- here — they go through crew_can_read_project_document.
            NOT public.user_has_crew_role()
            OR public.user_can_edit()
        END
      )
  );
$$;

COMMENT ON FUNCTION public.user_can_access_project_documents(text, boolean) IS
  'project-documents bucket: write is user_can_edit() in the org. Read is org members who are not pure crew. Crew reads go through crew_can_read_project_document.';

CREATE OR REPLACE FUNCTION public.crew_can_read_project_document(p_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Resolve the row by file_path. Legacy uploads stored the path only inside
  -- file_url (file_path IS NULL); match that too so crew can still open them.
  SELECT
    public.project_document_path_ok(p_object_name)
    AND (
      public.user_is_field_foreman()
      OR EXISTS (
        SELECT 1
        FROM public.projects pr
        WHERE pr.id::text = split_part(p_object_name, '/', 2)
          AND public.crew_is_assigned_to_project(pr.id)
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.project_documents d
      WHERE d.organization_id::text = split_part(p_object_name, '/', 1)
        AND d.project_id::text = split_part(p_object_name, '/', 2)
        AND d.type IN ('plan', 'specification')
        AND (
          d.file_path = p_object_name
          OR position(p_object_name IN coalesce(d.file_url, '')) > 0
        )
    );
$$;

COMMENT ON FUNCTION public.crew_can_read_project_document(text) IS
  'True when a pure-crew caller may read this project-documents object: field foreman or assigned to the project in path segment 2, and the matching project_documents row is type plan or specification.';

DROP POLICY IF EXISTS pd_auth_select_org ON storage.objects;
DROP POLICY IF EXISTS pd_auth_insert_org ON storage.objects;
DROP POLICY IF EXISTS pd_auth_update_org ON storage.objects;
DROP POLICY IF EXISTS pd_auth_delete_org ON storage.objects;

CREATE POLICY pd_auth_select_org ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'project-documents'
  AND public.project_document_path_ok(name)
  AND (
    public.user_can_access_project_documents(split_part(name, '/', 1), false)
    OR public.crew_can_read_project_document(name)
  )
);

CREATE POLICY pd_auth_insert_org ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'project-documents'
  AND public.user_can_access_project_documents(split_part(name, '/', 1), true)
  AND public.project_document_path_ok(name)
);

CREATE POLICY pd_auth_update_org ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'project-documents'
  AND public.user_can_access_project_documents(split_part(name, '/', 1), true)
  AND public.project_document_path_ok(name)
)
WITH CHECK (
  bucket_id = 'project-documents'
  AND public.user_can_access_project_documents(split_part(name, '/', 1), true)
  AND public.project_document_path_ok(name)
);

CREATE POLICY pd_auth_delete_org ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'project-documents'
  AND public.user_can_access_project_documents(split_part(name, '/', 1), true)
  AND public.project_document_path_ok(name)
);

COMMIT;
