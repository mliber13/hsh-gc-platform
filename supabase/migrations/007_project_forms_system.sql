-- ============================================================================
-- HSH GC Platform - Project Forms System Migration
-- ============================================================================
-- 
-- Creates a flexible form system using JSONB to handle all project forms
-- without requiring hundreds of database columns
--

-- ============================================================================
-- FORM TEMPLATES TABLE
-- ============================================================================
-- Stores reusable form definitions that can be used across projects

CREATE TABLE form_templates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL,
  
  -- Template identification
  template_name TEXT NOT NULL,
  form_type TEXT NOT NULL, -- 'architect_verification', 'closing_checklist', 'due_diligence', 'selections'
  version TEXT DEFAULT '1.0',
  
  -- Form structure definition (JSONB)
  form_schema JSONB NOT NULL,
  
  -- Template metadata
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_form_templates_organization_id ON form_templates(organization_id);
CREATE INDEX idx_form_templates_form_type ON form_templates(form_type);
CREATE INDEX idx_form_templates_is_active ON form_templates(is_active);

-- ============================================================================
-- PROJECT FORMS TABLE
-- ============================================================================
-- Stores actual form instances for specific projects

CREATE TABLE project_forms (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id UUID REFERENCES projects ON DELETE CASCADE,
  template_id UUID REFERENCES form_templates ON DELETE SET NULL,
  
  -- Form identification
  form_type TEXT NOT NULL,
  form_name TEXT NOT NULL,
  version TEXT DEFAULT '1.0',
  
  -- Form structure (copied from template for versioning)
  form_schema JSONB NOT NULL,
  
  -- Form data (JSONB - stores the actual responses)
  form_data JSONB DEFAULT '{}',
  
  -- Status tracking
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed', 'approved')),
  
  -- Sign-offs (JSONB - stores signature data)
  sign_offs JSONB DEFAULT '{}',
  
  -- Metadata
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_project_forms_organization_id ON project_forms(organization_id);
CREATE INDEX idx_project_forms_project_id ON project_forms(project_id);
CREATE INDEX idx_project_forms_form_type ON project_forms(form_type);
CREATE INDEX idx_project_forms_status ON project_forms(status);
CREATE INDEX idx_project_forms_created_at ON project_forms(created_at DESC);

-- JSONB indexes for common queries
CREATE INDEX idx_project_forms_form_data_gin ON project_forms USING GIN (form_data);
CREATE INDEX idx_project_forms_sign_offs_gin ON project_forms USING GIN (sign_offs);

-- ============================================================================
-- FORM RESPONSES TABLE (Optional - for detailed field tracking)
-- ============================================================================
-- Stores individual field responses for detailed tracking and analytics

CREATE TABLE form_responses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_form_id UUID REFERENCES project_forms ON DELETE CASCADE,
  
  -- Field identification
  field_id TEXT NOT NULL,
  field_type TEXT NOT NULL, -- 'text', 'checkbox', 'select', 'number', 'date', 'signature'
  section_id TEXT, -- Optional grouping
  
  -- Response data
  response_value JSONB,
  
  -- Metadata
  responded_by UUID REFERENCES auth.users,
  responded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_form_responses_organization_id ON form_responses(organization_id);
CREATE INDEX idx_form_responses_project_form_id ON form_responses(project_form_id);
CREATE INDEX idx_form_responses_field_id ON form_responses(field_id);
CREATE INDEX idx_form_responses_responded_at ON form_responses(responded_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Form Templates RLS
ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view organization form templates"
  ON form_templates FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

CREATE POLICY "Editors and admins can manage form templates"
  ON form_templates FOR ALL
  USING (organization_id = get_user_organization() AND user_can_edit());

-- Project Forms RLS
ALTER TABLE project_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view organization project forms"
  ON project_forms FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

CREATE POLICY "Editors and admins can create project forms"
  ON project_forms FOR INSERT
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

CREATE POLICY "Editors and admins can update project forms"
  ON project_forms FOR UPDATE
  USING (organization_id = get_user_organization() AND user_can_edit());

CREATE POLICY "Only admins can delete project forms"
  ON project_forms FOR DELETE
  USING (organization_id = get_user_organization() AND user_is_admin());

-- Form Responses RLS
ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view organization form responses"
  ON form_responses FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

CREATE POLICY "Editors and admins can manage form responses"
  ON form_responses FOR ALL
  USING (organization_id = get_user_organization() AND user_can_edit());

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Add updated_at triggers
CREATE TRIGGER update_form_templates_updated_at BEFORE UPDATE ON form_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_forms_updated_at BEFORE UPDATE ON project_forms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get form completion percentage
CREATE OR REPLACE FUNCTION get_form_completion_percentage(form_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  total_fields INTEGER;
  completed_fields INTEGER;
  form_data JSONB;
BEGIN
  -- Get form data
  SELECT pf.form_data INTO form_data
  FROM project_forms pf
  WHERE pf.id = form_id;
  
  -- This is a simplified calculation - in practice you'd count actual fields
  -- For now, return 0 if no data, 100 if has data
  IF form_data IS NULL OR form_data = '{}'::jsonb THEN
    RETURN 0;
  ELSE
    RETURN 100;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if form is fully signed off
CREATE OR REPLACE FUNCTION is_form_fully_signed_off(form_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  sign_offs JSONB;
  required_sign_offs JSONB;
  sign_off_key TEXT;
  sign_off_data JSONB;
BEGIN
  -- Get sign-offs and required sign-offs from form schema
  SELECT pf.sign_offs, pf.form_schema->'sign_offs' 
  INTO sign_offs, required_sign_offs
  FROM project_forms pf
  WHERE pf.id = form_id;
  
  -- Check if all required sign-offs are present
  IF required_sign_offs IS NULL THEN
    RETURN true; -- No sign-offs required
  END IF;
  
  -- Loop through required sign-offs
  FOR sign_off_key IN SELECT jsonb_object_keys(required_sign_offs)
  LOOP
    sign_off_data := sign_offs->sign_off_key;
    
    -- Check if this sign-off exists and has required fields
    IF sign_off_data IS NULL OR 
       sign_off_data->>'name' IS NULL OR 
       sign_off_data->>'signature' IS NULL THEN
      RETURN false;
    END IF;
  END LOOP;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- INSERT DEFAULT HSH FORM TEMPLATES
-- ============================================================================

-- Architect Engineer Verification Template
INSERT INTO form_templates (organization_id, template_name, form_type, form_schema, created_by) VALUES
('default-org', 'HSH Architect Engineer Verification', 'architect_verification', 
'{
  "sections": [
    {
      "id": "project_info",
      "title": "Project Information",
      "fields": [
        {
          "id": "project_name",
          "type": "text",
          "label": "Project Name",
          "required": true
        },
        {
          "id": "lot_number_address",
          "type": "text", 
          "label": "Lot Number / Address",
          "required": true
        },
        {
          "id": "model_plan_name",
          "type": "text",
          "label": "Model / Plan Name",
          "required": true
        },
        {
          "id": "architect_engineer",
          "type": "text",
          "label": "Architect / Engineer",
          "required": true
        },
        {
          "id": "date",
          "type": "date",
          "label": "Date",
          "required": true
        }
      ]
    },
    {
      "id": "foundation_structure",
      "title": "Foundation & Structure",
      "fields": [
        {
          "id": "foundation_type",
          "type": "select",
          "label": "Foundation Type",
          "options": ["Full Basement", "Crawl Space", "Slab-on-Grade"],
          "required": true
        },
        {
          "id": "foundation_walls",
          "type": "select",
          "label": "Foundation Walls",
          "options": ["Poured Concrete", "Block", "ICF"],
          "required": true
        },
        {
          "id": "basement_height",
          "type": "number",
          "label": "Basement Height (ft)",
          "required": false
        },
        {
          "id": "floor_system",
          "type": "select",
          "label": "Floor System",
          "options": ["Engineered Joists", "Dimensional Lumber", "Concrete Slab"],
          "required": true
        },
        {
          "id": "framing_type",
          "type": "select",
          "label": "Framing Type",
          "options": ["Wood", "Metal Stud"],
          "required": true
        },
        {
          "id": "exterior_walls",
          "type": "select",
          "label": "Exterior Walls",
          "options": ["2x4", "2x6"],
          "required": true
        },
        {
          "id": "sheathing",
          "type": "select",
          "label": "Sheathing",
          "options": ["OSB", "Plywood", "Zip System"],
          "required": true
        },
        {
          "id": "roof_framing",
          "type": "select",
          "label": "Roof Framing",
          "options": ["Trusses", "Rafters"],
          "required": true
        },
        {
          "id": "roof_pitch",
          "type": "number",
          "label": "Roof Pitch",
          "required": true
        },
        {
          "id": "attic_type",
          "type": "select",
          "label": "Attic Type",
          "options": ["Vented", "Conditioned"],
          "required": true
        }
      ]
    },
    {
      "id": "exterior_design",
      "title": "Exterior Design",
      "fields": [
        {
          "id": "siding_type",
          "type": "select",
          "label": "Siding Type",
          "options": ["Vinyl", "Cement Board", "Brick", "Metal"],
          "required": true
        },
        {
          "id": "stone_masonry",
          "type": "select",
          "label": "Stone or Masonry",
          "options": ["Yes", "No"],
          "required": true
        },
        {
          "id": "stone_location",
          "type": "text",
          "label": "Stone/Masonry Location",
          "required": false
        },
        {
          "id": "roofing_material",
          "type": "select",
          "label": "Roofing Material",
          "options": ["Asphalt", "Metal", "Tile"],
          "required": true
        },
        {
          "id": "roof_color",
          "type": "text",
          "label": "Roof Color",
          "required": true
        },
        {
          "id": "fascia_soffit",
          "type": "select",
          "label": "Fascia / Soffit",
          "options": ["Aluminum", "Vinyl", "Wood"],
          "required": true
        },
        {
          "id": "gutters_downspouts",
          "type": "select",
          "label": "Gutter / Downspouts",
          "options": ["Yes", "No"],
          "required": true
        }
      ]
    }
  ],
  "sign_offs": {
    "project_manager": {
      "label": "Project Manager Verification",
      "required": true
    },
    "architect_engineer": {
      "label": "Architect / Engineer Verification", 
      "required": true
    },
    "owner_executive": {
      "label": "Owner / Executive Approval",
      "required": true
    }
  }
}'::jsonb, 
(SELECT id FROM auth.users LIMIT 1));

-- Closing Site Start Checklist Template
INSERT INTO form_templates (organization_id, template_name, form_type, form_schema, created_by) VALUES
('default-org', 'HSH Closing Site Start Checklist', 'closing_checklist',
'{
  "sections": [
    {
      "id": "project_info",
      "title": "Project Information",
      "fields": [
        {
          "id": "property_address",
          "type": "text",
          "label": "Property Address",
          "required": true
        },
        {
          "id": "owner_project",
          "type": "text",
          "label": "Owner / Project",
          "required": true
        },
        {
          "id": "date",
          "type": "date",
          "label": "Date",
          "required": true
        },
        {
          "id": "prepared_by",
          "type": "text",
          "label": "Prepared By",
          "required": true
        }
      ]
    },
    {
      "id": "utility_setup",
      "title": "Utility Setup",
      "fields": [
        {
          "id": "electric_service",
          "type": "checkbox",
          "label": "Request electric service activation",
          "required": false
        },
        {
          "id": "gas_service",
          "type": "checkbox",
          "label": "Request gas service activation",
          "required": false
        },
        {
          "id": "water_service",
          "type": "checkbox",
          "label": "Request water service activation",
          "required": false
        },
        {
          "id": "sewer_connection",
          "type": "checkbox",
          "label": "Verify sewer connection or septic setup",
          "required": false
        },
        {
          "id": "utility_accounts",
          "type": "checkbox",
          "label": "Confirm utility account numbers recorded",
          "required": false
        }
      ]
    },
    {
      "id": "site_readiness",
      "title": "Site Readiness",
      "fields": [
        {
          "id": "portable_restroom",
          "type": "checkbox",
          "label": "Portable restroom delivered and placed properly",
          "required": false
        },
        {
          "id": "dumpster_delivered",
          "type": "checkbox",
          "label": "Dumpster delivered and set on driveway or gravel area",
          "required": false
        },
        {
          "id": "erosion_control",
          "type": "checkbox",
          "label": "Verify erosion control (silt fence, inlet protection, etc.) in place",
          "required": false
        },
        {
          "id": "site_access",
          "type": "checkbox",
          "label": "Check for clear site access for equipment and deliveries",
          "required": false
        },
        {
          "id": "address_signage",
          "type": "checkbox",
          "label": "Confirm address signage visible from road",
          "required": false
        }
      ]
    }
  ],
  "sign_offs": {
    "completed_by": {
      "label": "Completed By",
      "required": true
    },
    "reviewed_by_pm": {
      "label": "Reviewed By (PM)",
      "required": true
    }
  }
}'::jsonb,
(SELECT id FROM auth.users LIMIT 1));

-- Due Diligence Checklist Template
INSERT INTO form_templates (organization_id, template_name, form_type, form_schema, created_by) VALUES
('default-org', 'HSH Due Diligence Checklist', 'due_diligence',
'{
  "sections": [
    {
      "id": "project_info",
      "title": "Project Information",
      "fields": [
        {
          "id": "project_name",
          "type": "text",
          "label": "Project Name",
          "required": true
        },
        {
          "id": "property_address",
          "type": "text",
          "label": "Property Address",
          "required": true
        },
        {
          "id": "acquisition_type",
          "type": "select",
          "label": "Acquisition Type",
          "options": ["Purchase", "Lease", "Development"],
          "required": true
        },
        {
          "id": "prepared_by",
          "type": "text",
          "label": "Prepared By",
          "required": true
        },
        {
          "id": "date",
          "type": "date",
          "label": "Date",
          "required": true
        }
      ]
    },
    {
      "id": "property_verification",
      "title": "Property Verification",
      "fields": [
        {
          "id": "parcel_number",
          "type": "checkbox",
          "label": "Obtain parcel number(s) and legal description",
          "required": false
        },
        {
          "id": "title_report",
          "type": "checkbox",
          "label": "Verify current ownership and obtain title report",
          "required": false
        },
        {
          "id": "deed_restrictions",
          "type": "checkbox",
          "label": "Review deed restrictions, easements, and encroachments",
          "required": false
        },
        {
          "id": "property_boundaries",
          "type": "checkbox",
          "label": "Confirm property boundaries and access rights",
          "required": false
        },
        {
          "id": "zoning_verification",
          "type": "checkbox",
          "label": "Verify zoning designation and allowable uses",
          "required": false
        },
        {
          "id": "flood_zone",
          "type": "checkbox",
          "label": "Confirm flood zone status and obtain FEMA map",
          "required": false
        },
        {
          "id": "soil_conditions",
          "type": "checkbox",
          "label": "Verify soil type and topographic conditions",
          "required": false
        },
        {
          "id": "utility_availability",
          "type": "checkbox",
          "label": "Confirm utility availability (water, sewer, gas, electric, communications)",
          "required": false
        },
        {
          "id": "site_photographs",
          "type": "checkbox",
          "label": "Photograph existing site conditions and neighboring uses",
          "required": false
        }
      ]
    }
  ],
  "sign_offs": {
    "project_manager": {
      "label": "Due Diligence Conducted By (Project Manager)",
      "required": true
    },
    "owner_executive": {
      "label": "Owner / Executive Approval",
      "required": true
    }
  }
}'::jsonb,
(SELECT id FROM auth.users LIMIT 1));

-- Selections Sheet Template
INSERT INTO form_templates (organization_id, template_name, form_type, form_schema, created_by) VALUES
('default-org', 'HSH Selection Sheet & Checklist', 'selections',
'{
  "sections": [
    {
      "id": "project_info",
      "title": "Project Information",
      "fields": [
        {
          "id": "project_name",
          "type": "text",
          "label": "Project Name",
          "required": true
        },
        {
          "id": "lot_address",
          "type": "text",
          "label": "Lot / Address",
          "required": true
        },
        {
          "id": "model_plan",
          "type": "text",
          "label": "Model / Plan",
          "required": true
        },
        {
          "id": "owner_buyer",
          "type": "text",
          "label": "Owner / Buyer",
          "required": true
        },
        {
          "id": "prepared_by",
          "type": "text",
          "label": "Prepared By (PM/Designer)",
          "required": true
        },
        {
          "id": "date",
          "type": "date",
          "label": "Date",
          "required": true
        }
      ]
    },
    {
      "id": "exterior_selections",
      "title": "Exterior Selections",
      "fields": [
        {
          "id": "siding_type_color",
          "type": "text",
          "label": "Siding Type & Color (ProVia)",
          "required": false
        },
        {
          "id": "accent_siding",
          "type": "text",
          "label": "Accent Siding (Board & Batten / Shake, ProVia)",
          "required": false
        },
        {
          "id": "stone_masonry",
          "type": "text",
          "label": "Stone / Masonry (Type & Location)",
          "required": false
        },
        {
          "id": "soffit_fascia",
          "type": "text",
          "label": "Soffit & Fascia (Material & Color)",
          "required": false
        },
        {
          "id": "roofing",
          "type": "text",
          "label": "Roofing (Owens Corning – Series/Color)",
          "required": false
        },
        {
          "id": "front_door",
          "type": "text",
          "label": "Front Door (ProVia – Style/Color)",
          "required": false
        },
        {
          "id": "windows",
          "type": "text",
          "label": "Windows (ProVia – Series/Color)",
          "required": false
        },
        {
          "id": "garage_doors",
          "type": "text",
          "label": "Garage Doors (Style/Color)",
          "required": false
        },
        {
          "id": "railings_deck",
          "type": "text",
          "label": "Railings / Deck Systems (Shapes Unlimited – Finish)",
          "required": false
        },
        {
          "id": "exterior_lighting",
          "type": "text",
          "label": "Exterior Lighting (Fixture/Finish)",
          "required": false
        }
      ]
    },
    {
      "id": "interior_paint",
      "title": "Interior Paint Selections (Room-by-Room)",
      "fields": [
        {
          "id": "living_room_wall",
          "type": "text",
          "label": "Living Room – Wall Color (Eggshell)",
          "required": false
        },
        {
          "id": "living_room_ceiling",
          "type": "text",
          "label": "Living Room – Ceiling Color (Flat)",
          "required": false
        },
        {
          "id": "kitchen_wall",
          "type": "text",
          "label": "Kitchen – Wall Color (Eggshell)",
          "required": false
        },
        {
          "id": "kitchen_ceiling",
          "type": "text",
          "label": "Kitchen – Ceiling Color (Flat)",
          "required": false
        },
        {
          "id": "dining_room",
          "type": "text",
          "label": "Dining Room – Wall (Eggshell) / Ceiling (Flat)",
          "required": false
        },
        {
          "id": "master_bedroom",
          "type": "text",
          "label": "Master Bedroom – Wall (Eggshell) / Ceiling (Flat)",
          "required": false
        },
        {
          "id": "bedroom_2",
          "type": "text",
          "label": "Bedroom 2 – Wall (Eggshell) / Ceiling (Flat)",
          "required": false
        },
        {
          "id": "bedroom_3",
          "type": "text",
          "label": "Bedroom 3 – Wall (Eggshell) / Ceiling (Flat)",
          "required": false
        },
        {
          "id": "hallways",
          "type": "text",
          "label": "Hallways – Wall (Eggshell) / Ceiling (Flat)",
          "required": false
        },
        {
          "id": "bathrooms",
          "type": "text",
          "label": "Bathrooms – Wall (Eggshell) / Ceiling (Flat)",
          "required": false
        },
        {
          "id": "basement_rec",
          "type": "text",
          "label": "Basement / Rec Area – Wall (Eggshell) / Ceiling (Flat)",
          "required": false
        },
        {
          "id": "accent_walls",
          "type": "text",
          "label": "Accent Walls / Specialty Finishes (Describe Location & Color)",
          "required": false
        }
      ]
    }
  ],
  "sign_offs": {
    "project_manager": {
      "label": "Project Manager Verification",
      "required": true
    },
    "designer_buyer": {
      "label": "Designer / Buyer Approval",
      "required": true
    }
  }
}'::jsonb,
(SELECT id FROM auth.users LIMIT 1));

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE form_templates IS 'Reusable form templates for different project forms';
COMMENT ON TABLE project_forms IS 'Actual form instances for specific projects';
COMMENT ON TABLE form_responses IS 'Individual field responses for detailed tracking';
COMMENT ON COLUMN project_forms.form_schema IS 'JSONB structure defining the form fields and layout';
COMMENT ON COLUMN project_forms.form_data IS 'JSONB object storing all form responses';
COMMENT ON COLUMN project_forms.sign_offs IS 'JSONB object storing signature and approval data';
