-- ============================================================================
-- Migration: Deal Activity Events
-- ============================================================================

CREATE TABLE IF NOT EXISTS deal_activity_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  organization_id TEXT NOT NULL DEFAULT 'default-org',
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_text TEXT NOT NULL,
  event_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_activity_events_deal
  ON deal_activity_events(deal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deal_activity_events_org
  ON deal_activity_events(organization_id);

ALTER TABLE deal_activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view deal activity events in organization"
  ON deal_activity_events FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create deal activity events in organization"
  ON deal_activity_events FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update deal activity events in organization"
  ON deal_activity_events FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete deal activity events in organization"
  ON deal_activity_events FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );
