-- QB.3 fix — include qb_transaction_type in material dedup key (Bill vs Check ID collisions)

BEGIN;

UPDATE public.drywall_qb_materials SET qb_transaction_type = '' WHERE qb_transaction_type IS NULL;

ALTER TABLE public.drywall_qb_materials
  ALTER COLUMN qb_transaction_type SET DEFAULT '';

ALTER TABLE public.drywall_qb_materials
  ALTER COLUMN qb_transaction_type SET NOT NULL;

ALTER TABLE public.drywall_qb_materials
  DROP CONSTRAINT IF EXISTS drywall_qb_materials_organization_id_qb_transaction_id_qb_line_id_key;

ALTER TABLE public.drywall_qb_materials
  ADD CONSTRAINT drywall_qb_materials_dedup_key
  UNIQUE (organization_id, qb_transaction_type, qb_transaction_id, qb_line_id);

COMMIT;
