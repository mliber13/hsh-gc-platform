-- ============================================================================
-- HSH GC Platform - Selection Books System Migration
-- ============================================================================
-- 
-- Creates a room-by-room selection book system where designers can organize
-- paint colors, flooring, lighting, and other selections for each room
-- with image uploads for visual reference
--

-- ============================================================================
-- SELECTION BOOKS TABLE
-- ============================================================================
-- One selection book per project

CREATE TABLE selection_books (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id UUID REFERENCES projects ON DELETE CASCADE,
  
  -- Book metadata
  title TEXT DEFAULT 'Selection Book',
  description TEXT,
  
  -- Status
  status TEXT DEFAULT 'draft', -- 'draft', 'in_progress', 'completed', 'approved'
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users,
  
  -- Ensure one book per project
  UNIQUE(project_id)
);

-- Indexes
CREATE INDEX idx_selection_books_project_id ON selection_books(project_id);
CREATE INDEX idx_selection_books_organization_id ON selection_books(organization_id);
CREATE INDEX idx_selection_books_status ON selection_books(status);

-- ============================================================================
-- SELECTION ROOMS TABLE
-- ============================================================================
-- Individual rooms within a selection book

CREATE TABLE selection_rooms (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL,
  selection_book_id UUID REFERENCES selection_books ON DELETE CASCADE,
  
  -- Room identification
  room_name TEXT NOT NULL,
  room_type TEXT, -- 'kitchen', 'bathroom', 'bedroom', 'living', 'exterior', 'custom', etc.
  display_order INTEGER DEFAULT 0,
  
  -- Selections (stored as JSONB for flexibility)
  selections JSONB DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "paint": {
  --     "walls": { "color": "", "brand": "", "finish": "" },
  --     "ceiling": { "color": "", "brand": "", "finish": "" },
  --     "trim": { "color": "", "brand": "", "finish": "" }
  --   },
  --   "flooring": {
  --     "type": "",
  --     "material": "",
  --     "color": "",
  --     "brand": "",
  --     "notes": ""
  --   },
  --   "lighting": {
  --     "fixtures": [],
  --     "switches": "",
  --     "dimmers": ""
  --   },
  --   "cabinetry": {
  --     "style": "",
  --     "color": "",
  --     "brand": "",
  --     "hardware": ""
  --   },
  --   "countertops": {
  --     "material": "",
  --     "color": "",
  --     "brand": "",
  --     "edge": ""
  --   },
  --   "fixtures": {
  --     "faucets": "",
  --     "sinks": "",
  --     "toilets": "",
  --     "showers": ""
  --   },
  --   "hardware": {
  --     "door_handles": "",
  --     "cabinet_pulls": "",
  --     "towel_bars": ""
  --   },
  --   "notes": ""
  -- }
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_selection_rooms_book_id ON selection_rooms(selection_book_id);
CREATE INDEX idx_selection_rooms_organization_id ON selection_rooms(organization_id);
CREATE INDEX idx_selection_rooms_display_order ON selection_rooms(display_order);

-- ============================================================================
-- SELECTION ROOM IMAGES TABLE
-- ============================================================================
-- Images associated with rooms (paint swatches, flooring samples, etc.)

CREATE TABLE selection_room_images (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL,
  selection_room_id UUID REFERENCES selection_rooms ON DELETE CASCADE,
  
  -- Image metadata
  image_url TEXT NOT NULL, -- Supabase Storage URL
  image_path TEXT NOT NULL, -- Path in storage bucket
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  
  -- Categorization
  category TEXT, -- 'paint', 'flooring', 'lighting', 'cabinetry', 'countertop', 'fixture', 'hardware', 'general'
  description TEXT,
  display_order INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users
);

-- Indexes
CREATE INDEX idx_selection_room_images_room_id ON selection_room_images(selection_room_id);
CREATE INDEX idx_selection_room_images_organization_id ON selection_room_images(organization_id);
CREATE INDEX idx_selection_room_images_category ON selection_room_images(category);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE selection_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_room_images ENABLE ROW LEVEL SECURITY;

-- Selection Books Policies
CREATE POLICY "Users can view selection books in their organization"
  ON selection_books FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create selection books in their organization"
  ON selection_books FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update selection books in their organization"
  ON selection_books FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete selection books in their organization"
  ON selection_books FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Selection Rooms Policies
CREATE POLICY "Users can view selection rooms in their organization"
  ON selection_rooms FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create selection rooms in their organization"
  ON selection_rooms FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update selection rooms in their organization"
  ON selection_rooms FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete selection rooms in their organization"
  ON selection_rooms FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Selection Room Images Policies
CREATE POLICY "Users can view selection room images in their organization"
  ON selection_room_images FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create selection room images in their organization"
  ON selection_room_images FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update selection room images in their organization"
  ON selection_room_images FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete selection room images in their organization"
  ON selection_room_images FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_selection_books_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_selection_books_updated_at
  BEFORE UPDATE ON selection_books
  FOR EACH ROW
  EXECUTE FUNCTION update_selection_books_updated_at();

CREATE OR REPLACE FUNCTION update_selection_rooms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_selection_rooms_updated_at
  BEFORE UPDATE ON selection_rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_selection_rooms_updated_at();

-- ============================================================================
-- STORAGE BUCKET
-- ============================================================================
-- Note: Storage bucket creation should be done via Supabase Dashboard or CLI
-- This is a reference for the bucket structure:
-- 
-- Bucket name: selection-images
-- Public: false (use signed URLs or RLS policies)
-- File size limit: 10MB
-- Allowed MIME types: image/jpeg, image/png, image/webp, image/gif
--
-- Storage path structure:
-- {organization_id}/{project_id}/{room_id}/{timestamp}-{filename}

