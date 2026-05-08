-- Persist template-review state on trades so review cues survive navigation/reload.
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS pending_review boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.trades.pending_review IS
  'True when trade came from template apply and has not been reviewed/edited yet.';
