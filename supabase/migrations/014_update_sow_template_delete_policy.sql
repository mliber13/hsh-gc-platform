-- ============================================================================
-- Expand SOW template delete policy to include organization & system templates
-- ============================================================================

DROP POLICY IF EXISTS "Users can delete own SOW templates" ON sow_templates;
CREATE POLICY "Users can manage SOW templates they can access"
  ON sow_templates FOR DELETE
  USING (
    auth.uid() = user_id
    OR (
      organization_id IS NOT NULL
      AND organization_id = (
        SELECT organization_id
        FROM profiles
        WHERE id = auth.uid()
      )
    )
    OR (user_id IS NULL AND organization_id IS NULL)
  );

