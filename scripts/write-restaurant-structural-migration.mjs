import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Re-use generator logic inline
const rows = [
  ['Planning', 'Mobilization', 'LS', 1500, 0],
  ['Planning', 'Engineering coordination', 'LS', 750, 0],
  ['Planning', 'Permit/inspection allowance', 'LS', 0, 1000],
  ['Planning', 'Temporary shoring allowance', 'LS', 3500, 1000],
  ['Planning', 'Dumpster/debris handling', 'LS', 750, 1250],
  ['Planning', 'Temporary protection', 'LS', 750, 500],
  ['Site Prep', 'Interior selective demolition', 'LS', 2500, 250],
  ['Site Prep', 'Demo damaged framing', 'LF', 12, 0],
  ['Site Prep', 'Sawcut concrete', 'LF', 18, 4],
  ['Site Prep', 'Demo slab at footing locations', 'EA', 450, 75],
  ['Site Prep', 'Demo parapet masonry', 'SF', 35, 5],
  ['Site Prep', 'Demo lintel area masonry', 'SF', 40, 5],
  ['Excavation/Foundation', 'Excavate footing pits', 'EA', 650, 75],
  ['Excavation/Foundation', "New 3'x3'x8\" footings", 'EA', 850, 450],
  ['Excavation/Foundation', 'Reinforcing steel', 'EA', 250, 175],
  ['Excavation/Foundation', 'Concrete placement', 'CY', 1000, 300],
  ['Excavation/Foundation', 'Slab patching', 'SF', 45, 18],
  ['Excavation/Foundation', 'Base plate grout', 'EA', 125, 50],
  ['Rough Framing', '3 1/2" Sch. 40 pipe columns', 'EA', 650, 400],
  ['Rough Framing', 'Column install labor', 'EA', 750, 0],
  ['Rough Framing', 'Base/cap plates', 'EA', 450, 250],
  ['Rough Framing', 'Anchors', 'EA', 200, 75],
  ['Rough Framing', 'W8x15 lintel replacement', 'LF', 275, 125],
  ['Rough Framing', 'W8x15 beam install', 'LF', 250, 125],
  ['Rough Framing', 'New double 2x10 joists', 'LF', 22, 16],
  ['Rough Framing', 'Sister joists', 'LF', 18, 14],
  ['Rough Framing', 'Rim board replacement', 'LF', 28, 18],
  ['Rough Framing', '2x6 nailer at beam', 'LF', 24, 8],
  ['Rough Framing', 'Joist hanger install', 'EA', 40, 20],
  ['Rough Framing', 'Joist end repairs', 'EA', 175, 75],
  ['Rough Framing', 'Blocking/misc framing', 'LS', 1250, 500],
  ['Rough Framing', 'Welding allowance', 'LS', 2500, 500],
  ['Masonry/Paving', 'Rebuild parapet wall', 'SF', 120, 45],
  ['Masonry/Paving', 'Brick veneer rebuild', 'SF', 95, 45],
  ['Masonry/Paving', 'Flashing install', 'LF', 35, 18],
  ['Masonry/Paving', 'Waterproofing', 'SF', 12, 8],
  ['Masonry/Paving', 'Masonry patching', 'SF', 85, 35],
  ['Masonry/Paving', 'Tuckpointing allowance', 'SF', 35, 10],
  ['Plumbing', 'Remove grease interceptor', 'EA', 750, 0],
  ['Plumbing', 'New grease interceptor', 'EA', 1250, 2500],
  ['Plumbing', 'Prep sink install', 'EA', 650, 1100],
  ['Plumbing', 'Floor sinks', 'EA', 550, 450],
  ['Plumbing', 'Mixing valves', 'EA', 175, 250],
  ['Plumbing', 'Domestic water piping', 'LF', 28, 18],
  ['Plumbing', 'Sanitary piping', 'LF', 35, 22],
  ['Plumbing', 'Water heater replacement', 'EA', 1000, 1800],
  ['Plumbing', 'Fixture replacements', 'EA', 450, 650],
  ['Electrical', 'Replace damaged wiring', 'LS', 2000, 750],
  ['Electrical', 'Receptacle replacement', 'EA', 125, 45],
  ['Electrical', 'Lighting fixture replacement', 'EA', 150, 125],
  ['Electrical', 'Kitchen reconnects', 'EA', 250, 75],
  ['Electrical', 'New circuits', 'EA', 650, 300],
  ['HVAC', 'Exhaust hood modifications', 'LS', 2500, 1500],
  ['HVAC', 'Duct modifications', 'LF', 75, 45],
  ['HVAC', 'Register/diffuser relocation', 'EA', 250, 150],
  ['HVAC', 'Equipment reconnects', 'EA', 450, 150],
  ['Drywall', 'Drywall patching', 'SF', 8, 3],
  ['Drywall', 'Ceiling patching', 'SF', 10, 4],
  ['Drywall', 'Fire tape/finish patching', 'SF', 6, 2],
  ['Interior Finishes', 'Paint touch-up', 'SF', 3, 1],
  ['Interior Finishes', 'Flooring patching', 'SF', 18, 12],
  ['Interior Finishes', 'Base replacement', 'LF', 6, 4],
  ['Interior Finishes', 'Finish carpentry touch-up', 'LS', 750, 300],
  ['Kitchen', 'Kitchen renovation coordination', 'LS', 750, 0],
  ['Kitchen', 'Equipment disconnect/reconnect', 'EA', 350, 100],
  ['Other', 'Concealed condition allowance', 'LS', 5000, 0],
  ['Other', 'Utility conflict allowance', 'LS', 2500, 0],
  ['Other', 'After-hours work allowance', 'LS', 3500, 0],
]

const catMap = {
  Planning: 'planning',
  'Site Prep': 'site-prep',
  'Excavation/Foundation': 'excavation-foundation',
  'Rough Framing': 'rough-framing',
  'Masonry/Paving': 'masonry-paving',
  Plumbing: 'plumbing',
  Electrical: 'electrical',
  HVAC: 'hvac',
  Drywall: 'drywall',
  'Interior Finishes': 'interior-finishes',
  Kitchen: 'kitchen',
  Other: 'other',
}

const groupMap = {
  planning: 'admin',
  'site-prep': 'exterior',
  'excavation-foundation': 'exterior',
  'rough-framing': 'structure',
  'masonry-paving': 'exterior',
  plumbing: 'mep',
  electrical: 'mep',
  hvac: 'mep',
  drywall: 'interior',
  'interior-finishes': 'interior',
  kitchen: 'interior',
  other: 'other',
}

const unitMap = { LS: 'lot', LF: 'linear_ft', EA: 'each', SF: 'sqft', CY: 'cubic_yd' }

const trades = rows.map(([cat, name, unit, labor, material], i) => {
  const category = catMap[cat]
  return {
    name,
    unit: unitMap[unit],
    category,
    group: groupMap[category],
    quantity: 0,
    subItems: [],
    laborCost: 0,
    laborRate: labor,
    laborHours: 0,
    materialCost: 0,
    materialRate: material,
    sortOrder: i + 1,
    totalCost: 0,
    description: '',
    wasteFactor: 0,
    markupPercent: 11.1,
    estimateStatus: 'budget',
    isSubcontracted: false,
    subcontractorCost: 0,
    subcontractorRate: 0,
    budgetTotalCost: 0,
    notes: 'Starter rate — adjust after subcontractor feedback.',
  }
})

const tradesJson = JSON.stringify(trades)

const sql = `-- Restaurant Structural Renovation estimate book template (idempotent by slug per org).
-- Adds slug to estimate_templates and seeds starter line items with labor/material rates.

BEGIN;

ALTER TABLE public.estimate_templates
  ADD COLUMN IF NOT EXISTS slug text;

COMMENT ON COLUMN public.estimate_templates.slug IS
  'Stable key for idempotent system seeds (e.g. restaurant-structural-renovation-building-repair).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_estimate_templates_org_slug
  ON public.estimate_templates (organization_id, slug)
  WHERE slug IS NOT NULL;

-- Seed one template per organization (first admin/editor profile as owner).
INSERT INTO public.estimate_templates (
  user_id,
  organization_id,
  name,
  description,
  slug,
  trades,
  default_markup_percent,
  default_contingency_percent,
  usage_count,
  linked_plan_ids
)
SELECT
  p.id,
  o.id,
  'Restaurant Structural Renovation / Building Repair',
  'Starter estimate book for restaurant structural renovation and building repair. Line items use placeholder quantities (0) and starter labor/material unit rates — adjust after subcontractor feedback.',
  'restaurant-structural-renovation-building-repair',
  $trades_seed$${tradesJson}$trades_seed$::jsonb,
  11.1,
  10,
  0,
  '[]'::jsonb
FROM public.organizations o
JOIN LATERAL (
  SELECT id
  FROM public.profiles
  WHERE organization_id = o.id
    AND role IN ('admin', 'editor')
  ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, created_at
  LIMIT 1
) p ON true
ON CONFLICT (organization_id, slug) WHERE slug IS NOT NULL DO NOTHING;

COMMIT;
`

const outPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260519_restaurant_structural_renovation_estimate_template.sql'
)
fs.writeFileSync(outPath, sql, 'utf8')
console.log('Wrote', outPath, 'with', trades.length, 'trades')
