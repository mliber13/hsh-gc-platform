-- Add start_date and end_date to schedules for full ProjectSchedule persistence.
-- items JSONB already exists; we use it for schedule items.
-- One schedule per project: unique on project_id (drop duplicate rows first if any).

ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;

COMMENT ON COLUMN schedules.start_date IS 'Project schedule start date';
COMMENT ON COLUMN schedules.end_date IS 'Project schedule end date';

-- Ensure one schedule per project (keeps first row per project_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schedules_project_id_key'
  ) THEN
    DELETE FROM schedules a
    USING schedules b
    WHERE a.project_id = b.project_id AND a.created_at > b.created_at;
    ALTER TABLE schedules ADD CONSTRAINT schedules_project_id_key UNIQUE (project_id);
  END IF;
END $$;
