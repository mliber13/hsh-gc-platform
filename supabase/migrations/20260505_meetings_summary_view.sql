-- ============================================================
-- Meetings summary view
-- ============================================================
-- Aggregates per-meeting counts (submissions for that week_of, total action
-- items linked to the meeting, and open + in-progress action items) so the
-- history list page can render in a single query. The view inherits RLS
-- from its underlying tables (meetings, meeting_submissions, meeting_action_items),
-- all of which allow SELECT for active meeting leads.
-- ============================================================

CREATE OR REPLACE VIEW public.v_meetings_summary AS
SELECT
  m.id,
  m.meeting_date,
  m.week_of,
  m.notes,
  m.created_at,
  COALESCE(s.submission_count, 0)::int AS submission_count,
  COALESCE(a.total_count, 0)::int AS action_item_count,
  COALESCE(a.open_count, 0)::int AS open_action_item_count
FROM public.meetings m
LEFT JOIN (
  SELECT week_of, COUNT(*) AS submission_count
  FROM public.meeting_submissions
  GROUP BY week_of
) s ON s.week_of = m.week_of
LEFT JOIN (
  SELECT
    meeting_id,
    COUNT(*) AS total_count,
    COUNT(*) FILTER (WHERE status IN ('Open', 'In Progress')) AS open_count
  FROM public.meeting_action_items
  WHERE meeting_id IS NOT NULL
  GROUP BY meeting_id
) a ON a.meeting_id = m.id;

-- Views in Postgres default to SECURITY INVOKER, so the underlying tables'
-- RLS policies apply when reading. No additional grants needed beyond the
-- existing SELECT policies on the source tables.
GRANT SELECT ON public.v_meetings_summary TO authenticated;
