-- Crew time clock / job progress — leads on schedule items (day-rate/piece pay hook).
--
-- lead_person_ids = the journeyman(s) whose PIECE this item's finish/hang work belongs to.
-- Separate from assigned_persons (which drives /crew visibility): a lead need NOT be assigned
-- (e.g. lead = Ryan on a short "Finish Help" item that only Travis is assigned to). Day-rate
-- helpers (assigned, non-lead) later deduct their day rate evenly across these leads.
-- See docs/CREW_TIME_CLOCK_PLAN.md.

ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS lead_person_ids TEXT[] NOT NULL DEFAULT '{}'::text[];
