-- ============================================================================
-- Migration: Create Selection Room Spec Sheets Table
-- ============================================================================
-- 
-- Creates a table for storing spec sheets (PDFs, images) associated with
-- selection room categories (paint, flooring, lighting, custom categories, etc.)
--

-- ============================================================================
-- SELECTION ROOM SPEC SHEETS TABLE
-- ============================================================================
-- Spec sheets associated with room categories (paint, flooring, lighting, etc.)

CREATE TABLE selection_room_spec_sheets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL,
  selection_room_id UUID REFERENCES selection_rooms ON DELETE CASCADE,
  
  -- File metadata
  file_url TEXT NOT NULL, -- Supabase Storage URL (signed URL)
  file_path TEXT NOT NULL, -- Path in storage bucket
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT, -- 'application/pdf', 'image/jpeg', 'image/png', etc.
  
  -- Categorization
  category TEXT NOT NULL, -- 'paint', 'flooring', 'lighting', 'cabinetry', 'countertop', 'fixture', 'hardware', or custom category name
  description TEXT,
  display_order INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users
);

-- Indexes
CREATE INDEX idx_selection_room_spec_sheets_room_id ON selection_room_spec_sheets(selection_room_id);
CREATE INDEX idx_selection_room_spec_sheets_organization_id ON selection_room_spec_sheets(organization_id);
CREATE INDEX idx_selection_room_spec_sheets_category ON selection_room_spec_sheets(category);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE selection_room_spec_sheets ENABLE ROW LEVEL SECURITY;

-- Selection Room Spec Sheets Policies
CREATE POLICY "Users can view spec sheets in their organization"
  ON selection_room_spec_sheets FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create spec sheets in their organization"
  ON selection_room_spec_sheets FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update spec sheets in their organization"
  ON selection_room_spec_sheets FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete spec sheets in their organization"
  ON selection_room_spec_sheets FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

