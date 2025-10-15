-- ============================================================================
-- Additional Item Templates for Missing Categories
-- ============================================================================
-- Run this to add templates for Planning, Site Prep, Excavation, etc.

INSERT INTO item_templates (
  name, 
  category, 
  default_unit, 
  default_material_rate, 
  default_labor_rate, 
  default_subcontractor_cost,
  is_subcontracted,
  notes,
  organization_id, 
  created_at, 
  updated_at
) VALUES

-- Planning
('Admin Fees', 'planning', 'lot', 0, 0, 2500, true, 'Administrative and office fees', 'default-org', NOW(), NOW()),
('Engineering', 'planning', 'lot', 0, 0, 3500, true, 'Structural engineering plans', 'default-org', NOW(), NOW()),
('Architectural Plans', 'planning', 'lot', 0, 0, 5000, true, 'Architectural design and plans', 'default-org', NOW(), NOW()),
('Legal Fees', 'planning', 'lot', 0, 0, 1500, true, 'Legal fees and contracts', 'default-org', NOW(), NOW()),
('Permit - Building', 'planning', 'lot', 0, 0, 2000, true, 'Building permit fees', 'default-org', NOW(), NOW()),
('Permit - Electrical', 'planning', 'lot', 0, 0, 300, true, 'Electrical permit fees', 'default-org', NOW(), NOW()),
('Permit - Plumbing', 'planning', 'lot', 0, 0, 300, true, 'Plumbing permit fees', 'default-org', NOW(), NOW()),
('Permit - Mechanical', 'planning', 'lot', 0, 0, 300, true, 'HVAC permit fees', 'default-org', NOW(), NOW()),
('Survey', 'planning', 'lot', 0, 0, 1500, true, 'Land survey', 'default-org', NOW(), NOW()),
('Soil Testing', 'planning', 'lot', 0, 0, 800, true, 'Geotechnical soil testing', 'default-org', NOW(), NOW()),

-- Site Prep
('Dumpster', 'site-prep', 'month', 0, 0, 500, true, 'Construction dumpster rental', 'default-org', NOW(), NOW()),
('Lot Clearing', 'site-prep', 'acre', 0, 0, 3000, true, 'Clear and grub lot', 'default-org', NOW(), NOW()),
('Tree Removal', 'site-prep', 'each', 0, 0, 500, true, 'Individual tree removal', 'default-org', NOW(), NOW()),
('Grading', 'site-prep', 'lot', 0, 0, 5000, true, 'Site grading and leveling', 'default-org', NOW(), NOW()),
('Erosion Control', 'site-prep', 'lot', 0, 0, 1200, true, 'Erosion control measures', 'default-org', NOW(), NOW()),
('Temporary Power', 'site-prep', 'month', 0, 0, 150, true, 'Temporary electrical service', 'default-org', NOW(), NOW()),
('Temporary Water', 'site-prep', 'month', 0, 0, 100, true, 'Temporary water service', 'default-org', NOW(), NOW()),
('Porta Potty', 'site-prep', 'month', 0, 0, 200, true, 'Portable restroom rental', 'default-org', NOW(), NOW()),

-- Excavation & Foundation
('Foundation-Excavation', 'excavation-foundation', 'lot', 0, 0, 8000, true, 'Foundation excavation', 'default-org', NOW(), NOW()),
('Footings', 'excavation-foundation', 'linear_ft', 25, 15, 0, false, 'Concrete footings', 'default-org', NOW(), NOW()),
('Foundation Walls', 'excavation-foundation', 'linear_ft', 30, 20, 0, false, 'Poured foundation walls', 'default-org', NOW(), NOW()),
('Slab on Grade', 'excavation-foundation', 'sqft', 6, 4, 0, false, 'Concrete slab foundation', 'default-org', NOW(), NOW()),
('Basement Floor', 'excavation-foundation', 'sqft', 8, 5, 0, false, 'Basement concrete floor', 'default-org', NOW(), NOW()),
('Waterproofing', 'excavation-foundation', 'linear_ft', 5, 3, 0, false, 'Foundation waterproofing', 'default-org', NOW(), NOW()),
('Backfill', 'excavation-foundation', 'lot', 0, 0, 2500, true, 'Foundation backfill and compaction', 'default-org', NOW(), NOW()),
('Driveway Excavation', 'excavation-foundation', 'lot', 0, 0, 3000, true, 'Dig and prepare driveway', 'default-org', NOW(), NOW()),
('Driveway - Concrete', 'excavation-foundation', 'sqft', 8, 6, 0, false, 'Concrete driveway', 'default-org', NOW(), NOW()),
('Driveway - Asphalt', 'excavation-foundation', 'sqft', 5, 4, 0, false, 'Asphalt driveway', 'default-org', NOW(), NOW()),

-- Water & Sewer (utilities category)
('Water Service Connection', 'other', 'lot', 0, 0, 3500, true, 'Connect to municipal water', 'default-org', NOW(), NOW()),
('Sewer Service Connection', 'other', 'lot', 0, 0, 4000, true, 'Connect to municipal sewer', 'default-org', NOW(), NOW()),
('Septic System', 'other', 'lot', 0, 0, 12000, true, 'Complete septic system installation', 'default-org', NOW(), NOW()),
('Well Drilling', 'other', 'foot', 0, 0, 35, true, 'Drill well per foot', 'default-org', NOW(), NOW()),
('Well Pump System', 'other', 'lot', 0, 0, 3500, true, 'Well pump and pressure tank', 'default-org', NOW(), NOW()),
('Gas Service Connection', 'other', 'lot', 0, 0, 2500, true, 'Natural gas service connection', 'default-org', NOW(), NOW()),
('Electric Service', 'other', 'lot', 0, 0, 3000, true, 'Electric meter and service panel', 'default-org', NOW(), NOW()),

-- Additional useful templates
('Landscaping', 'other', 'lot', 0, 0, 5000, true, 'Basic landscaping package', 'default-org', NOW(), NOW()),
('Irrigation System', 'other', 'lot', 0, 0, 3500, true, 'Lawn irrigation system', 'default-org', NOW(), NOW()),
('Fencing', 'other', 'linear_ft', 25, 10, 0, false, 'Wood privacy fencing', 'default-org', NOW(), NOW()),
('Deck', 'other', 'sqft', 30, 15, 0, false, 'Composite decking', 'default-org', NOW(), NOW()),
('Patio - Concrete', 'other', 'sqft', 8, 5, 0, false, 'Concrete patio', 'default-org', NOW(), NOW()),
('Retaining Wall', 'other', 'linear_ft', 40, 20, 0, false, 'Block retaining wall', 'default-org', NOW(), NOW());

