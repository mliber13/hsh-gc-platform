-- ============================================================================
-- Migration: Create Feedback System
-- ============================================================================
-- 
-- Creates a table for users to submit feedback, bug reports, and feature requests
-- Simple version: just stores submissions with status tracking
--

-- ============================================================================
-- FEEDBACK TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS feedback (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL,
  
  -- Feedback details
  type TEXT NOT NULL CHECK (type IN ('bug', 'feature-request', 'general-feedback')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'in-progress', 'completed', 'rejected', 'duplicate')),
  
  -- User info
  submitted_by UUID REFERENCES auth.users NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Admin notes (internal)
  admin_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users
);

-- Indexes
CREATE INDEX idx_feedback_organization_id ON feedback(organization_id);
CREATE INDEX idx_feedback_status ON feedback(status);
CREATE INDEX idx_feedback_type ON feedback(type);
CREATE INDEX idx_feedback_submitted_at ON feedback(submitted_at DESC);
CREATE INDEX idx_feedback_submitted_by ON feedback(submitted_by);

-- RLS Policies
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Users can view ALL feedback in their organization (transparent system)
-- Everyone can see all feedback, admin notes, and status updates
CREATE POLICY "Users can view feedback in their organization"
  ON feedback FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can create feedback in their organization
CREATE POLICY "Users can create feedback in their organization"
  ON feedback FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Only admins can update feedback (change status, add notes)
CREATE POLICY "Admins can update feedback in their organization"
  ON feedback FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Only admins can delete feedback
CREATE POLICY "Admins can delete feedback in their organization"
  ON feedback FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE feedback IS 'User feedback, bug reports, and feature requests';
COMMENT ON COLUMN feedback.type IS 'Type of feedback: bug, feature-request, or general-feedback';
COMMENT ON COLUMN feedback.status IS 'Status: new, reviewing, in-progress, completed, rejected, or duplicate';
COMMENT ON COLUMN feedback.admin_notes IS 'Admin response/notes - visible to all team members (transparent system)';
