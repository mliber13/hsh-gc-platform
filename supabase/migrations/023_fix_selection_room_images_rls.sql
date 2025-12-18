-- ============================================================================
-- Migration: Fix Selection Room Images RLS Policy
-- ============================================================================
-- 
-- Fixes the RLS policy for selection_room_images to properly handle
-- organization_id checks and ensure inserts work correctly
--

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view selection room images in their organization" ON selection_room_images;
DROP POLICY IF EXISTS "Users can create selection room images in their organization" ON selection_room_images;
DROP POLICY IF EXISTS "Users can update selection room images in their organization" ON selection_room_images;
DROP POLICY IF EXISTS "Users can delete selection room images in their organization" ON selection_room_images;

-- Recreate policies with better organization_id handling
CREATE POLICY "Users can view selection room images in their organization"
  ON selection_room_images FOR SELECT
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "Users can create selection room images in their organization"
  ON selection_room_images FOR INSERT
  WITH CHECK (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "Users can update selection room images in their organization"
  ON selection_room_images FOR UPDATE
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "Users can delete selection room images in their organization"
  ON selection_room_images FOR DELETE
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );

