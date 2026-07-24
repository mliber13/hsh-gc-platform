-- Supplier view: assign a supplier to a (stock) schedule item, so it surfaces on the supplier's
-- "Upcoming (estimate)" view before a field measure / order exists. Nullable; most items have none.

ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_items_supplier
  ON public.schedule_items(supplier_id)
  WHERE supplier_id IS NOT NULL;
