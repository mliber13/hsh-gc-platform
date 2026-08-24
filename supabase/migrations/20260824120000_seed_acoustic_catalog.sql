-- ============================================================
-- Backfill the Acoustic Ceiling catalog for orgs that have none
-- ============================================================
-- The acoustic component breakdown prices tiles + grid parts from the acoustic
-- catalog, which seeds empty for existing orgs. Populate it (only when empty)
-- with HSH's standard rates: tile $2/sqft, main $12, 4ft tee $4, 2ft tee $2,
-- wall angle $10, hanger wire $0.25/LF, lags $1. Labor is per-line ($/sqft),
-- so labor_rate stays 0 here. Idempotent — skips orgs that already have entries.
-- ============================================================

UPDATE public.org_drywall_catalogs
SET
  payload = jsonb_set(
    COALESCE(payload, '{}'::jsonb),
    '{acoustic}',
    '[
      {"id":"acst_tile","display_name":"Ceiling Tile","component_type":"tile","unit":"sqft","material_rate":2,"labor_rate":0},
      {"id":"acst_mains","display_name":"Main Runner (12 ft)","component_type":"mains","unit":"each","material_rate":12,"labor_rate":0},
      {"id":"acst_tees_4ft","display_name":"Cross Tee - 4 ft","component_type":"tees_4ft","unit":"each","material_rate":4,"labor_rate":0},
      {"id":"acst_tees_2ft","display_name":"Cross Tee - 2 ft","component_type":"tees_2ft","unit":"each","material_rate":2,"labor_rate":0},
      {"id":"acst_wall_angle","display_name":"Wall Angle (10 ft)","component_type":"wall_angle","unit":"each","material_rate":10,"labor_rate":0},
      {"id":"acst_wire","display_name":"Hanger Wire","component_type":"wire","unit":"lf","material_rate":0.25,"labor_rate":0},
      {"id":"acst_lags","display_name":"Lags","component_type":"lags","unit":"each","material_rate":1,"labor_rate":0}
    ]'::jsonb
  ),
  updated_at = now()
WHERE payload IS NULL
   OR payload->'acoustic' IS NULL
   OR jsonb_typeof(payload->'acoustic') <> 'array'
   OR jsonb_array_length(payload->'acoustic') = 0;
