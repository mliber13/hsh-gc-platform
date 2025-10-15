-- ============================================================================
-- Import Default Item Templates
-- ============================================================================
-- Run this in Supabase SQL Editor to populate item_templates table

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
-- Rough Framing
('Wood Framing', 'rough-framing', 'sqft', 11.44, 5.50, 0, false, 'Wood framing materials and labor', 'default-org', NOW(), NOW()),

-- Windows & Doors
('Interior Doors', 'windows-doors', 'each', 350, 100, 0, false, 'Standard interior door with hardware', 'default-org', NOW(), NOW()),
('Exterior Doors', 'windows-doors', 'each', 1400, 150, 0, false, 'Exterior door with hardware and installation', 'default-org', NOW(), NOW()),
('Garage Doors', 'windows-doors', 'each', 1500, 600, 0, false, 'Garage door with opener', 'default-org', NOW(), NOW()),
('Sliding Doors/French Door', 'windows-doors', 'each', 1800, 150, 0, false, 'Sliding or French door with installation', 'default-org', NOW(), NOW()),
('Windows', 'windows-doors', 'each', 1000, 125, 0, false, 'Standard window with installation', 'default-org', NOW(), NOW()),
('Front Door', 'windows-doors', 'each', 2400, 150, 0, false, 'Premium front door with hardware', 'default-org', NOW(), NOW()),

-- Exterior Finishes
('Siding', 'exterior-finishes', 'sqft', 5.00, 1.25, 0, false, 'Siding materials and installation', 'default-org', NOW(), NOW()),
('Soffit/Fascia', 'exterior-finishes', 'linear_ft', 10.00, 3.00, 0, false, 'Soffit and fascia materials and labor', 'default-org', NOW(), NOW()),
('Exterior Paint', 'exterior-finishes', 'sqft', 3.00, 3.00, 0, false, 'Exterior paint and application', 'default-org', NOW(), NOW()),

-- Electrical
('Rough', 'electrical', 'sqft', 5.00, 10.00, 0, false, 'Rough electrical work', 'default-org', NOW(), NOW()),
('Finishes', 'electrical', 'sqft', 1.00, 2.00, 0, false, 'Electrical finish work', 'default-org', NOW(), NOW()),
('Closet Hardware', 'electrical', 'each', 500, 250, 0, false, 'Closet organization hardware', 'default-org', NOW(), NOW()),
('Closet Shelving', 'electrical', 'each', 500, 250, 0, false, 'Closet shelving system', 'default-org', NOW(), NOW()),

-- Interior Finishes
('Flooring', 'interior-finishes', 'sqft', 2.00, 2.00, 0, false, 'Flooring materials and installation', 'default-org', NOW(), NOW()),
('Interior Paint', 'interior-finishes', 'sqft', 2.00, 2.00, 0, false, 'Interior paint and application', 'default-org', NOW(), NOW()),

-- Kitchen
('Backsplash', 'kitchen', 'sqft', 5.00, 5.00, 0, false, 'Kitchen backsplash tile', 'default-org', NOW(), NOW()),
('Cabinets', 'kitchen', 'each', 300, 75, 0, false, 'Kitchen cabinet per unit', 'default-org', NOW(), NOW()),
('Countertops', 'kitchen', 'sqft', 50, 25, 0, false, 'Kitchen countertops', 'default-org', NOW(), NOW()),
('Kitchen Faucet', 'kitchen', 'each', 200, 0, 0, false, 'Kitchen sink faucet', 'default-org', NOW(), NOW()),
('Accessories', 'kitchen', 'lot', 750, 250, 0, false, 'Kitchen accessories package', 'default-org', NOW(), NOW()),

-- Appliances
('Cooktop', 'appliances', 'each', 600, 75, 0, false, 'Cooktop with installation', 'default-org', NOW(), NOW()),
('Dishwasher', 'appliances', 'each', 250, 75, 0, false, 'Dishwasher with installation', 'default-org', NOW(), NOW()),
('Microwave Oven', 'appliances', 'each', 250, 25, 0, false, 'Microwave with installation', 'default-org', NOW(), NOW()),
('Oven', 'appliances', 'each', 600, 75, 0, false, 'Oven with installation', 'default-org', NOW(), NOW()),
('Range Hood', 'appliances', 'each', 600, 75, 0, false, 'Range hood with installation', 'default-org', NOW(), NOW()),
('Refrigerator', 'appliances', 'each', 600, 75, 0, false, 'Refrigerator with installation', 'default-org', NOW(), NOW()),
('Washer+Dryer', 'appliances', 'each', 1200, 150, 0, false, 'Washer and dryer set', 'default-org', NOW(), NOW()),

-- Bath
('Accessories', 'bath', 'lot', 500, 250, 0, false, 'Bathroom accessories package', 'default-org', NOW(), NOW()),
('Cabinets', 'bath', 'each', 300, 75, 0, false, 'Bathroom vanity cabinet', 'default-org', NOW(), NOW()),
('Cabinets-Hardware', 'bath', 'lot', 250, 50, 0, false, 'Bathroom cabinet hardware', 'default-org', NOW(), NOW()),
('Countertops', 'bath', 'sqft', 50, 25, 0, false, 'Bathroom countertops', 'default-org', NOW(), NOW()),
('Mirrors', 'bath', 'each', 150, 50, 0, false, 'Bathroom mirror', 'default-org', NOW(), NOW()),
('Tub/Shower Enclosure', 'bath', 'each', 1600, 0, 0, false, 'Tub or shower enclosure', 'default-org', NOW(), NOW()),
('Toilet', 'bath', 'each', 250, 0, 0, false, 'Toilet with installation', 'default-org', NOW(), NOW()),
('Bath Faucet', 'bath', 'each', 150, 0, 0, false, 'Bathroom sink faucet', 'default-org', NOW(), NOW()),

-- Roofing
('Full Scope', 'roofing', 'sqft', 0, 0, 3.00, true, 'Complete roofing scope', 'default-org', NOW(), NOW()),

-- HVAC
('Full Scope', 'hvac', 'sqft', 0, 0, 12.00, true, 'Complete HVAC scope', 'default-org', NOW(), NOW()),

-- Insulation
('Full Scope', 'insulation', 'lot', 0, 0, 0, true, 'Complete insulation scope - get quote', 'default-org', NOW(), NOW()),

-- Plumbing
('Full Scope', 'plumbing', 'lot', 0, 0, 0, true, 'Complete plumbing scope - get quote', 'default-org', NOW(), NOW()),

-- Drywall
('Full Scope', 'drywall', 'lot', 0, 0, 0, true, 'Complete drywall scope - get quote', 'default-org', NOW(), NOW());
