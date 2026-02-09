-- ============================================================================
-- Migration: Gameplan Playbook (org-level template)
-- ============================================================================
-- Template plays per organization. When a project has no plays, this playbook
-- is shown; "Copy to project" copies these into gameplan_plays.

CREATE TABLE IF NOT EXISTS gameplan_playbook (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL,

  chapter_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  owner TEXT NOT NULL CHECK (owner IN ('GC', 'SUB', 'IN_HOUSE', 'SUPPLIER')),
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gameplan_playbook_organization_id ON gameplan_playbook(organization_id);
CREATE INDEX idx_gameplan_playbook_chapter ON gameplan_playbook(organization_id, chapter_key);

ALTER TABLE gameplan_playbook ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view playbook in their organization"
  ON gameplan_playbook FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert playbook plays in their organization"
  ON gameplan_playbook FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can update playbook plays in their organization"
  ON gameplan_playbook FOR UPDATE
  USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can delete playbook plays in their organization"
  ON gameplan_playbook FOR DELETE
  USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );
