-- ============================================================================
-- Migration: Gameplan Plays (chapters + gates per project)
-- ============================================================================
-- Chapters are static (defined in app). Plays are prerequisite gates per chapter.
-- Readiness is primary; dates are a constraint layer.

CREATE TABLE IF NOT EXISTS gameplan_plays (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  organization_id TEXT NOT NULL,

  -- Which chapter (phase) this play belongs to
  chapter_key TEXT NOT NULL,

  -- Play (gate) details
  title TEXT NOT NULL,
  description TEXT,
  owner TEXT NOT NULL CHECK (owner IN ('GC', 'SUB', 'IN_HOUSE', 'SUPPLIER')),
  status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED', 'BLOCKED', 'IN_PROGRESS', 'COMPLETE')),

  -- Optional target window
  target_start DATE,
  target_finish DATE,

  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gameplan_plays_project_id ON gameplan_plays(project_id);
CREATE INDEX idx_gameplan_plays_chapter_key ON gameplan_plays(project_id, chapter_key);

ALTER TABLE gameplan_plays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view gameplan plays in their organization"
  ON gameplan_plays FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert gameplan plays in their organization"
  ON gameplan_plays FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can update gameplan plays in their organization"
  ON gameplan_plays FOR UPDATE
  USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can delete gameplan plays in their organization"
  ON gameplan_plays FOR DELETE
  USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );
