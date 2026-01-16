-- ============================================================================
-- Migration: Create Deal Documents Table
-- ============================================================================
-- 
-- Creates a table to store metadata for deal documents (proposals, contracts, plans, etc.)
-- Documents are stored in Supabase Storage, this table tracks metadata
--

-- ============================================================================
-- DEAL DOCUMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS deal_documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  organization_id TEXT NOT NULL,
  
  -- File info
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'proposal',
    'contract',
    'plan',
    'specification',
    'permit',
    'financial-document',
    'photo',
    'other'
  )),
  file_url TEXT NOT NULL,
  file_path TEXT, -- Storage path for regenerating signed URLs
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
  replaces_document_id UUID REFERENCES deal_documents(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_deal_documents_deal_id ON deal_documents(deal_id);
CREATE INDEX idx_deal_documents_organization_id ON deal_documents(organization_id);
CREATE INDEX idx_deal_documents_type ON deal_documents(type);
CREATE INDEX idx_deal_documents_uploaded_at ON deal_documents(uploaded_at DESC);
CREATE INDEX idx_deal_documents_file_path ON deal_documents(file_path);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE deal_documents ENABLE ROW LEVEL SECURITY;

-- Users can view documents for deals in their organization
CREATE POLICY "Users can view deal documents in their organization"
  ON deal_documents FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can insert documents for deals in their organization
CREATE POLICY "Users can create deal documents in their organization"
  ON deal_documents FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can update documents in their organization
CREATE POLICY "Users can update deal documents in their organization"
  ON deal_documents FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can delete documents in their organization
CREATE POLICY "Users can delete deal documents in their organization"
  ON deal_documents FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE deal_documents IS 'Metadata for deal documents stored in Supabase Storage';
COMMENT ON COLUMN deal_documents.type IS 'Document type: proposal, contract, plan, specification, permit, financial-document, photo, other';
COMMENT ON COLUMN deal_documents.file_url IS 'Signed URL to the document in Supabase Storage';
COMMENT ON COLUMN deal_documents.file_path IS 'Storage path for the document file, used to generate signed URLs';
COMMENT ON COLUMN deal_documents.replaces_document_id IS 'If this document replaces another, link to the old document';
