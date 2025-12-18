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
-- Using EXISTS to handle NULL cases properly
CREATE POLICY "Users can view selection room images in their organization"
  ON selection_room_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND organization_id = selection_room_images.organization_id
    )
  );

CREATE POLICY "Users can create selection room images in their organization"
  ON selection_room_images FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND organization_id = selection_room_images.organization_id
    )
  );

CREATE POLICY "Users can update selection room images in their organization"
  ON selection_room_images FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND organization_id = selection_room_images.organization_id
    )
  );

CREATE POLICY "Users can delete selection room images in their organization"
  ON selection_room_images FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND organization_id = selection_room_images.organization_id
    )
  );

