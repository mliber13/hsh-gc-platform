-- ============================================================================
-- Labor: QBO-imported wages + burden (Phase 1)
-- Extends existing labor_entries for idempotent QBO import and burden.
-- Manual and QBO labor are additive; display by source_system for clarity.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Extend labor_entries (canonical table for manual + QBO + future timeclock)
-- ----------------------------------------------------------------------------

-- Source and idempotency
ALTER TABLE labor_entries
  ADD COLUMN IF NOT EXISTS source_system TEXT DEFAULT 'manual' CHECK (source_system IN ('manual', 'qbo')),
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS import_batch_id UUID;

-- Period / work date (QBO JEs may have period; manual uses date)
ALTER TABLE labor_entries
  ADD COLUMN IF NOT EXISTS work_date DATE,
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE;

-- Employee/class for burden (Phase 1: mostly null → global rate)
ALTER TABLE labor_entries
  ADD COLUMN IF NOT EXISTS employee_id UUID,
  ADD COLUMN IF NOT EXISTS employee_class_id UUID;

-- Wages and burden (manual: amount = cost; QBO: gross_wages + burden_amount = amount)
ALTER TABLE labor_entries
  ADD COLUMN IF NOT EXISTS gross_wages NUMERIC,
  ADD COLUMN IF NOT EXISTS burden_amount NUMERIC;

-- Hours nullable for QBO (JE lines often have no hours)
ALTER TABLE labor_entries ALTER COLUMN hours DROP NOT NULL;

-- Idempotent import: one row per (source_system, source_id) when source_id set
CREATE UNIQUE INDEX IF NOT EXISTS idx_labor_entries_source_idempotent
  ON labor_entries (source_system, source_id)
  WHERE source_id IS NOT NULL;

-- Backfill existing rows as manual
UPDATE labor_entries SET source_system = 'manual' WHERE source_system IS NULL;

-- For existing manual rows: treat amount as total cost; gross_wages can stay null for display logic
COMMENT ON COLUMN labor_entries.source_system IS 'manual = app-entered; qbo = from QuickBooks JE import';
COMMENT ON COLUMN labor_entries.gross_wages IS 'Wage amount before burden; for QBO this is the JE line amount';
COMMENT ON COLUMN labor_entries.burden_amount IS 'Estimated burden (taxes, benefits, etc.); applied from labor_burden_rates';

-- ----------------------------------------------------------------------------
-- 2) employee_classes (optional; Phase 1 can use global rate only)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_classes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'default-org',
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_classes_organization ON employee_classes(organization_id);

-- ----------------------------------------------------------------------------
-- 3) labor_burden_rates (employee_class_id NULL = global default)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS labor_burden_rates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'default-org',
  employee_class_id UUID REFERENCES employee_classes(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('percent', 'per_hour')),
  value NUMERIC NOT NULL,
  effective_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_labor_burden_rates_org_class ON labor_burden_rates(organization_id, employee_class_id);
CREATE INDEX IF NOT EXISTS idx_labor_burden_rates_effective ON labor_burden_rates(effective_date);

COMMENT ON COLUMN labor_burden_rates.employee_class_id IS 'NULL = global default rate';

-- ----------------------------------------------------------------------------
-- 4) QBO wage allocation config (account IDs that count as wages in JE import)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qbo_wage_allocation_config (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'default-org' UNIQUE,
  account_ids TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE qbo_wage_allocation_config IS 'QBO account IDs used to detect wage JE lines for labor import';

-- ----------------------------------------------------------------------------
-- 5) Import batches (for admin import tool)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS labor_import_batches (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'default-org',
  source_system TEXT NOT NULL DEFAULT 'qbo',
  period_start DATE,
  period_end DATE,
  row_count INT NOT NULL DEFAULT 0,
  total_wages NUMERIC NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_labor_import_batches_org ON labor_import_batches(organization_id);

-- Per-line errors (optional; for debugging failed rows)
CREATE TABLE IF NOT EXISTS labor_import_errors (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES labor_import_batches(id) ON DELETE CASCADE,
  source_id TEXT,
  error_message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_labor_import_errors_batch ON labor_import_errors(batch_id);

-- ----------------------------------------------------------------------------
-- 6) Recalibration audit (monthly suggested burden %)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS labor_burden_recalibrations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'default-org',
  period_month DATE NOT NULL,
  total_gross_wages NUMERIC NOT NULL,
  total_burden_costs NUMERIC NOT NULL,
  suggested_percent NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_labor_burden_recalibrations_org ON labor_burden_recalibrations(organization_id);

-- ----------------------------------------------------------------------------
-- RLS (same pattern as labor_entries: get_user_organization, is_user_active, user_can_edit)
-- ----------------------------------------------------------------------------
ALTER TABLE employee_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_burden_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbo_wage_allocation_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_burden_recalibrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org employee_classes"
  ON employee_classes FOR SELECT USING (organization_id = get_user_organization() AND is_user_active());
CREATE POLICY "Editors can manage org employee_classes"
  ON employee_classes FOR ALL USING (organization_id = get_user_organization() AND user_can_edit());

CREATE POLICY "Users can view org labor_burden_rates"
  ON labor_burden_rates FOR SELECT USING (organization_id = get_user_organization() AND is_user_active());
CREATE POLICY "Editors can manage org labor_burden_rates"
  ON labor_burden_rates FOR ALL USING (organization_id = get_user_organization() AND user_can_edit());

CREATE POLICY "Users can view org qbo_wage_config"
  ON qbo_wage_allocation_config FOR SELECT USING (organization_id = get_user_organization() AND is_user_active());
CREATE POLICY "Editors can manage org qbo_wage_config"
  ON qbo_wage_allocation_config FOR ALL USING (organization_id = get_user_organization() AND user_can_edit());

CREATE POLICY "Users can view org labor_import_batches"
  ON labor_import_batches FOR SELECT USING (organization_id = get_user_organization() AND is_user_active());
CREATE POLICY "Editors can insert org labor_import_batches"
  ON labor_import_batches FOR INSERT WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

CREATE POLICY "Users can view org labor_import_errors"
  ON labor_import_errors FOR SELECT USING (
    EXISTS (SELECT 1 FROM labor_import_batches b WHERE b.id = batch_id AND b.organization_id = get_user_organization() AND is_user_active())
  );
CREATE POLICY "Editors can insert org labor_import_errors"
  ON labor_import_errors FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM labor_import_batches b WHERE b.id = batch_id AND b.organization_id = get_user_organization() AND user_can_edit())
  );

CREATE POLICY "Users can view org labor_burden_recalibrations"
  ON labor_burden_recalibrations FOR SELECT USING (organization_id = get_user_organization() AND is_user_active());
CREATE POLICY "Editors can manage org labor_burden_recalibrations"
  ON labor_burden_recalibrations FOR ALL USING (organization_id = get_user_organization() AND user_can_edit());
