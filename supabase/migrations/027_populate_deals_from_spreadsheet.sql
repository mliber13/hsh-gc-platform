-- ============================================================================
-- Migration: Populate Deals Table from Spreadsheet Data
-- ============================================================================
-- 
-- This migration populates the deals table with initial data from the
-- Excel spreadsheet provided.
--
-- IMPORTANT: Before running this migration, replace the placeholder UUID
-- '00000000-0000-0000-0000-000000000000' with your actual user UUID.
-- 
-- To find your UUID:
-- 1. Go to Supabase Dashboard > Authentication > Users
-- 2. Find your user and copy the UUID
-- OR
-- 3. Run: SELECT id FROM auth.users WHERE email = 'your-email@example.com';
--
-- Alternatively, you can use this query to get the first user's UUID:
-- SELECT id FROM auth.users LIMIT 1;
-- ============================================================================

-- Set the user UUID (REPLACE THIS WITH YOUR ACTUAL UUID)
DO $$
DECLARE
  v_user_uuid UUID;
  v_org_id TEXT := 'default-org';
  
  -- Deal IDs (will be populated as we insert)
  v_deal_1 UUID;
  v_deal_2 UUID;
  v_deal_3 UUID;
  v_deal_4 UUID;
  v_deal_5 UUID;
  v_deal_6 UUID;
  v_deal_7 UUID;
  v_deal_8 UUID;
BEGIN
  -- Get the first user's UUID (or replace with your specific UUID)
  SELECT id INTO v_user_uuid FROM auth.users LIMIT 1;
  
  -- If no user found, use placeholder (migration will fail but you'll know to set it)
  IF v_user_uuid IS NULL THEN
    RAISE EXCEPTION 'No user found. Please ensure you have at least one user in auth.users, or replace the UUID query above with your specific UUID.';
  END IF;

  -- ============================================================================
  -- INSERT DEALS
  -- ============================================================================

  -- Deal 1: Columbiana Maple St Development
  INSERT INTO deals (
    organization_id,
    deal_name,
    location,
    unit_count,
    type,
    projected_cost,
    estimated_duration_months,
    expected_start_date,
    status,
    contact,
    created_by
  ) VALUES (
    v_org_id,
    'Columbiana Maple St Development',
    'Columbiana, OH',
    63,
    'new-single-family',
    NULL,
    NULL,
    NULL,
    'early-stage',
    '{"name": "Titan Construction (Bruce Lev)"}'::jsonb,
    v_user_uuid
  ) RETURNING id INTO v_deal_1;

  -- Deal 2: North Jackson (REDD Project)
  INSERT INTO deals (
    organization_id,
    deal_name,
    location,
    unit_count,
    type,
    projected_cost,
    estimated_duration_months,
    expected_start_date,
    status,
    contact,
    created_by
  ) VALUES (
    v_org_id,
    'North Jackson (REDD Project)',
    'North Jackson, OH',
    152,
    'mixed-residential',
    NULL,
    NULL,
    '2026-04-01'::date, -- Q2 2026 -> April 1, 2026
    'concept-pre-funding',
    '{"name": "Bill D''Avigion/Bart McGee"}'::jsonb,
    v_user_uuid
  ) RETURNING id INTO v_deal_2;

  -- Deal 3: WRTA Downtown Multifamily
  INSERT INTO deals (
    organization_id,
    deal_name,
    location,
    unit_count,
    type,
    projected_cost,
    estimated_duration_months,
    expected_start_date,
    status,
    contact,
    created_by
  ) VALUES (
    v_org_id,
    'WRTA Downtown Multifamily',
    'Youngstown, OH',
    129,
    'multifamily',
    NULL,
    NULL,
    '2026-04-01'::date, -- Q2 2026 -> April 1, 2026
    'very-early',
    '{"name": "WRTA"}'::jsonb,
    v_user_uuid
  ) RETURNING id INTO v_deal_3;

  -- Deal 4: East Indianola Multifamily
  INSERT INTO deals (
    organization_id,
    deal_name,
    location,
    unit_count,
    type,
    projected_cost,
    estimated_duration_months,
    expected_start_date,
    status,
    contact,
    created_by
  ) VALUES (
    v_org_id,
    'East Indianola Multifamily',
    'Youngstown, OH',
    120,
    'multifamily',
    NULL,
    NULL,
    NULL,
    'pending-docs',
    '{"name": "Wallick Development"}'::jsonb,
    v_user_uuid
  ) RETURNING id INTO v_deal_4;

  -- Deal 5: Beloit Multifamily Rehab
  INSERT INTO deals (
    organization_id,
    deal_name,
    location,
    unit_count,
    type,
    projected_cost,
    estimated_duration_months,
    expected_start_date,
    status,
    contact,
    created_by
  ) VALUES (
    v_org_id,
    'Beloit Multifamily Rehab',
    'Beloit, OH',
    48,
    'multifamily', -- "Rehab - Multifamily" mapped to 'multifamily'
    NULL,
    NULL,
    NULL,
    'active-pipeline',
    '{"name": "Bruce Lev"}'::jsonb,
    v_user_uuid
  ) RETURNING id INTO v_deal_5;

  -- Deal 6: New Waterford Multifamily Rehab
  INSERT INTO deals (
    organization_id,
    deal_name,
    location,
    unit_count,
    type,
    projected_cost,
    estimated_duration_months,
    expected_start_date,
    status,
    contact,
    created_by
  ) VALUES (
    v_org_id,
    'New Waterford Multifamily Rehab',
    'New Waterford, OH',
    48,
    'multifamily', -- "Rehab - Multifamily" mapped to 'multifamily'
    NULL,
    NULL,
    NULL,
    'active-pipeline',
    '{"name": "Bruce Lev"}'::jsonb,
    v_user_uuid
  ) RETURNING id INTO v_deal_6;

  -- Deal 7: East Palestine (Townhomes)
  INSERT INTO deals (
    organization_id,
    deal_name,
    location,
    unit_count,
    type,
    projected_cost,
    estimated_duration_months,
    expected_start_date,
    status,
    contact,
    created_by
  ) VALUES (
    v_org_id,
    'East Palestine (Townhomes)',
    'East Palestine, OH',
    20,
    'residential',
    NULL,
    NULL,
    NULL,
    'active-pipeline',
    '{"name": "City of East Palestine"}'::jsonb,
    v_user_uuid
  ) RETURNING id INTO v_deal_7;

  -- Deal 8: City of Farrell
  INSERT INTO deals (
    organization_id,
    deal_name,
    location,
    unit_count,
    type,
    projected_cost,
    estimated_duration_months,
    expected_start_date,
    status,
    contact,
    created_by
  ) VALUES (
    v_org_id,
    'City of Farrell',
    'Farrell, Pa',
    NULL, -- No unit count specified
    'residential',
    NULL,
    NULL,
    NULL,
    'active-pipeline',
    '{"name": "City of Farrell"}'::jsonb,
    v_user_uuid
  ) RETURNING id INTO v_deal_8;

  -- ============================================================================
  -- INSERT DEAL NOTES
  -- ============================================================================

  -- Notes for Deal 1: Columbiana Maple St Development
  INSERT INTO deal_notes (deal_id, organization_id, note_text, created_by)
  VALUES (
    v_deal_1,
    v_org_id,
    'Initial phase = 3 spec homes; near Maple Ave; Kimpress & Hapa Holdings adjacent',
    v_user_uuid
  );

  -- Notes for Deal 2: North Jackson (REDD Project)
  INSERT INTO deal_notes (deal_id, organization_id, note_text, created_by)
  VALUES (
    v_deal_2,
    v_org_id,
    'Mix of four-plex, duplex, and single-family; city planner meeting completed',
    v_user_uuid
  );

  -- Notes for Deal 3: WRTA Downtown Multifamily
  INSERT INTO deal_notes (deal_id, organization_id, note_text, created_by)
  VALUES (
    v_deal_3,
    v_org_id,
    'Approx. 82,529 SF; plans pending',
    v_user_uuid
  );

  -- Notes for Deal 4: East Indianola Multifamily
  INSERT INTO deal_notes (deal_id, organization_id, note_text, created_by)
  VALUES (
    v_deal_4,
    v_org_id,
    'Mark has plans for bid RK has contact/established relationship with Developer',
    v_user_uuid
  );

  -- Notes for Deal 5: Beloit Multifamily Rehab
  INSERT INTO deal_notes (deal_id, organization_id, note_text, created_by)
  VALUES (
    v_deal_5,
    v_org_id,
    '32 two-bed, 8 one-bed + studios',
    v_user_uuid
  );

  -- Notes for Deal 6: New Waterford Multifamily Rehab
  INSERT INTO deal_notes (deal_id, organization_id, note_text, created_by)
  VALUES (
    v_deal_6,
    v_org_id,
    'Paired with Beloit project',
    v_user_uuid
  );

  -- Notes for Deal 7: East Palestine (Townhomes)
  INSERT INTO deal_notes (deal_id, organization_id, note_text, created_by)
  VALUES (
    v_deal_7,
    v_org_id,
    'City of EP interested in purchasing for development',
    v_user_uuid
  );

  -- Notes for Deal 8: City of Farrell
  INSERT INTO deal_notes (deal_id, organization_id, note_text, created_by)
  VALUES (
    v_deal_8,
    v_org_id,
    'Meeting with city Manager Shawn Anderson 1/14. City owns land plan to propose the same plan used for North Jackson',
    v_user_uuid
  );

  RAISE NOTICE 'Successfully inserted 8 deals and 8 deal notes.';
END $$;

