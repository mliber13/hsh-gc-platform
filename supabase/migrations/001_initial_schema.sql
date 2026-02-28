-- ============================================================================
-- HSH GC Platform - Initial Database Schema
-- ============================================================================
-- 
-- Run this in your Supabase SQL Editor to create all tables
--

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PROFILES TABLE
-- ============================================================================

CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  company_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- PROJECTS TABLE
-- ============================================================================

CREATE TABLE projects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  project_number TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning',
  
  -- Address fields
  address JSONB,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  
  -- Client info
  client JSONB,
  
  -- Dates
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  projected_end_date TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);

-- RLS Policies
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- ESTIMATES TABLE
-- ============================================================================

CREATE TABLE estimates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects ON DELETE CASCADE NOT NULL,
  
  -- Totals
  totals JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_estimates_user_id ON estimates(user_id);
CREATE INDEX idx_estimates_project_id ON estimates(project_id);

-- RLS Policies
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own estimates"
  ON estimates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own estimates"
  ON estimates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own estimates"
  ON estimates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own estimates"
  ON estimates FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- TRADES (ESTIMATE LINE ITEMS) TABLE
-- ============================================================================

CREATE TABLE trades (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  estimate_id UUID REFERENCES estimates ON DELETE CASCADE NOT NULL,
  
  -- Trade details
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Quantities
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  
  -- Costs
  labor_cost NUMERIC DEFAULT 0,
  labor_rate NUMERIC DEFAULT 0,
  labor_hours NUMERIC DEFAULT 0,
  material_cost NUMERIC DEFAULT 0,
  material_rate NUMERIC DEFAULT 0,
  subcontractor_cost NUMERIC DEFAULT 0,
  total_cost NUMERIC DEFAULT 0,
  
  -- Flags
  is_subcontracted BOOLEAN DEFAULT false,
  waste_factor NUMERIC DEFAULT 0,
  markup_percent NUMERIC DEFAULT 20,
  
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_estimate_id ON trades(estimate_id);
CREATE INDEX idx_trades_category ON trades(category);

-- RLS Policies
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trades"
  ON trades FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own trades"
  ON trades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trades"
  ON trades FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trades"
  ON trades FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- PROJECT ACTUALS TABLE
-- ============================================================================

CREATE TABLE project_actuals (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects ON DELETE CASCADE NOT NULL,
  
  -- Totals
  labor_cost NUMERIC DEFAULT 0,
  material_cost NUMERIC DEFAULT 0,
  subcontractor_cost NUMERIC DEFAULT 0,
  total_actual NUMERIC DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_actuals_user_id ON project_actuals(user_id);
CREATE INDEX idx_actuals_project_id ON project_actuals(project_id);

-- RLS Policies
ALTER TABLE project_actuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own actuals"
  ON project_actuals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own actuals"
  ON project_actuals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own actuals"
  ON project_actuals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own actuals"
  ON project_actuals FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- ACTUAL ENTRIES TABLES
-- ============================================================================

-- Labor Entries
CREATE TABLE labor_entries (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects ON DELETE CASCADE NOT NULL,
  actuals_id UUID REFERENCES project_actuals ON DELETE CASCADE NOT NULL,
  
  category TEXT NOT NULL,
  trade_id UUID,
  description TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  hours NUMERIC NOT NULL,
  hourly_rate NUMERIC NOT NULL,
  amount NUMERIC NOT NULL,
  worker_name TEXT,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Material Entries
CREATE TABLE material_entries (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects ON DELETE CASCADE NOT NULL,
  actuals_id UUID REFERENCES project_actuals ON DELETE CASCADE NOT NULL,
  
  category TEXT NOT NULL,
  trade_id UUID,
  description TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  quantity NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL,
  amount NUMERIC NOT NULL,
  vendor TEXT,
  invoice_number TEXT,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subcontractor Entries
CREATE TABLE subcontractor_entries (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects ON DELETE CASCADE NOT NULL,
  actuals_id UUID REFERENCES project_actuals ON DELETE CASCADE NOT NULL,
  
  category TEXT NOT NULL,
  trade_id UUID,
  description TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  amount NUMERIC NOT NULL,
  subcontractor_name TEXT NOT NULL,
  invoice_number TEXT,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for actual entries
CREATE INDEX idx_labor_entries_user_id ON labor_entries(user_id);
CREATE INDEX idx_labor_entries_project_id ON labor_entries(project_id);
CREATE INDEX idx_material_entries_user_id ON material_entries(user_id);
CREATE INDEX idx_material_entries_project_id ON material_entries(project_id);
CREATE INDEX idx_subcontractor_entries_user_id ON subcontractor_entries(user_id);
CREATE INDEX idx_subcontractor_entries_project_id ON subcontractor_entries(project_id);

-- RLS Policies for labor entries
ALTER TABLE labor_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own labor entries"
  ON labor_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own labor entries"
  ON labor_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own labor entries"
  ON labor_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own labor entries"
  ON labor_entries FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for material entries
ALTER TABLE material_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own material entries"
  ON material_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own material entries"
  ON material_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own material entries"
  ON material_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own material entries"
  ON material_entries FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for subcontractor entries
ALTER TABLE subcontractor_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subcontractor entries"
  ON subcontractor_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own subcontractor entries"
  ON subcontractor_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subcontractor entries"
  ON subcontractor_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own subcontractor entries"
  ON subcontractor_entries FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- SCHEDULES TABLE
-- ============================================================================

CREATE TABLE schedules (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects ON DELETE CASCADE NOT NULL,
  
  items JSONB, -- Array of schedule items
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_schedules_user_id ON schedules(user_id);
CREATE INDEX idx_schedules_project_id ON schedules(project_id);

-- RLS Policies
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own schedules"
  ON schedules FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own schedules"
  ON schedules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own schedules"
  ON schedules FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own schedules"
  ON schedules FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- CHANGE ORDERS TABLE
-- ============================================================================

CREATE TABLE change_orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects ON DELETE CASCADE NOT NULL,
  
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  
  -- Cost impact
  cost_impact NUMERIC DEFAULT 0,
  affected_trades JSONB, -- Array of trade objects
  
  -- Dates
  requested_date TIMESTAMPTZ DEFAULT NOW(),
  approved_date TIMESTAMPTZ,
  implemented_date TIMESTAMPTZ,
  
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_change_orders_user_id ON change_orders(user_id);
CREATE INDEX idx_change_orders_project_id ON change_orders(project_id);
CREATE INDEX idx_change_orders_status ON change_orders(status);

-- RLS Policies
ALTER TABLE change_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own change orders"
  ON change_orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own change orders"
  ON change_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own change orders"
  ON change_orders FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own change orders"
  ON change_orders FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- PLANS TABLE (Plan Library)
-- ============================================================================

CREATE TABLE plans (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  
  plan_id TEXT NOT NULL, -- User-facing ID like "1416CN"
  name TEXT NOT NULL,
  description TEXT,
  
  -- Details
  square_footage NUMERIC,
  bedrooms INTEGER,
  bathrooms NUMERIC,
  stories INTEGER,
  garage_spaces INTEGER,
  
  -- Links
  estimate_template_id UUID,
  
  -- Documents and options stored as JSONB
  documents JSONB DEFAULT '[]',
  options JSONB DEFAULT '[]',
  
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_plans_user_id ON plans(user_id);
CREATE INDEX idx_plans_plan_id ON plans(plan_id);
CREATE INDEX idx_plans_is_active ON plans(is_active);

-- RLS Policies
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plans"
  ON plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own plans"
  ON plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own plans"
  ON plans FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own plans"
  ON plans FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- ITEM TEMPLATES TABLE
-- ============================================================================

CREATE TABLE item_templates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  default_unit TEXT NOT NULL,
  
  -- Default rates
  default_material_rate NUMERIC DEFAULT 0,
  default_labor_rate NUMERIC DEFAULT 0,
  default_subcontractor_cost NUMERIC DEFAULT 0,
  
  is_subcontracted BOOLEAN DEFAULT false,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_item_templates_user_id ON item_templates(user_id);
CREATE INDEX idx_item_templates_category ON item_templates(category);

-- RLS Policies
ALTER TABLE item_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own item templates"
  ON item_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own item templates"
  ON item_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own item templates"
  ON item_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own item templates"
  ON item_templates FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- ESTIMATE TEMPLATES TABLE
-- ============================================================================

CREATE TABLE estimate_templates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  
  name TEXT NOT NULL,
  description TEXT,
  
  -- Template data (stored as JSONB array)
  trades JSONB DEFAULT '[]',
  
  -- Default percentages
  default_markup_percent NUMERIC DEFAULT 20,
  default_contingency_percent NUMERIC DEFAULT 10,
  
  -- Metadata
  usage_count INTEGER DEFAULT 0,
  linked_plan_ids JSONB DEFAULT '[]',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_estimate_templates_user_id ON estimate_templates(user_id);

-- RLS Policies
ALTER TABLE estimate_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own estimate templates"
  ON estimate_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own estimate templates"
  ON estimate_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own estimate templates"
  ON estimate_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own estimate templates"
  ON estimate_templates FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers to all tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_estimates_updated_at BEFORE UPDATE ON estimates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON trades
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_actuals_updated_at BEFORE UPDATE ON project_actuals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_labor_entries_updated_at BEFORE UPDATE ON labor_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_material_entries_updated_at BEFORE UPDATE ON material_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subcontractor_entries_updated_at BEFORE UPDATE ON subcontractor_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_change_orders_updated_at BEFORE UPDATE ON change_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_item_templates_updated_at BEFORE UPDATE ON item_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_estimate_templates_updated_at BEFORE UPDATE ON estimate_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

