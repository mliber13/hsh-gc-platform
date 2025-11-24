-- ============================================================================
-- Create Proforma Inputs Table
-- ============================================================================
-- 
-- Stores proforma generator inputs for projects so they can be shared across users/devices
--

CREATE TABLE IF NOT EXISTS proforma_inputs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  organization_id TEXT NOT NULL DEFAULT 'default-org',
  
  -- Contract and timeline
  contract_value NUMERIC(15, 2) NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  projection_months INTEGER NOT NULL CHECK (projection_months IN (6, 12, 24, 36, 60)),
  construction_completion_date DATE,
  total_project_square_footage NUMERIC(10, 2),
  
  -- Overhead
  monthly_overhead NUMERIC(15, 2) NOT NULL DEFAULT 0,
  overhead_method TEXT NOT NULL CHECK (overhead_method IN ('proportional', 'flat', 'none')) DEFAULT 'proportional',
  
  -- Payment milestones (stored as JSONB)
  payment_milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Rental income
  include_rental_income BOOLEAN NOT NULL DEFAULT false,
  rental_units JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Operating expenses
  include_operating_expenses BOOLEAN NOT NULL DEFAULT false,
  operating_expenses JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Debt service
  include_debt_service BOOLEAN NOT NULL DEFAULT false,
  debt_service JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one proforma input per project per user
  UNIQUE(project_id, user_id)
);

-- Indexes
CREATE INDEX idx_proforma_inputs_project_id ON proforma_inputs(project_id);
CREATE INDEX idx_proforma_inputs_user_id ON proforma_inputs(user_id);
CREATE INDEX idx_proforma_inputs_organization_id ON proforma_inputs(organization_id);

-- RLS Policies
ALTER TABLE proforma_inputs ENABLE ROW LEVEL SECURITY;

-- Update organization_id from project for existing rows (if any)
UPDATE proforma_inputs pi
SET organization_id = p.organization_id
FROM projects p
WHERE pi.project_id = p.id AND pi.organization_id = 'default-org';

CREATE POLICY "Users can view proforma inputs in their organization"
  ON proforma_inputs FOR SELECT
  USING (
    organization_id = get_user_organization() AND is_user_active() AND
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = proforma_inputs.project_id 
      AND projects.organization_id = get_user_organization()
    )
  );

CREATE POLICY "Editors and admins can create proforma inputs"
  ON proforma_inputs FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    organization_id = get_user_organization() AND user_can_edit() AND
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = proforma_inputs.project_id 
      AND projects.organization_id = get_user_organization()
    )
  );

CREATE POLICY "Users can update their own proforma inputs"
  ON proforma_inputs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own proforma inputs"
  ON proforma_inputs FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_proforma_inputs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_proforma_inputs_updated_at
  BEFORE UPDATE ON proforma_inputs
  FOR EACH ROW
  EXECUTE FUNCTION update_proforma_inputs_updated_at();

