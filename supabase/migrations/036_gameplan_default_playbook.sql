-- ============================================================================
-- Migration: HSH default playbook (global, editable by admins)
-- ============================================================================
-- This is the built-in default that can evolve over time. All users can read;
-- only admins can modify. Used when an org has no custom playbook.

CREATE TABLE IF NOT EXISTS gameplan_default_playbook (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  chapter_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  owner TEXT NOT NULL CHECK (owner IN ('GC', 'SUB', 'IN_HOUSE', 'SUPPLIER')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gameplan_default_playbook_chapter ON gameplan_default_playbook(chapter_key);

ALTER TABLE gameplan_default_playbook ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read
CREATE POLICY "Authenticated users can view default playbook"
  ON gameplan_default_playbook FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can modify (role from profiles)
CREATE POLICY "Admins can insert default playbook"
  ON gameplan_default_playbook FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT COALESCE(role, 'viewer') FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Admins can update default playbook"
  ON gameplan_default_playbook FOR UPDATE
  TO authenticated
  USING (
    (SELECT COALESCE(role, 'viewer') FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Admins can delete default playbook"
  ON gameplan_default_playbook FOR DELETE
  TO authenticated
  USING (
    (SELECT COALESCE(role, 'viewer') FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- ============================================================================
-- Seed: HSH default plays (run once; safe to re-run if table is empty)
-- ============================================================================
INSERT INTO gameplan_default_playbook (chapter_key, title, description, owner, sort_order)
SELECT * FROM (VALUES
  ('pre_con', 'Finalize Construction Plans', 'Confirm plans permit-ready; resolve design/structural/code issues; issue plans for construction (IFC).', 'GC', 1),
  ('pre_con', 'Permits', 'Submit for all required permits; track permit approvals and numbers.', 'GC', 2),
  ('pre_con', 'Material Procurement', 'Identify major materials; place orders and confirm lead times; secure materials onsite or offsite per schedule.', 'GC', 3),
  ('pre_con', 'Subcontractor Buy-Out & Scheduling', 'Secure all required subcontractors; confirm scope, pricing, and sequencing; establish tentative start windows.', 'GC', 4),
  ('pre_con', 'Power Coordination', 'Obtain work order numbers for temporary and permanent power; coordinate meter and service locations.', 'GC', 5),
  ('pre_con', 'Gas Utility Coordination', 'Contact gas company; schedule site visit after framing for gas line installation.', 'GC', 6),
  ('foundation', 'Utility Verification & Tie-Ins', 'Call 811 for locates; confirm utilities marked; identify water and sewer tie-in locations.', 'GC', 1),
  ('foundation', 'Foundation Excavation', 'Excavate per plans; verify depth, layout, and bearing conditions.', 'SUB', 2),
  ('foundation', 'Footer Layout & Drainage', 'Frame footers; install footer drains; confirm sump pump location and drain routing.', 'SUB', 3),
  ('foundation', 'Footer Pours', 'Pour perimeter and interior footers; schedule and pass inspections.', 'SUB', 4),
  ('foundation', 'Basement Gravel Base', 'Cover drainage system; bring floor elevation level with footers.', 'SUB', 5),
  ('foundation', 'Foundation Walls', 'Install foundation walls; confirm all wall openings prior to install.', 'SUB', 6),
  ('foundation', 'Waterproofing & Below-Grade Insulation', 'Waterproof all below-grade walls; install insulation.', 'SUB', 7),
  ('foundation', 'Backfill', 'Backfill with #57 gravel.', 'SUB', 8),
  ('foundation', 'Basement Floor Slab', 'Confirm drains and bathroom rough-ins; pour slab.', 'SUB', 9),
  ('framing_dry_in', 'Framing Readiness', 'Framing materials onsite; IFC plans onsite; window and door rough opening info finalized; foundation inspections passed.', 'GC', 1),
  ('framing_dry_in', 'Wood Framing', 'Complete all structural framing per plans.', 'SUB', 2),
  ('framing_dry_in', 'Windows & Exterior Doors', 'Install immediately after framing to seal structure.', 'SUB', 3),
  ('framing_dry_in', 'Blocking for Cabinets & Accessories', 'Install blocking for cabinets, handrails, grab bars, towel bars, and accessories.', 'SUB', 4),
  ('framing_dry_in', 'Garage Opening Temporary Access', 'Frame garage opening with plywood; install hinged temporary access door.', 'GC', 5),
  ('framing_dry_in', 'Roofing & Exterior Envelope', 'Roofing, siding, fascia, soffits, gutters installed.', 'SUB', 6),
  ('mep_rough', 'Plumbing Rough-In', 'Tubs and shower valves onsite prior to start.', 'SUB', 1),
  ('mep_rough', 'HVAC Rough-In', NULL, 'SUB', 2),
  ('mep_rough', 'Electrical Rough-In', NULL, 'SUB', 3),
  ('mep_rough', 'Exterior Coordination for MEP', 'Siding and exterior components required for penetrations onsite.', 'GC', 4),
  ('insulation', 'Insulation', 'Install insulation and pass inspection.', 'SUB', 1),
  ('drywall', 'Drywall', 'Floors papered before finishing; in cold months, heat must be operational before drywall begins.', 'SUB', 1),
  ('drywall', 'Garage Door Installation', 'Install garage door after drywall finishing.', 'SUB', 2),
  ('finishes', 'Prime & Ceiling Finish', 'Prime all walls and ceilings; final coat on ceilings.', 'SUB', 1),
  ('finishes', 'Carpentry & Cabinet Installation', 'Cabinets, trim, interior doors, finish panels; exterior doors covered and protected; thresholds protected.', 'SUB', 2),
  ('finishes', 'Countertop Measurement', 'Measure after cabinets installed; typical lead time approximately 2 weeks.', 'GC', 3),
  ('finishes', 'Final Paint', 'Two coats on trim; two coats on walls.', 'SUB', 4),
  ('finishes', 'Final Trade Sequencing', '1) Final electrical 2) Flooring 3) Final HVAC 4) Countertops 5) Final plumbing.', 'GC', 5),
  ('finishes', 'Countertop Protection', 'Countertops covered immediately after install.', 'GC', 6),
  ('finishes', 'Appliances', 'Deliver and install appliances.', 'SUB', 7),
  ('finishes', 'Exterior Close-Out', 'Final grading and landscaping; pour driveways, porches, sidewalks.', 'SUB', 8),
  ('turnover', 'Turnover & Close-Out', 'All finishes complete; utilities active; exterior work complete; project ready for turnover.', 'GC', 1)
) AS t(chapter_key, title, description, owner, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM gameplan_default_playbook LIMIT 1);
