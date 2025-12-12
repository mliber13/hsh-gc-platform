-- ============================================================================
-- Migration: Create Project Documents Table
-- ============================================================================
-- 
-- Creates a table to store metadata for project documents (contracts, SOWs, etc.)
-- Documents are stored in Supabase Storage, this table tracks metadata
--

-- ============================================================================
-- PROJECT DOCUMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  organization_id TEXT NOT NULL,
  
  -- File info
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'contract',
    'plan',
    'specification',
    'permit',
    'invoice',
    'change-order',
    'rfi',
    'submittal',
    'inspection',
    'warranty',
    'photo',
    'subcontractor-agreement',
    'scope-of-work-signoff',
    'other'
  )),
  file_url TEXT NOT NULL,
  file_size BIGINT NOT NULL, -- Bytes
  mime_type TEXT NOT NULL,
  
  -- Organization
  category TEXT,
  tags TEXT[],
  
  -- Metadata
  uploaded_by UUID REFERENCES auth.users NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  description TEXT,
  
  -- Version control
  version INTEGER DEFAULT 1,
  replaces_document_id UUID REFERENCES project_documents(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_project_documents_project_id ON project_documents(project_id);
CREATE INDEX idx_project_documents_organization_id ON project_documents(organization_id);
CREATE INDEX idx_project_documents_type ON project_documents(type);
CREATE INDEX idx_project_documents_uploaded_at ON project_documents(uploaded_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

-- Users can view documents for projects in their organization
CREATE POLICY "Users can view documents in their organization"
  ON project_documents FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can insert documents for projects in their organization
CREATE POLICY "Users can create documents in their organization"
  ON project_documents FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can update documents in their organization
CREATE POLICY "Users can update documents in their organization"
  ON project_documents FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can delete documents in their organization
CREATE POLICY "Users can delete documents in their organization"
  ON project_documents FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE project_documents IS 'Metadata for project documents stored in Supabase Storage';
COMMENT ON COLUMN project_documents.type IS 'Document type: contract, plan, subcontractor-agreement, scope-of-work-signoff, etc.';
COMMENT ON COLUMN project_documents.file_url IS 'Public URL to the document in Supabase Storage';
COMMENT ON COLUMN project_documents.replaces_document_id IS 'If this document replaces another, link to the old document';

