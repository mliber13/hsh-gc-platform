-- ============================================================================
-- Migration: Create Deals Pipeline Table
-- ============================================================================
-- 
-- Creates a table to track deals in the pipeline before they become projects
-- Some deals become single projects, others become multiple projects
--

-- ============================================================================
-- DEALS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS deals (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL,
  
  -- Basic Info
  deal_name TEXT NOT NULL,
  location TEXT NOT NULL,
  unit_count INTEGER,
  type TEXT NOT NULL CHECK (type IN (
    'new-single-family',
    'mixed-residential',
    'multifamily',
    'residential',
    'commercial',
    'custom'
  )),
  custom_type TEXT, -- For custom type
  
  -- Financial & Timeline
  projected_cost NUMERIC(15, 2),
  estimated_duration_months INTEGER,
  expected_start_date TIMESTAMPTZ,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'early-stage' CHECK (status IN (
    'early-stage',
    'concept-pre-funding',
    'very-early',
    'pending-docs',
    'active-pipeline',
    'custom'
  )),
  custom_status TEXT, -- For custom status
  
  -- Contact
  contact JSONB, -- { name, email, phone, company, etc. }
  
  -- Metadata
  created_by UUID REFERENCES auth.users NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Track if converted to projects
  converted_to_projects BOOLEAN DEFAULT false,
  converted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_deals_organization_id ON deals(organization_id);
CREATE INDEX idx_deals_status ON deals(status);
CREATE INDEX idx_deals_type ON deals(type);
CREATE INDEX idx_deals_created_at ON deals(created_at DESC);
CREATE INDEX idx_deals_converted ON deals(converted_to_projects);

-- ============================================================================
-- DEAL NOTES TABLE (for notes log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS deal_notes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  organization_id TEXT NOT NULL,
  
  -- Note content
  note_text TEXT NOT NULL,
  
  -- Metadata
  created_by UUID REFERENCES auth.users NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_deal_notes_deal_id ON deal_notes(deal_id);
CREATE INDEX idx_deal_notes_organization_id ON deal_notes(organization_id);
CREATE INDEX idx_deal_notes_created_at ON deal_notes(created_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_notes ENABLE ROW LEVEL SECURITY;

-- Deals: Users can view deals in their organization
CREATE POLICY "Users can view deals in their organization"
  ON deals FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Deals: Users can create deals in their organization
CREATE POLICY "Users can create deals in their organization"
  ON deals FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Deals: Users can update deals in their organization
CREATE POLICY "Users can update deals in their organization"
  ON deals FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Deals: Users can delete deals in their organization
CREATE POLICY "Users can delete deals in their organization"
  ON deals FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Deal Notes: Users can view notes for deals in their organization
CREATE POLICY "Users can view deal notes in their organization"
  ON deal_notes FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Deal Notes: Users can create notes for deals in their organization
CREATE POLICY "Users can create deal notes in their organization"
  ON deal_notes FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Deal Notes: Users can update notes for deals in their organization
CREATE POLICY "Users can update deal notes in their organization"
  ON deal_notes FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Deal Notes: Users can delete notes for deals in their organization
CREATE POLICY "Users can delete deal notes in their organization"
  ON deal_notes FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE deals IS 'Deals in the pipeline before they become projects';
COMMENT ON COLUMN deals.type IS 'Deal type: new-single-family, mixed-residential, multifamily, residential, commercial, or custom';
COMMENT ON COLUMN deals.status IS 'Deal status: early-stage, concept-pre-funding, very-early, pending-docs, active-pipeline, or custom';
COMMENT ON COLUMN deals.contact IS 'Contact information stored as JSON: { name, email, phone, company }';
COMMENT ON COLUMN deals.converted_to_projects IS 'Whether this deal has been converted to one or more projects';
COMMENT ON TABLE deal_notes IS 'Notes log for deals - each note is dated and tracked';
COMMENT ON COLUMN deal_notes.note_text IS 'The note content';
COMMENT ON COLUMN deal_notes.created_at IS 'When the note was created (used as the note date)';

