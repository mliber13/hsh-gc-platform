-- Crew time clock / job progress — Phase 1: office-defined tasks on schedule items.
--
-- Each task (JSONB): { id, label, payLinked, progressMode: 'percent' | 'check', pieceKey? }
--   payLinked = true  -> finish step / hang; later drives piece pay (tracked by % complete)
--   payLinked = false -> progress-only checklist (e.g. Paper Floors) — captured, not paid
--
-- Phase 1 is office authoring only. Crew read/write of task progress + payroll wiring
-- come in later phases (see docs/CREW_TIME_CLOCK_PLAN.md). No RLS change needed here —
-- schedule_items already has operator RLS, and tasks ride on the existing row.

ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS tasks JSONB NOT NULL DEFAULT '[]'::jsonb;
