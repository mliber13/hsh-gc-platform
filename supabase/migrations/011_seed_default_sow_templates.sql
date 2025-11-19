-- ============================================================================
-- Seed Default SOW Templates
-- ============================================================================
-- 
-- Insert default Scope of Work templates for common trades
-- These templates are system templates (user_id IS NULL) and available to all users
--
-- NOTE: Run migration 012_allow_null_user_id_sow_templates.sql first
--

-- Insert default templates (without user_id, they'll be available to all via RLS)
-- We'll set user_id to NULL and they'll be accessible based on trade_category

-- Standard Electrical SOW
INSERT INTO sow_templates (
  user_id,
  organization_id,
  name,
  trade_category,
  tasks,
  materials_included,
  materials_excluded,
  specifications,
  use_count
) VALUES (
  NULL, -- System templates available to all
  NULL,
  'Standard Electrical SOW',
  'electrical',
  '[
    {"id": "1", "description": "Rough electrical installation per NEC code", "order": 1},
    {"id": "2", "description": "Install all electrical panels and sub-panels", "order": 2},
    {"id": "3", "description": "Install all outlets, switches, and junction boxes", "order": 3},
    {"id": "4", "description": "Run all electrical wiring (NM-B, THHN as specified)", "order": 4},
    {"id": "5", "description": "Install ground fault circuit interrupters (GFCI) as required", "order": 5},
    {"id": "6", "description": "Install arc fault circuit interrupters (AFCI) as required", "order": 6},
    {"id": "7", "description": "Rough-in for all light fixtures, ceiling fans, and appliances", "order": 7},
    {"id": "8", "description": "Complete trim-out and device installation", "order": 8},
    {"id": "9", "description": "Install and connect all light fixtures", "order": 9},
    {"id": "10", "description": "Coordinate with utility for service connection", "order": 10}
  ]'::jsonb,
  '[
    {"id": "1", "description": "All electrical wire and cable", "included": true, "order": 1},
    {"id": "2", "description": "Electrical boxes (device, junction, panel)", "included": true, "order": 2},
    {"id": "3", "description": "Circuit breakers and panel components", "included": true, "order": 3},
    {"id": "4", "description": "Outlet and switch devices (standard grade)", "included": true, "order": 4},
    {"id": "5", "description": "Wire connectors, staples, and mounting hardware", "included": true, "order": 5},
    {"id": "6", "description": "Conduit and fittings (if specified)", "included": true, "order": 6}
  ]'::jsonb,
  '[
    {"id": "1", "description": "Light fixtures and ceiling fans", "included": false, "order": 1},
    {"id": "2", "description": "Appliances and equipment", "included": false, "order": 2},
    {"id": "3", "description": "Decorative switches, outlets, and plates", "included": false, "order": 3},
    {"id": "4", "description": "Owner-furnished equipment", "included": false, "order": 4}
  ]'::jsonb,
  '[
    {"id": "1", "label": "Code Compliance", "value": "NEC 2020 or local code, whichever is stricter", "order": 1},
    {"id": "2", "label": "Voltage", "value": "120/240V single-phase", "order": 2},
    {"id": "3", "label": "Service Size", "value": "As per load calculation", "order": 3}
  ]'::jsonb,
  0
) ON CONFLICT DO NOTHING;

-- Standard Plumbing SOW
INSERT INTO sow_templates (
  user_id,
  organization_id,
  name,
  trade_category,
  tasks,
  materials_included,
  materials_excluded,
  specifications,
  use_count
) VALUES (
  NULL,
  NULL,
  'Standard Plumbing SOW',
  'plumbing',
  '[
    {"id": "1", "description": "Rough plumbing installation per local plumbing code", "order": 1},
    {"id": "2", "description": "Install all water supply lines (hot and cold)", "order": 2},
    {"id": "3", "description": "Install all waste and vent (DWV) lines", "order": 3},
    {"id": "4", "description": "Install water heater and connections", "order": 4},
    {"id": "5", "description": "Rough-in for all fixtures (toilets, sinks, tubs, showers)", "order": 5},
    {"id": "6", "description": "Install all shut-off valves", "order": 6},
    {"id": "7", "description": "Pressure test all water lines", "order": 7},
    {"id": "8", "description": "Water test all waste lines", "order": 8},
    {"id": "9", "description": "Complete trim-out and fixture installation", "order": 9},
    {"id": "10", "description": "Install and connect all plumbing fixtures", "order": 10},
    {"id": "11", "description": "Coordinate with utility for water/sewer connection", "order": 11}
  ]'::jsonb,
  '[
    {"id": "1", "description": "All water supply piping (PEX, copper, or as specified)", "included": true, "order": 1},
    {"id": "2", "description": "All DWV piping (PVC, ABS, or cast iron as specified)", "included": true, "order": 2},
    {"id": "3", "description": "Fittings, valves, and connectors", "included": true, "order": 3},
    {"id": "4", "description": "Pipe hangers, straps, and supports", "included": true, "order": 4},
    {"id": "5", "description": "Water heater (if specified)", "included": true, "order": 5},
    {"id": "6", "description": "Drain assemblies and trap fittings", "included": true, "order": 6}
  ]'::jsonb,
  '[
    {"id": "1", "description": "Plumbing fixtures (toilets, sinks, tubs, showers)", "included": false, "order": 1},
    {"id": "2", "description": "Faucets and shower valves", "included": false, "order": 2},
    {"id": "3", "description": "Water heater (if owner-furnished)", "included": false, "order": 3},
    {"id": "4", "description": "Water treatment equipment", "included": false, "order": 4}
  ]'::jsonb,
  '[
    {"id": "1", "label": "Code Compliance", "value": "Local plumbing code and UPC", "order": 1},
    {"id": "2", "label": "Water Pressure", "value": "Minimum 40 PSI at all fixtures", "order": 2},
    {"id": "3", "label": "Water Supply", "value": "3/4\" main, 1/2\" branch lines", "order": 3}
  ]'::jsonb,
  0
) ON CONFLICT DO NOTHING;

-- Standard HVAC SOW
INSERT INTO sow_templates (
  user_id,
  organization_id,
  name,
  trade_category,
  tasks,
  materials_included,
  materials_excluded,
  specifications,
  use_count
) VALUES (
  NULL,
  NULL,
  'Standard HVAC SOW',
  'hvac',
  '[
    {"id": "1", "description": "Install HVAC system per specifications and local code", "order": 1},
    {"id": "2", "description": "Install all supply and return ductwork", "order": 2},
    {"id": "3", "description": "Install air handler/furnace unit", "order": 3},
    {"id": "4", "description": "Install condenser unit (if applicable)", "order": 4},
    {"id": "5", "description": "Install all supply and return grilles", "order": 5},
    {"id": "6", "description": "Install thermostat and control wiring", "order": 6},
    {"id": "7", "description": "Install condensate drain system", "order": 7},
    {"id": "8", "description": "Complete refrigerant line connections (if applicable)", "order": 8},
    {"id": "9", "description": "Pressure test all refrigerant lines", "order": 9},
    {"id": "10", "description": "Perform system start-up and commissioning", "order": 10},
    {"id": "11", "description": "Balance air flow to all registers", "order": 11}
  ]'::jsonb,
  '[
    {"id": "1", "description": "Air handler/furnace unit", "included": true, "order": 1},
    {"id": "2", "description": "Condenser unit (if applicable)", "included": true, "order": 2},
    {"id": "3", "description": "All ductwork (supply and return)", "included": true, "order": 3},
    {"id": "4", "description": "Duct fittings, transitions, and boots", "included": true, "order": 4},
    {"id": "5", "description": "Supply and return grilles", "included": true, "order": 5},
    {"id": "6", "description": "Thermostat and control system", "included": true, "order": 6},
    {"id": "7", "description": "Refrigerant lines and connections (if applicable)", "included": true, "order": 7},
    {"id": "8", "description": "Duct insulation and vapor barrier", "included": true, "order": 8}
  ]'::jsonb,
  '[
    {"id": "1", "description": "Electrical connections to panel (handled by electrician)", "included": false, "order": 1},
    {"id": "2", "description": "Gas line connections (handled by plumber)", "included": false, "order": 2},
    {"id": "3", "description": "Upgrade thermostat options", "included": false, "order": 3}
  ]'::jsonb,
  '[
    {"id": "1", "label": "Code Compliance", "value": "Local mechanical code and manufacturer specifications", "order": 1},
    {"id": "2", "label": "System Capacity", "value": "As per load calculation", "order": 2},
    {"id": "3", "label": "Efficiency Rating", "value": "SEER 14 minimum (or as specified)", "order": 3}
  ]'::jsonb,
  0
) ON CONFLICT DO NOTHING;

-- Standard Roofing SOW
INSERT INTO sow_templates (
  user_id,
  organization_id,
  name,
  trade_category,
  tasks,
  materials_included,
  materials_excluded,
  specifications,
  use_count
) VALUES (
  NULL,
  NULL,
  'Standard Roofing SOW',
  'roofing',
  '[
    {"id": "1", "description": "Remove existing roofing materials (if applicable)", "order": 1},
    {"id": "2", "description": "Inspect and repair roof deck as needed", "order": 2},
    {"id": "3", "description": "Install ice and water shield at eaves and valleys", "order": 3},
    {"id": "4", "description": "Install underlayment (felt or synthetic)", "order": 4},
    {"id": "5", "description": "Install starter strip at eaves", "order": 5},
    {"id": "6", "description": "Install roofing shingles per manufacturer specifications", "order": 6},
    {"id": "7", "description": "Install ridge cap shingles", "order": 7},
    {"id": "8", "description": "Install step flashing at walls and chimneys", "order": 8},
    {"id": "9", "description": "Install valley flashing (if applicable)", "order": 9},
    {"id": "10", "description": "Install vent boots and flashing", "order": 10},
    {"id": "11", "description": "Clean up all debris and dispose of waste materials", "order": 11}
  ]'::jsonb,
  '[
    {"id": "1", "description": "Roofing shingles (architectural grade)", "included": true, "order": 1},
    {"id": "2", "description": "Underlayment (30# felt or synthetic)", "included": true, "order": 2},
    {"id": "3", "description": "Ice and water shield", "included": true, "order": 3},
    {"id": "4", "description": "Roofing nails and fasteners", "included": true, "order": 4},
    {"id": "5", "description": "Starter strip and ridge cap shingles", "included": true, "order": 5},
    {"id": "6", "description": "Flashing (step, valley, vent boots)", "included": true, "order": 6},
    {"id": "7", "description": "Drip edge (if specified)", "included": true, "order": 7}
  ]'::jsonb,
  '[
    {"id": "1", "description": "Roof deck repair materials (if extensive)", "included": false, "order": 1},
    {"id": "2", "description": "Chimney repair or tuckpointing", "included": false, "order": 2},
    {"id": "3", "description": "Gutter installation", "included": false, "order": 3},
    {"id": "4", "description": "Skylights", "included": false, "order": 4}
  ]'::jsonb,
  '[
    {"id": "1", "label": "Code Compliance", "value": "Local building code and manufacturer specifications", "order": 1},
    {"id": "2", "label": "Shingle Type", "value": "Architectural/3-tab (as specified)", "order": 2},
    {"id": "3", "label": "Warranty", "value": "Manufacturer warranty applies", "order": 3}
  ]'::jsonb,
  0
) ON CONFLICT DO NOTHING;

-- Standard Drywall SOW
INSERT INTO sow_templates (
  user_id,
  organization_id,
  name,
  trade_category,
  tasks,
  materials_included,
  materials_excluded,
  specifications,
  use_count
) VALUES (
  NULL,
  NULL,
  'Standard Drywall SOW',
  'drywall',
  '[
    {"id": "1", "description": "Install all drywall panels per specifications", "order": 1},
    {"id": "2", "description": "Hang drywall on walls (all rooms)", "order": 2},
    {"id": "3", "description": "Hang drywall on ceilings", "order": 3},
    {"id": "4", "description": "Tape all joints with joint compound", "order": 4},
    {"id": "5", "description": "Apply first coat of joint compound", "order": 5},
    {"id": "6", "description": "Apply second coat of joint compound", "order": 6},
    {"id": "7", "description": "Apply final coat and sand smooth", "order": 7},
    {"id": "8", "description": "Install corner bead at all outside corners", "order": 8},
    {"id": "9", "description": "Install drywall around electrical boxes and fixtures", "order": 9},
    {"id": "10", "description": "Prime all drywall surfaces", "order": 10}
  ]'::jsonb,
  '[
    {"id": "1", "description": "Drywall panels (1/2\" standard, 5/8\" ceilings if specified)", "included": true, "order": 1},
    {"id": "2", "description": "Drywall screws and fasteners", "included": true, "order": 2},
    {"id": "3", "description": "Joint compound (pre-mixed)", "included": true, "order": 3},
    {"id": "4", "description": "Drywall tape (paper or mesh)", "included": true, "order": 4},
    {"id": "5", "description": "Corner bead (metal or plastic)", "included": true, "order": 5},
    {"id": "6", "description": "Primer (PVA or drywall primer)", "included": true, "order": 6}
  ]'::jsonb,
  '[
    {"id": "1", "description": "Paint and finish materials", "included": false, "order": 1},
    {"id": "2", "description": "Texture materials (if applicable)", "included": false, "order": 2},
    {"id": "3", "description": "Backing materials for heavy fixtures", "included": false, "order": 3}
  ]'::jsonb,
  '[
    {"id": "1", "label": "Code Compliance", "value": "Local building code", "order": 1},
    {"id": "2", "label": "Drywall Thickness", "value": "1/2\" walls, 5/8\" ceilings (or as specified)", "order": 2},
    {"id": "3", "label": "Finish Level", "value": "Level 4 finish (ready for paint)", "order": 3}
  ]'::jsonb,
  0
) ON CONFLICT DO NOTHING;

