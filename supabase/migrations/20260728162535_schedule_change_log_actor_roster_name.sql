-- Fix schedule change-log actor names for crew/foreman (no profiles.full_name).
-- Resolve: full_name → org_team roster name → email → NULL.
-- Backfill rows that stored email (or NULL). Do NOT apply to prod until reviewed.

BEGIN;

CREATE OR REPLACE FUNCTION public.log_schedule_item_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_changes jsonb := '{}'::jsonb;
  v_row public.schedule_items%ROWTYPE;
  v_action text;
BEGIN
  -- auth.uid() is the JWT caller even when this fires from a SECURITY DEFINER RPC
  -- (e.g. foreman_apply_schedule_changes). Attribution stays with the foreman/operator.
  IF v_uid IS NOT NULL THEN
    SELECT COALESCE(
      NULLIF(trim(p.full_name), ''),
      (
        SELECT NULLIF(trim(elem->>'name'), '')
        FROM public.org_team ot,
             LATERAL (
               SELECT e AS elem
               FROM jsonb_array_elements(COALESCE(ot.payload->'employees', '[]'::jsonb)) AS e
               UNION ALL
               SELECT c AS elem
               FROM jsonb_array_elements(COALESCE(ot.payload->'contractors1099', '[]'::jsonb)) AS c
             ) roster
        WHERE ot.organization_id = p.organization_id
          AND NULLIF(trim(COALESCE(p.linked_employee_id, p.linked_contractor_id)), '') IS NOT NULL
          AND elem->>'id' = COALESCE(p.linked_employee_id, p.linked_contractor_id)
        LIMIT 1
      ),
      NULLIF(trim(p.email), '')
    )
    INTO v_name
    FROM public.profiles p
    WHERE p.id = v_uid;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
    v_row := NEW;
    v_changes := jsonb_build_object(
      'name', jsonb_build_object('old', null, 'new', to_jsonb(NEW.name)),
      'type', jsonb_build_object('old', null, 'new', to_jsonb(NEW.type)),
      'start_date', jsonb_build_object('old', null, 'new', to_jsonb(NEW.start_date)),
      'end_date', jsonb_build_object('old', null, 'new', to_jsonb(NEW.end_date)),
      'duration', jsonb_build_object('old', null, 'new', to_jsonb(NEW.duration)),
      'status', jsonb_build_object('old', null, 'new', to_jsonb(NEW.status)),
      'assigned_persons', jsonb_build_object('old', null, 'new', to_jsonb(NEW.assigned_persons)),
      'predecessor_ids', jsonb_build_object('old', null, 'new', to_jsonb(NEW.predecessor_ids)),
      'predecessors', jsonb_build_object('old', null, 'new', COALESCE(NEW.predecessors, '[]'::jsonb)),
      'lead_person_ids', jsonb_build_object('old', null, 'new', to_jsonb(NEW.lead_person_ids)),
      'supplier_id', jsonb_build_object('old', null, 'new', to_jsonb(NEW.supplier_id))
    );

  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'deleted';
    v_row := OLD;
    v_changes := jsonb_build_object(
      'name', jsonb_build_object('old', to_jsonb(OLD.name), 'new', null),
      'type', jsonb_build_object('old', to_jsonb(OLD.type), 'new', null),
      'start_date', jsonb_build_object('old', to_jsonb(OLD.start_date), 'new', null),
      'end_date', jsonb_build_object('old', to_jsonb(OLD.end_date), 'new', null),
      'duration', jsonb_build_object('old', to_jsonb(OLD.duration), 'new', null),
      'status', jsonb_build_object('old', to_jsonb(OLD.status), 'new', null),
      'assigned_persons', jsonb_build_object('old', to_jsonb(OLD.assigned_persons), 'new', null),
      'predecessor_ids', jsonb_build_object('old', to_jsonb(OLD.predecessor_ids), 'new', null),
      'predecessors', jsonb_build_object('old', COALESCE(OLD.predecessors, '[]'::jsonb), 'new', null),
      'lead_person_ids', jsonb_build_object('old', to_jsonb(OLD.lead_person_ids), 'new', null),
      'supplier_id', jsonb_build_object('old', to_jsonb(OLD.supplier_id), 'new', null)
    );

  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'updated';
    v_row := NEW;

    IF OLD.name IS DISTINCT FROM NEW.name THEN
      v_changes := v_changes || jsonb_build_object(
        'name', jsonb_build_object('old', to_jsonb(OLD.name), 'new', to_jsonb(NEW.name))
      );
    END IF;
    IF OLD.type IS DISTINCT FROM NEW.type THEN
      v_changes := v_changes || jsonb_build_object(
        'type', jsonb_build_object('old', to_jsonb(OLD.type), 'new', to_jsonb(NEW.type))
      );
    END IF;
    IF OLD.start_date IS DISTINCT FROM NEW.start_date THEN
      v_changes := v_changes || jsonb_build_object(
        'start_date', jsonb_build_object('old', to_jsonb(OLD.start_date), 'new', to_jsonb(NEW.start_date))
      );
    END IF;
    IF OLD.end_date IS DISTINCT FROM NEW.end_date THEN
      v_changes := v_changes || jsonb_build_object(
        'end_date', jsonb_build_object('old', to_jsonb(OLD.end_date), 'new', to_jsonb(NEW.end_date))
      );
    END IF;
    IF OLD.duration IS DISTINCT FROM NEW.duration THEN
      v_changes := v_changes || jsonb_build_object(
        'duration', jsonb_build_object('old', to_jsonb(OLD.duration), 'new', to_jsonb(NEW.duration))
      );
    END IF;
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_changes := v_changes || jsonb_build_object(
        'status', jsonb_build_object('old', to_jsonb(OLD.status), 'new', to_jsonb(NEW.status))
      );
    END IF;
    IF OLD.assigned_persons IS DISTINCT FROM NEW.assigned_persons THEN
      v_changes := v_changes || jsonb_build_object(
        'assigned_persons',
        jsonb_build_object('old', to_jsonb(OLD.assigned_persons), 'new', to_jsonb(NEW.assigned_persons))
      );
    END IF;
    IF OLD.predecessor_ids IS DISTINCT FROM NEW.predecessor_ids THEN
      v_changes := v_changes || jsonb_build_object(
        'predecessor_ids',
        jsonb_build_object('old', to_jsonb(OLD.predecessor_ids), 'new', to_jsonb(NEW.predecessor_ids))
      );
    END IF;
    IF OLD.predecessors IS DISTINCT FROM NEW.predecessors THEN
      v_changes := v_changes || jsonb_build_object(
        'predecessors',
        jsonb_build_object(
          'old', COALESCE(OLD.predecessors, '[]'::jsonb),
          'new', COALESCE(NEW.predecessors, '[]'::jsonb)
        )
      );
    END IF;
    IF OLD.lead_person_ids IS DISTINCT FROM NEW.lead_person_ids THEN
      v_changes := v_changes || jsonb_build_object(
        'lead_person_ids',
        jsonb_build_object('old', to_jsonb(OLD.lead_person_ids), 'new', to_jsonb(NEW.lead_person_ids))
      );
    END IF;
    IF OLD.supplier_id IS DISTINCT FROM NEW.supplier_id THEN
      v_changes := v_changes || jsonb_build_object(
        'supplier_id',
        jsonb_build_object('old', to_jsonb(OLD.supplier_id), 'new', to_jsonb(NEW.supplier_id))
      );
    END IF;

    -- No-op saves (e.g. only updated_at) — skip insert.
    IF v_changes = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
  ELSE
    RETURN NULL;
  END IF;

  INSERT INTO public.schedule_item_changes (
    schedule_item_id,
    project_id,
    organization_id,
    changed_by,
    changed_by_name,
    changed_at,
    action,
    item_name,
    txid,
    changes
  ) VALUES (
    v_row.id,
    v_row.project_id,
    v_row.organization_id,
    v_uid,
    v_name,
    now(),
    v_action,
    v_row.name,
    txid_current(),
    v_changes
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill rows that fell back to email (or NULL) using the same resolution order.
UPDATE public.schedule_item_changes sic
SET changed_by_name = resolved.display_name
FROM (
  SELECT
    p.id AS uid,
    COALESCE(
      NULLIF(trim(p.full_name), ''),
      (
        SELECT NULLIF(trim(elem->>'name'), '')
        FROM public.org_team ot,
             LATERAL (
               SELECT e AS elem
               FROM jsonb_array_elements(COALESCE(ot.payload->'employees', '[]'::jsonb)) AS e
               UNION ALL
               SELECT c AS elem
               FROM jsonb_array_elements(COALESCE(ot.payload->'contractors1099', '[]'::jsonb)) AS c
             ) roster
        WHERE ot.organization_id = p.organization_id
          AND NULLIF(trim(COALESCE(p.linked_employee_id, p.linked_contractor_id)), '') IS NOT NULL
          AND elem->>'id' = COALESCE(p.linked_employee_id, p.linked_contractor_id)
        LIMIT 1
      ),
      NULLIF(trim(p.email), '')
    ) AS display_name
  FROM public.profiles p
) resolved
WHERE sic.changed_by = resolved.uid
  AND sic.changed_by IS NOT NULL
  AND (sic.changed_by_name IS NULL OR sic.changed_by_name LIKE '%@%')
  AND resolved.display_name IS NOT NULL
  AND resolved.display_name IS DISTINCT FROM sic.changed_by_name;

COMMIT;
