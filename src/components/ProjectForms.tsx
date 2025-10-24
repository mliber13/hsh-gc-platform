import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ArrowLeft, FileCheck, Plus, CheckCircle, Clock, Edit } from 'lucide-react';
import hshLogo from '/HSH Contractor Logo - Color.png';
import { supabase } from '../lib/supabase';

interface FormField {
  id: string;
  type: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'textarea';
  label: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

interface FormSection {
  id: string;
  title: string;
  fields: FormField[];
}

interface FormSchema {
  sections: FormSection[];
  sign_offs?: Record<string, { label: string; required: boolean }>;
}

interface ProjectForm {
  id: string;
  form_type: string;
  form_name: string;
  form_schema: FormSchema;
  form_data: Record<string, any>;
  status: 'draft' | 'in_progress' | 'completed' | 'approved';
  sign_offs: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface ProjectFormsProps {
  projectId: string;
  project?: {
    name: string;
    project_number?: string;
    status: string;
  };
  onBack?: () => void;
}

export const ProjectForms: React.FC<ProjectFormsProps> = ({ projectId, project, onBack }) => {
  const [forms, setForms] = useState<ProjectForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedForm, setSelectedForm] = useState<ProjectForm | null>(null);

  useEffect(() => {
    if (projectId) {
      loadProjectForms();
    }
  }, [projectId]);

  // Reload forms when component mounts
  useEffect(() => {
    if (projectId) {
      loadProjectForms();
    }
  }, []);

  const loadProjectForms = async () => {
    try {
      setLoading(true);
      console.log('Loading forms for project:', projectId);
      
      const { data, error } = await supabase
        .from('project_forms')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error loading forms:', error);
        return;
      }
      
      console.log('Loaded forms:', data);
      setForms(data || []);
    } catch (error) {
      console.error('Error loading forms:', error);
    } finally {
      setLoading(false);
    }
  };

  const createNewForm = async (formType: string) => {
    console.log('Creating new form:', formType);
    try {
      const { data, error } = await supabase
        .from('project_forms')
        .insert({
          organization_id: 'default-org', // TODO: Get from user context
          project_id: projectId,
          form_type: formType,
          form_name: getFormDisplayName(formType),
          form_schema: getFormTemplate(formType),
          form_data: {},
          status: 'draft'
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating form:', error);
        return;
      }

      console.log('Form created successfully:', data);
      
      // Reload forms to get the latest data
      await loadProjectForms();
      
      // Open the form for editing
      setSelectedForm(data);
      
    } catch (error) {
      console.error('Error creating form:', error);
    }
  };

  const deleteForm = async (formId: string) => {
    if (!confirm('Are you sure you want to delete this form? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('project_forms')
        .delete()
        .eq('id', formId);

      if (error) {
        console.error('Error deleting form:', error);
        return;
      }

      console.log('Form deleted successfully');
      
      // Reload forms to get the latest data
      await loadProjectForms();
      
      // Close the form if it's currently selected
      if (selectedForm?.id === formId) {
        setSelectedForm(null);
      }
      
    } catch (error) {
      console.error('Error deleting form:', error);
    }
  };

  const getFormDisplayName = (formType: string) => {
    const names: Record<string, string> = {
      'architect_verification': 'Architect Engineer Verification',
      'closing_checklist': 'Closing Site Start Checklist',
      'due_diligence': 'Due Diligence Checklist',
      'selections': 'Selection Sheet & Checklist'
    };
    return names[formType] || formType;
  };

  const getFormTemplate = (formType: string) => {
    // Return the actual HSH form content based on form type
    switch (formType) {
      case 'architect_verification':
        return {
          title: 'Architect Engineer Design Verification Sheet',
          sections: [
            {
              id: 'project_info',
              title: 'Project Information',
              fields: [
                {
                  id: 'architect_engineer',
                  type: 'text',
                  label: 'Architect / Engineer',
                  required: true,
                  placeholder: 'Enter architect/engineer name'
                },
                {
                  id: 'date',
                  type: 'date',
                  label: 'Date',
                  required: true
                }
              ]
            },
            {
              id: 'foundation_structure',
              title: 'Foundation & Structure',
              fields: [
                {
                  id: 'foundation_type',
                  type: 'select',
                  label: 'Foundation Type',
                  required: true,
                  options: ['Full Basement', 'Crawl Space', 'Slab-on-Grade']
                },
                {
                  id: 'foundation_walls',
                  type: 'select',
                  label: 'Foundation Walls',
                  required: true,
                  options: ['Poured Concrete', 'Block', 'ICF']
                },
                {
                  id: 'basement_height',
                  type: 'number',
                  label: 'Basement Height (ft)',
                  required: false,
                  placeholder: 'Enter height in feet'
                },
                {
                  id: 'floor_system',
                  type: 'select',
                  label: 'Floor System',
                  required: true,
                  options: ['Engineered Joists', 'Dimensional Lumber', 'Concrete Slab']
                },
                {
                  id: 'framing_type',
                  type: 'select',
                  label: 'Framing Type',
                  required: true,
                  options: ['Wood', 'Metal Stud']
                },
                {
                  id: 'exterior_walls',
                  type: 'select',
                  label: 'Exterior Walls',
                  required: true,
                  options: ['2x4', '2x6']
                },
                {
                  id: 'sheathing',
                  type: 'select',
                  label: 'Sheathing',
                  required: true,
                  options: ['OSB', 'Plywood', 'Zip System']
                },
                {
                  id: 'roof_framing',
                  type: 'select',
                  label: 'Roof Framing',
                  required: true,
                  options: ['Trusses', 'Rafters']
                },
                {
                  id: 'roof_pitch',
                  type: 'text',
                  label: 'Roof Pitch',
                  required: false,
                  placeholder: 'e.g., 6/12'
                },
                {
                  id: 'attic_type',
                  type: 'select',
                  label: 'Attic Type',
                  required: true,
                  options: ['Vented', 'Conditioned']
                }
              ]
            },
            {
              id: 'exterior_design',
              title: 'Exterior Design',
              fields: [
                {
                  id: 'siding_type',
                  type: 'select',
                  label: 'Siding Type',
                  required: true,
                  options: ['Vinyl', 'Cement Board', 'Brick', 'Metal', 'Other']
                },
                {
                  id: 'siding_other',
                  type: 'text',
                  label: 'Other Siding Type',
                  required: false,
                  placeholder: 'Specify other siding type'
                },
                {
                  id: 'stone_masonry',
                  type: 'checkbox',
                  label: 'Stone or Masonry',
                  required: false
                },
                {
                  id: 'stone_location',
                  type: 'text',
                  label: 'Stone/Masonry Location(s)',
                  required: false,
                  placeholder: 'Enter locations'
                },
                {
                  id: 'roofing_material',
                  type: 'select',
                  label: 'Roofing Material',
                  required: true,
                  options: ['Asphalt', 'Metal', 'Tile', 'Other']
                },
                {
                  id: 'roofing_other',
                  type: 'text',
                  label: 'Other Roofing Material',
                  required: false,
                  placeholder: 'Specify other roofing material'
                },
                {
                  id: 'roof_color',
                  type: 'text',
                  label: 'Roof Color',
                  required: false,
                  placeholder: 'Enter roof color'
                },
                {
                  id: 'fascia_soffit',
                  type: 'select',
                  label: 'Fascia / Soffit',
                  required: true,
                  options: ['Aluminum', 'Vinyl', 'Wood']
                },
                {
                  id: 'gutter_downspouts',
                  type: 'checkbox',
                  label: 'Gutter / Downspouts',
                  required: false
                }
              ]
            },
            {
              id: 'building_layout_site',
              title: 'Building Layout & Site',
              fields: [
                {
                  id: 'lot_layout_attached',
                  type: 'checkbox',
                  label: 'Lot Layout Attached',
                  required: false
                },
                {
                  id: 'zoning_requirements_reviewed',
                  type: 'checkbox',
                  label: 'Zoning Requirements Reviewed and Verified (Setbacks, Use, Height, Lot Coverage)',
                  required: true
                },
                {
                  id: 'front_porch',
                  type: 'checkbox',
                  label: 'Front Porch',
                  required: false
                },
                {
                  id: 'front_porch_dimensions',
                  type: 'text',
                  label: 'Front Porch Dimensions',
                  required: false,
                  placeholder: 'Enter dimensions'
                },
                {
                  id: 'rear_porch_deck',
                  type: 'checkbox',
                  label: 'Rear Porch / Deck',
                  required: false
                },
                {
                  id: 'rear_porch_dimensions',
                  type: 'text',
                  label: 'Rear Porch / Deck Dimensions',
                  required: false,
                  placeholder: 'Enter dimensions'
                },
                {
                  id: 'walkout_basement',
                  type: 'checkbox',
                  label: 'Walkout Basement',
                  required: false
                },
                {
                  id: 'retaining_walls_required',
                  type: 'checkbox',
                  label: 'Retaining Walls Required',
                  required: false
                },
                {
                  id: 'driveway_type',
                  type: 'select',
                  label: 'Driveway Type',
                  required: true,
                  options: ['Concrete', 'Asphalt', 'Gravel']
                },
                {
                  id: 'sidewalks',
                  type: 'checkbox',
                  label: 'Sidewalks',
                  required: false
                },
                {
                  id: 'garage',
                  type: 'select',
                  label: 'Garage',
                  required: true,
                  options: ['Attached', 'Detached', 'None']
                },
                {
                  id: 'garage_bays',
                  type: 'select',
                  label: 'Garage Bays',
                  required: true,
                  options: ['1', '2', '3', 'Other']
                },
                {
                  id: 'garage_bays_other',
                  type: 'text',
                  label: 'Other Garage Bays',
                  required: false,
                  placeholder: 'Specify number'
                },
                {
                  id: 'garage_door_height',
                  type: 'number',
                  label: 'Garage Door Height (ft)',
                  required: false,
                  placeholder: 'Enter height in feet'
                },
                {
                  id: 'grade_elevation_drainage_verified',
                  type: 'checkbox',
                  label: 'Grade Elevation and Drainage Plan Verified',
                  required: true
                }
              ]
            },
            {
              id: 'interior_layout_details',
              title: 'Interior Layout & Details',
              fields: [
                {
                  id: 'ceiling_height_main',
                  type: 'number',
                  label: 'Ceiling Height (Main Floor) (ft)',
                  required: false,
                  placeholder: 'Enter height in feet'
                },
                {
                  id: 'ceiling_height_second',
                  type: 'number',
                  label: 'Ceiling Height (Second Floor) (ft)',
                  required: false,
                  placeholder: 'Enter height in feet'
                },
                {
                  id: 'ceiling_height_basement',
                  type: 'number',
                  label: 'Ceiling Height (Basement) (ft)',
                  required: false,
                  placeholder: 'Enter height in feet'
                },
                {
                  id: 'ceiling_type',
                  type: 'select',
                  label: 'Ceiling Type',
                  required: true,
                  options: ['Flat', 'Vaulted', 'Tray']
                },
                {
                  id: 'interior_wall_height_variations',
                  type: 'checkbox',
                  label: 'Interior Wall Height Variations',
                  required: false
                },
                {
                  id: 'stair_location_verified',
                  type: 'checkbox',
                  label: 'Stair Location Verified',
                  required: true
                },
                {
                  id: 'fireplace',
                  type: 'checkbox',
                  label: 'Fireplace',
                  required: false
                },
                {
                  id: 'fireplace_type',
                  type: 'select',
                  label: 'Fireplace Type',
                  required: false,
                  options: ['Gas', 'Electric', 'Wood']
                },
                {
                  id: 'kitchen_layout_confirmed',
                  type: 'checkbox',
                  label: 'Kitchen Layout Confirmed',
                  required: true
                },
                {
                  id: 'bath_layout_confirmed',
                  type: 'checkbox',
                  label: 'Bath Layout Confirmed',
                  required: true
                },
                {
                  id: 'window_schedule_reviewed',
                  type: 'checkbox',
                  label: 'Window Schedule Reviewed',
                  required: true
                },
                {
                  id: 'door_schedule_reviewed',
                  type: 'checkbox',
                  label: 'Door Schedule Reviewed',
                  required: true
                }
              ]
            },
            {
              id: 'utilities_mechanical',
              title: 'Utilities & Mechanical',
              fields: [
                {
                  id: 'hvac_type',
                  type: 'select',
                  label: 'HVAC Type',
                  required: true,
                  options: ['Forced Air', 'Heat Pump', 'Radiant', 'Other']
                },
                {
                  id: 'hvac_other',
                  type: 'text',
                  label: 'Other HVAC Type',
                  required: false,
                  placeholder: 'Specify other HVAC type'
                },
                {
                  id: 'water_heater',
                  type: 'select',
                  label: 'Water Heater',
                  required: true,
                  options: ['Gas', 'Electric', 'Tankless']
                },
                {
                  id: 'electrical_service',
                  type: 'select',
                  label: 'Electrical Service',
                  required: true,
                  options: ['100 Amp', '200 Amp', 'Other']
                },
                {
                  id: 'electrical_other',
                  type: 'text',
                  label: 'Other Electrical Service',
                  required: false,
                  placeholder: 'Specify other electrical service'
                },
                {
                  id: 'plumbing_type',
                  type: 'select',
                  label: 'Plumbing Type',
                  required: true,
                  options: ['PEX', 'Copper', 'CPVC']
                },
                {
                  id: 'energy_requirements_verified',
                  type: 'checkbox',
                  label: 'Energy Requirements Verified',
                  required: true
                },
                {
                  id: 'ventilation_exhaust_systems_reviewed',
                  type: 'checkbox',
                  label: 'Ventilation and Exhaust Systems Reviewed',
                  required: true
                }
              ]
            },
            {
              id: 'optional_features',
              title: 'Optional Features',
              fields: [
                {
                  id: 'dormers',
                  type: 'checkbox',
                  label: 'Dormers',
                  required: false
                },
                {
                  id: 'dormers_quantity_style',
                  type: 'text',
                  label: 'Dormers Quantity/Style',
                  required: false,
                  placeholder: 'Enter quantity and style'
                },
                {
                  id: 'bay_bow_windows',
                  type: 'checkbox',
                  label: 'Bay or Bow Windows',
                  required: false
                },
                {
                  id: 'covered_patio_outdoor_living',
                  type: 'checkbox',
                  label: 'Covered Patio / Outdoor Living Area',
                  required: false
                },
                {
                  id: 'stone_columns_wainscot',
                  type: 'checkbox',
                  label: 'Stone Columns / Wainscot',
                  required: false
                },
                {
                  id: 'decorative_shutters',
                  type: 'checkbox',
                  label: 'Decorative Shutters',
                  required: false
                },
                {
                  id: 'skylights',
                  type: 'checkbox',
                  label: 'Skylights',
                  required: false
                },
                {
                  id: 'specialty_roofing',
                  type: 'checkbox',
                  label: 'Specialty Roofing (Metal Accent, Standing Seam, etc.)',
                  required: false
                },
                {
                  id: 'rear_deck_extension_patio_slab',
                  type: 'checkbox',
                  label: 'Rear Deck Extension or Patio Slab',
                  required: false
                },
                {
                  id: 'additional_notes_requests',
                  type: 'textarea',
                  label: 'Additional Notes / Requests',
                  required: false,
                  placeholder: 'Enter any additional notes or requests'
                }
              ]
            },
            {
              id: 'final_review_sign_off',
              title: 'Final Review & Sign-Off',
              fields: [
                {
                  id: 'project_manager_verification_name',
                  type: 'text',
                  label: 'Project Manager Verification - Name',
                  required: true,
                  placeholder: 'Enter project manager name'
                },
                {
                  id: 'project_manager_verification_signature',
                  type: 'text',
                  label: 'Project Manager Verification - Signature',
                  required: true,
                  placeholder: 'Enter signature'
                },
                {
                  id: 'project_manager_verification_date',
                  type: 'date',
                  label: 'Project Manager Verification - Date',
                  required: true
                },
                {
                  id: 'architect_engineer_verification_name',
                  type: 'text',
                  label: 'Architect / Engineer Verification - Name',
                  required: true,
                  placeholder: 'Enter architect/engineer name'
                },
                {
                  id: 'architect_engineer_verification_signature',
                  type: 'text',
                  label: 'Architect / Engineer Verification - Signature',
                  required: true,
                  placeholder: 'Enter signature'
                },
                {
                  id: 'architect_engineer_verification_date',
                  type: 'date',
                  label: 'Architect / Engineer Verification - Date',
                  required: true
                },
                {
                  id: 'owner_executive_approval_name',
                  type: 'text',
                  label: 'Owner / Executive Approval - Name',
                  required: true,
                  placeholder: 'Enter owner/executive name'
                },
                {
                  id: 'owner_executive_approval_signature',
                  type: 'text',
                  label: 'Owner / Executive Approval - Signature',
                  required: true,
                  placeholder: 'Enter signature'
                },
                {
                  id: 'owner_executive_approval_date',
                  type: 'date',
                  label: 'Owner / Executive Approval - Date',
                  required: true
                }
              ]
            }
          ]
        };

      case 'closing_checklist':
        return {
          title: 'Closing / Site Start Checklist',
          sections: [
            {
              id: 'project_info',
              title: 'Project Information',
              fields: [
                {
                  id: 'date',
                  type: 'date',
                  label: 'Date',
                  required: true
                },
                {
                  id: 'prepared_by',
                  type: 'text',
                  label: 'Prepared By',
                  required: true,
                  placeholder: 'Enter preparer name'
                }
              ]
            },
            {
              id: 'utility_setup',
              title: 'Utility Setup',
              fields: [
                {
                  id: 'request_electric_service',
                  type: 'checkbox',
                  label: 'Request electric service activation',
                  required: true
                },
                {
                  id: 'request_gas_service',
                  type: 'checkbox',
                  label: 'Request gas service activation',
                  required: true
                },
                {
                  id: 'request_water_service',
                  type: 'checkbox',
                  label: 'Request water service activation',
                  required: true
                },
                {
                  id: 'verify_sewer_connection',
                  type: 'checkbox',
                  label: 'Verify sewer connection or septic setup',
                  required: true
                },
                {
                  id: 'confirm_utility_account_numbers',
                  type: 'checkbox',
                  label: 'Confirm utility account numbers recorded',
                  required: true
                }
              ]
            },
            {
              id: 'site_readiness',
              title: 'Site Readiness',
              fields: [
                {
                  id: 'portable_restroom_delivered',
                  type: 'checkbox',
                  label: 'Portable restroom delivered and placed properly',
                  required: true
                },
                {
                  id: 'dumpster_delivered',
                  type: 'checkbox',
                  label: 'Dumpster delivered and set on driveway or gravel area',
                  required: true
                },
                {
                  id: 'verify_erosion_control',
                  type: 'checkbox',
                  label: 'Verify erosion control (silt fence, inlet protection, etc.) in place',
                  required: true
                },
                {
                  id: 'check_clear_site_access',
                  type: 'checkbox',
                  label: 'Check for clear site access for equipment and deliveries',
                  required: true
                },
                {
                  id: 'confirm_address_signage',
                  type: 'checkbox',
                  label: 'Confirm address signage visible from road',
                  required: true
                }
              ]
            },
            {
              id: 'documentation_files',
              title: 'Documentation & Files',
              fields: [
                {
                  id: 'organize_property_file',
                  type: 'checkbox',
                  label: 'Organize property file and digital folder for new job',
                  required: true
                },
                {
                  id: 'include_survey_purchase_documents',
                  type: 'checkbox',
                  label: 'Include survey, purchase documents, permits, and plans',
                  required: true
                },
                {
                  id: 'add_selections_design_guide',
                  type: 'checkbox',
                  label: 'Add selections and design guide binder (if applicable)',
                  required: false
                },
                {
                  id: 'label_binder',
                  type: 'checkbox',
                  label: 'Label binder: \'Design & Selection Guide – [Property Address]\'',
                  required: false
                },
                {
                  id: 'file_construction_contract',
                  type: 'checkbox',
                  label: 'File copy of executed construction contract',
                  required: true
                }
              ]
            },
            {
              id: 'on_site_materials',
              title: 'On-Site Materials',
              fields: [
                {
                  id: 'print_construction_drawings',
                  type: 'checkbox',
                  label: 'Print full-size construction drawings for job site',
                  required: true
                },
                {
                  id: 'place_drawings_waterproof_tube',
                  type: 'checkbox',
                  label: 'Place drawings in waterproof tube and secure inside unit or job box',
                  required: true
                },
                {
                  id: 'keep_backup_digital_set',
                  type: 'checkbox',
                  label: 'Keep backup digital set on company drive',
                  required: true
                },
                {
                  id: 'verify_site_plan_elevation_pages',
                  type: 'checkbox',
                  label: 'Verify site plan and elevation pages included',
                  required: true
                }
              ]
            },
            {
              id: 'notifications_communication',
              title: 'Notifications & Communication',
              fields: [
                {
                  id: 'notify_project_manager',
                  type: 'checkbox',
                  label: 'Notify project manager site is ready',
                  required: true
                },
                {
                  id: 'notify_superintendent',
                  type: 'checkbox',
                  label: 'Notify superintendent start date is confirmed',
                  required: true
                },
                {
                  id: 'confirm_vendors_updated',
                  type: 'checkbox',
                  label: 'Confirm all vendors have updated address and directions',
                  required: true
                },
                {
                  id: 'add_site_weekly_schedule',
                  type: 'checkbox',
                  label: 'Add site to weekly schedule board',
                  required: true
                }
              ]
            },
            {
              id: 'final_verification',
              title: 'Final Verification',
              fields: [
                {
                  id: 'utilities_active_working',
                  type: 'checkbox',
                  label: 'Utilities active and working',
                  required: true
                },
                {
                  id: 'portable_restroom_dumpster_place',
                  type: 'checkbox',
                  label: 'Portable restroom and dumpster in place',
                  required: true
                },
                {
                  id: 'prints_delivered_tube_labeled',
                  type: 'checkbox',
                  label: 'Prints delivered and tube labeled',
                  required: true
                },
                {
                  id: 'files_binder_organized',
                  type: 'checkbox',
                  label: 'Files and binder organized',
                  required: true
                }
              ]
            },
            {
              id: 'completion_sign_off',
              title: 'Completion Sign-Off',
              fields: [
                {
                  id: 'completed_by',
                  type: 'text',
                  label: 'Completed By',
                  required: true,
                  placeholder: 'Enter name'
                },
                {
                  id: 'completion_date',
                  type: 'date',
                  label: 'Completion Date',
                  required: true
                },
                {
                  id: 'reviewed_by_pm',
                  type: 'text',
                  label: 'Reviewed By (PM)',
                  required: true,
                  placeholder: 'Enter project manager name'
                }
              ]
            }
          ]
        };

      case 'due_diligence':
        return {
          title: 'Due Diligence Checklist',
          sections: [
            {
              id: 'project_info',
              title: 'Project Information',
              fields: [
                {
                  id: 'acquisition_type',
                  type: 'select',
                  label: 'Acquisition Type',
                  required: true,
                  options: ['Purchase', 'Lease', 'Development']
                },
                {
                  id: 'prepared_by',
                  type: 'text',
                  label: 'Prepared By',
                  required: true,
                  placeholder: 'Enter preparer name'
                },
                {
                  id: 'date',
                  type: 'date',
                  label: 'Date',
                  required: true
                }
              ]
            },
            {
              id: 'property_verification',
              title: 'Property Verification',
              fields: [
                {
                  id: 'obtain_parcel_numbers',
                  type: 'checkbox',
                  label: 'Obtain parcel number(s) and legal description',
                  required: true
                },
                {
                  id: 'verify_current_ownership',
                  type: 'checkbox',
                  label: 'Verify current ownership and obtain title report',
                  required: true
                },
                {
                  id: 'review_deed_restrictions',
                  type: 'checkbox',
                  label: 'Review deed restrictions, easements, and encroachments',
                  required: true
                },
                {
                  id: 'confirm_property_boundaries',
                  type: 'checkbox',
                  label: 'Confirm property boundaries and access rights',
                  required: true
                },
                {
                  id: 'verify_zoning_designation',
                  type: 'checkbox',
                  label: 'Verify zoning designation and allowable uses',
                  required: true
                },
                {
                  id: 'confirm_flood_zone_status',
                  type: 'checkbox',
                  label: 'Confirm flood zone status and obtain FEMA map',
                  required: true
                },
                {
                  id: 'verify_soil_type',
                  type: 'checkbox',
                  label: 'Verify soil type and topographic conditions',
                  required: true
                },
                {
                  id: 'confirm_utility_availability',
                  type: 'checkbox',
                  label: 'Confirm utility availability (water, sewer, gas, electric, communications)',
                  required: true
                },
                {
                  id: 'photograph_site_conditions',
                  type: 'checkbox',
                  label: 'Photograph existing site conditions and neighboring uses',
                  required: true
                }
              ]
            },
            {
              id: 'financial_transaction_review',
              title: 'Financial & Transaction Review',
              fields: [
                {
                  id: 'confirm_purchase_price',
                  type: 'checkbox',
                  label: 'Confirm purchase price, option terms, or lease rate',
                  required: true
                },
                {
                  id: 'verify_earnest_money',
                  type: 'checkbox',
                  label: 'Verify earnest money, deposit schedule, and closing timeline',
                  required: true
                },
                {
                  id: 'identify_closing_costs',
                  type: 'checkbox',
                  label: 'Identify all closing costs, fees, and professional expenses',
                  required: true
                },
                {
                  id: 'obtain_appraisal',
                  type: 'checkbox',
                  label: 'Obtain appraisal or broker opinion of value',
                  required: true
                },
                {
                  id: 'review_property_taxes',
                  type: 'checkbox',
                  label: 'Review current and projected property taxes or assessments',
                  required: true
                },
                {
                  id: 'evaluate_tif_eligibility',
                  type: 'checkbox',
                  label: 'Evaluate TIF (Tax Increment Financing) eligibility and local programs',
                  required: true
                },
                {
                  id: 'assess_bond_financing',
                  type: 'checkbox',
                  label: 'Assess potential bond financing (revenue, industrial, or municipal)',
                  required: true
                },
                {
                  id: 'assemble_capital_stack',
                  type: 'checkbox',
                  label: 'Assemble preliminary capital stack (public, private, bank, and grant sources)',
                  required: true
                },
                {
                  id: 'verify_lender_requirements',
                  type: 'checkbox',
                  label: 'Verify lender and investor requirements (collateral, guarantees, reporting)',
                  required: true
                },
                {
                  id: 'develop_financial_model',
                  type: 'checkbox',
                  label: 'Develop preliminary financial model (costs, returns, sources/uses summary)',
                  required: true
                },
                {
                  id: 'confirm_insurance_requirements',
                  type: 'checkbox',
                  label: 'Confirm insurance requirements and obtain preliminary quotes',
                  required: true
                }
              ]
            },
            {
              id: 'environmental_site_conditions',
              title: 'Environmental & Site Conditions',
              fields: [
                {
                  id: 'conduct_wetlands_review',
                  type: 'checkbox',
                  label: 'Conduct wetlands review and flag protected areas',
                  required: true
                },
                {
                  id: 'order_environmental_study',
                  type: 'checkbox',
                  label: 'Order environmental study (Phase I ESA minimum)',
                  required: true
                },
                {
                  id: 'conduct_phase_ii_testing',
                  type: 'checkbox',
                  label: 'Conduct Phase II testing (if required)',
                  required: false
                },
                {
                  id: 'perform_soil_borings',
                  type: 'checkbox',
                  label: 'Perform soil borings and full geotechnical test report',
                  required: true
                },
                {
                  id: 'identify_hazardous_materials',
                  type: 'checkbox',
                  label: 'Identify hazardous materials or underground tanks',
                  required: true
                },
                {
                  id: 'review_stormwater_management',
                  type: 'checkbox',
                  label: 'Review stormwater management and runoff control requirements',
                  required: true
                }
              ]
            },
            {
              id: 'planning_regulatory_compliance',
              title: 'Planning & Regulatory Compliance',
              fields: [
                {
                  id: 'verify_zoning_use_compliance',
                  type: 'checkbox',
                  label: 'Verify zoning and use compliance',
                  required: true
                },
                {
                  id: 'review_development_codes',
                  type: 'checkbox',
                  label: 'Review local development codes and setbacks',
                  required: true
                },
                {
                  id: 'confirm_parking_landscaping',
                  type: 'checkbox',
                  label: 'Confirm parking, landscaping, and lighting requirements',
                  required: true
                },
                {
                  id: 'review_design_review_requirements',
                  type: 'checkbox',
                  label: 'Review design review or architectural board requirements',
                  required: true
                },
                {
                  id: 'schedule_pre_application_meeting',
                  type: 'checkbox',
                  label: 'Schedule pre-application or concept meeting with city officials',
                  required: true
                },
                {
                  id: 'identify_required_permits',
                  type: 'checkbox',
                  label: 'Identify required permits and approval timelines',
                  required: true
                }
              ]
            },
            {
              id: 'final_review_sign_off',
              title: 'Final Review & Sign-Off',
              fields: [
                {
                  id: 'due_diligence_conducted_by_name',
                  type: 'text',
                  label: 'Due Diligence Conducted By (Project Manager) - Name',
                  required: true,
                  placeholder: 'Enter project manager name'
                },
                {
                  id: 'due_diligence_conducted_by_signature',
                  type: 'text',
                  label: 'Due Diligence Conducted By (Project Manager) - Signature',
                  required: true,
                  placeholder: 'Enter signature'
                },
                {
                  id: 'due_diligence_conducted_by_date',
                  type: 'date',
                  label: 'Due Diligence Conducted By (Project Manager) - Date',
                  required: true
                },
                {
                  id: 'owner_executive_approval_name',
                  type: 'text',
                  label: 'Owner / Executive Approval - Name',
                  required: true,
                  placeholder: 'Enter owner/executive name'
                },
                {
                  id: 'owner_executive_approval_signature',
                  type: 'text',
                  label: 'Owner / Executive Approval - Signature',
                  required: true,
                  placeholder: 'Enter signature'
                },
                {
                  id: 'owner_executive_approval_date',
                  type: 'date',
                  label: 'Owner / Executive Approval - Date',
                  required: true
                }
              ]
            }
          ]
        };

      case 'selections':
        return {
          title: 'Selection Sheet & Checklist',
          sections: [
            {
              id: 'project_info',
              title: 'Project Information',
              fields: [
                {
                  id: 'owner_buyer',
                  type: 'text',
                  label: 'Owner / Buyer',
                  required: true,
                  placeholder: 'Enter owner/buyer name'
                },
                {
                  id: 'date',
                  type: 'date',
                  label: 'Date',
                  required: true
                },
                {
                  id: 'prepared_by',
                  type: 'text',
                  label: 'Prepared By (PM/Designer)',
                  required: true,
                  placeholder: 'Enter preparer name'
                }
              ]
            },
            {
              id: 'exterior_selections',
              title: 'Exterior Selections',
              fields: [
                {
                  id: 'siding_type_color',
                  type: 'text',
                  label: 'Siding Type & Color (ProVia)',
                  required: false,
                  placeholder: 'Enter siding type and color'
                },
                {
                  id: 'accent_siding',
                  type: 'text',
                  label: 'Accent Siding (Board & Batten / Shake, ProVia)',
                  required: false,
                  placeholder: 'Enter accent siding details'
                },
                {
                  id: 'stone_masonry_type_location',
                  type: 'text',
                  label: 'Stone / Masonry (Type & Location)',
                  required: false,
                  placeholder: 'Enter stone/masonry details'
                },
                {
                  id: 'soffit_fascia_material_color',
                  type: 'text',
                  label: 'Soffit & Fascia (Material & Color)',
                  required: false,
                  placeholder: 'Enter soffit and fascia details'
                },
                {
                  id: 'roofing_owens_corning_series_color',
                  type: 'text',
                  label: 'Roofing (Owens Corning – Series/Color)',
                  required: false,
                  placeholder: 'Enter roofing details'
                },
                {
                  id: 'front_door_provia_style_color',
                  type: 'text',
                  label: 'Front Door (ProVia – Style/Color)',
                  required: false,
                  placeholder: 'Enter front door details'
                },
                {
                  id: 'windows_provia_series_color',
                  type: 'text',
                  label: 'Windows (ProVia – Series/Color)',
                  required: false,
                  placeholder: 'Enter window details'
                },
                {
                  id: 'garage_doors_style_color',
                  type: 'text',
                  label: 'Garage Doors (Style/Color)',
                  required: false,
                  placeholder: 'Enter garage door details'
                },
                {
                  id: 'railings_deck_systems_shapes_unlimited_finish',
                  type: 'text',
                  label: 'Railings / Deck Systems (Shapes Unlimited – Finish)',
                  required: false,
                  placeholder: 'Enter railing/deck details'
                },
                {
                  id: 'exterior_lighting_fixture_finish',
                  type: 'text',
                  label: 'Exterior Lighting (Fixture/Finish)',
                  required: false,
                  placeholder: 'Enter exterior lighting details'
                }
              ]
            },
            {
              id: 'interior_paint_selections',
              title: 'Interior Paint Selections (Room-by-Room)',
              fields: [
                {
                  id: 'standard_finish',
                  type: 'text',
                  label: 'Standard Finish: Walls – Eggshell | Ceilings – Flat | Trim/Doors – Satin',
                  required: false,
                  placeholder: 'Enter standard finish details'
                },
                {
                  id: 'living_room_wall_color',
                  type: 'text',
                  label: 'Living Room – Wall Color (Eggshell)',
                  required: false,
                  placeholder: 'Enter living room wall color'
                },
                {
                  id: 'living_room_ceiling_color',
                  type: 'text',
                  label: 'Living Room – Ceiling Color (Flat)',
                  required: false,
                  placeholder: 'Enter living room ceiling color'
                },
                {
                  id: 'kitchen_wall_color',
                  type: 'text',
                  label: 'Kitchen – Wall Color (Eggshell)',
                  required: false,
                  placeholder: 'Enter kitchen wall color'
                },
                {
                  id: 'kitchen_ceiling_color',
                  type: 'text',
                  label: 'Kitchen – Ceiling Color (Flat)',
                  required: false,
                  placeholder: 'Enter kitchen ceiling color'
                },
                {
                  id: 'dining_room_wall_ceiling',
                  type: 'text',
                  label: 'Dining Room – Wall (Eggshell) / Ceiling (Flat)',
                  required: false,
                  placeholder: 'Enter dining room colors'
                },
                {
                  id: 'master_bedroom_wall_ceiling',
                  type: 'text',
                  label: 'Master Bedroom – Wall (Eggshell) / Ceiling (Flat)',
                  required: false,
                  placeholder: 'Enter master bedroom colors'
                },
                {
                  id: 'bedroom_2_wall_ceiling',
                  type: 'text',
                  label: 'Bedroom 2 – Wall (Eggshell) / Ceiling (Flat)',
                  required: false,
                  placeholder: 'Enter bedroom 2 colors'
                },
                {
                  id: 'bedroom_3_wall_ceiling',
                  type: 'text',
                  label: 'Bedroom 3 – Wall (Eggshell) / Ceiling (Flat)',
                  required: false,
                  placeholder: 'Enter bedroom 3 colors'
                },
                {
                  id: 'hallways_wall_ceiling',
                  type: 'text',
                  label: 'Hallways – Wall (Eggshell) / Ceiling (Flat)',
                  required: false,
                  placeholder: 'Enter hallway colors'
                },
                {
                  id: 'bathrooms_wall_ceiling',
                  type: 'text',
                  label: 'Bathrooms – Wall (Eggshell) / Ceiling (Flat)',
                  required: false,
                  placeholder: 'Enter bathroom colors'
                },
                {
                  id: 'basement_rec_area_wall_ceiling',
                  type: 'text',
                  label: 'Basement / Rec Area – Wall (Eggshell) / Ceiling (Flat)',
                  required: false,
                  placeholder: 'Enter basement/rec area colors'
                },
                {
                  id: 'accent_walls_specialty_finishes',
                  type: 'text',
                  label: 'Accent Walls / Specialty Finishes (Describe Location & Color)',
                  required: false,
                  placeholder: 'Enter accent wall details'
                }
              ]
            },
            {
              id: 'flooring_selections',
              title: 'Flooring Selections (Room-by-Room)',
              fields: [
                {
                  id: 'entry_flooring',
                  type: 'text',
                  label: 'Entry',
                  required: false,
                  placeholder: 'Enter entry flooring'
                },
                {
                  id: 'kitchen_flooring',
                  type: 'text',
                  label: 'Kitchen',
                  required: false,
                  placeholder: 'Enter kitchen flooring'
                },
                {
                  id: 'dining_room_flooring',
                  type: 'text',
                  label: 'Dining Room',
                  required: false,
                  placeholder: 'Enter dining room flooring'
                },
                {
                  id: 'living_room_flooring',
                  type: 'text',
                  label: 'Living Room',
                  required: false,
                  placeholder: 'Enter living room flooring'
                },
                {
                  id: 'hallways_flooring',
                  type: 'text',
                  label: 'Hallways',
                  required: false,
                  placeholder: 'Enter hallway flooring'
                },
                {
                  id: 'master_bedroom_flooring',
                  type: 'text',
                  label: 'Master Bedroom',
                  required: false,
                  placeholder: 'Enter master bedroom flooring'
                },
                {
                  id: 'bedroom_2_flooring',
                  type: 'text',
                  label: 'Bedroom 2',
                  required: false,
                  placeholder: 'Enter bedroom 2 flooring'
                },
                {
                  id: 'bedroom_3_flooring',
                  type: 'text',
                  label: 'Bedroom 3',
                  required: false,
                  placeholder: 'Enter bedroom 3 flooring'
                },
                {
                  id: 'bathrooms_flooring',
                  type: 'text',
                  label: 'Bathrooms',
                  required: false,
                  placeholder: 'Enter bathroom flooring'
                },
                {
                  id: 'laundry_mudroom_flooring',
                  type: 'text',
                  label: 'Laundry / Mudroom',
                  required: false,
                  placeholder: 'Enter laundry/mudroom flooring'
                },
                {
                  id: 'basement_rec_areas_flooring',
                  type: 'text',
                  label: 'Basement / Rec Areas',
                  required: false,
                  placeholder: 'Enter basement/rec area flooring'
                }
              ]
            },
            {
              id: 'cabinetry_countertops',
              title: 'Cabinetry & Countertops (Room-by-Room)',
              fields: [
                {
                  id: 'kitchen_cabinets_sam_mueller_style_color',
                  type: 'text',
                  label: 'Kitchen Cabinets (Sam Mueller – Style/Color)',
                  required: false,
                  placeholder: 'Enter kitchen cabinet details'
                },
                {
                  id: 'kitchen_countertops_material_color',
                  type: 'text',
                  label: 'Kitchen Countertops (Material/Color)',
                  required: false,
                  placeholder: 'Enter kitchen countertop details'
                },
                {
                  id: 'laundry_mudroom_cabinets_sam_mueller_color',
                  type: 'text',
                  label: 'Laundry / Mudroom Cabinets (Sam Mueller – Color)',
                  required: false,
                  placeholder: 'Enter laundry/mudroom cabinet details'
                },
                {
                  id: 'master_bath_vanity_sam_mueller_color_top',
                  type: 'text',
                  label: 'Master Bath Vanity (Sam Mueller – Color/Top)',
                  required: false,
                  placeholder: 'Enter master bath vanity details'
                },
                {
                  id: 'main_bath_vanity_sam_mueller_color_top',
                  type: 'text',
                  label: 'Main Bath Vanity (Sam Mueller – Color/Top)',
                  required: false,
                  placeholder: 'Enter main bath vanity details'
                },
                {
                  id: 'powder_bath_vanity_sam_mueller_color_top',
                  type: 'text',
                  label: 'Powder Bath Vanity (Sam Mueller – Color/Top)',
                  required: false,
                  placeholder: 'Enter powder bath vanity details'
                },
                {
                  id: 'basement_bath_vanity_sam_mueller_color_top',
                  type: 'text',
                  label: 'Basement Bath Vanity (Sam Mueller – Color/Top)',
                  required: false,
                  placeholder: 'Enter basement bath vanity details'
                },
                {
                  id: 'hardware_pulls_knobs_finish',
                  type: 'text',
                  label: 'Hardware (Pulls/Knobs – Finish)',
                  required: false,
                  placeholder: 'Enter hardware details'
                },
                {
                  id: 'backsplash_material_pattern',
                  type: 'text',
                  label: 'Backsplash (Material / Pattern)',
                  required: false,
                  placeholder: 'Enter backsplash details'
                }
              ]
            },
            {
              id: 'master_bathroom_selections',
              title: 'Master Bathroom Selections',
              fields: [
                {
                  id: 'master_vanity_sam_mueller_size_color_top',
                  type: 'text',
                  label: 'Vanity (Sam Mueller – Size/Color/Top)',
                  required: false,
                  placeholder: 'Enter master vanity details'
                },
                {
                  id: 'master_mirror_size_style',
                  type: 'text',
                  label: 'Mirror (Size/Style)',
                  required: false,
                  placeholder: 'Enter master mirror details'
                },
                {
                  id: 'master_faucet_sam_mueller_model_finish',
                  type: 'text',
                  label: 'Faucet (Sam Mueller – Model/Finish)',
                  required: false,
                  placeholder: 'Enter master faucet details'
                },
                {
                  id: 'master_tub_shower_sam_mueller_panels_tile_fixtures',
                  type: 'text',
                  label: 'Tub/Shower (Sam Mueller – Panels/Tile/Fixtures)',
                  required: false,
                  placeholder: 'Enter master tub/shower details'
                },
                {
                  id: 'master_toilet_brand_color',
                  type: 'text',
                  label: 'Toilet (Brand/Color)',
                  required: false,
                  placeholder: 'Enter master toilet details'
                },
                {
                  id: 'master_hardware_towel_bars_hooks_tp_holder',
                  type: 'text',
                  label: 'Hardware (Towel Bars / Hooks / TP Holder)',
                  required: false,
                  placeholder: 'Enter master hardware details'
                }
              ]
            },
            {
              id: 'main_bathroom_selections',
              title: 'Main Bathroom Selections',
              fields: [
                {
                  id: 'main_vanity_sam_mueller_size_color_top',
                  type: 'text',
                  label: 'Vanity (Sam Mueller – Size/Color/Top)',
                  required: false,
                  placeholder: 'Enter main vanity details'
                },
                {
                  id: 'main_mirror_size_style',
                  type: 'text',
                  label: 'Mirror (Size/Style)',
                  required: false,
                  placeholder: 'Enter main mirror details'
                },
                {
                  id: 'main_faucet_sam_mueller_model_finish',
                  type: 'text',
                  label: 'Faucet (Sam Mueller – Model/Finish)',
                  required: false,
                  placeholder: 'Enter main faucet details'
                },
                {
                  id: 'main_tub_shower_sam_mueller_panels_tile_fixtures',
                  type: 'text',
                  label: 'Tub/Shower (Sam Mueller – Panels/Tile/Fixtures)',
                  required: false,
                  placeholder: 'Enter main tub/shower details'
                },
                {
                  id: 'main_toilet_brand_color',
                  type: 'text',
                  label: 'Toilet (Brand/Color)',
                  required: false,
                  placeholder: 'Enter main toilet details'
                },
                {
                  id: 'main_hardware_towel_bars_hooks_tp_holder',
                  type: 'text',
                  label: 'Hardware (Towel Bars / Hooks / TP Holder)',
                  required: false,
                  placeholder: 'Enter main hardware details'
                }
              ]
            },
            {
              id: 'powder_bathroom_selections',
              title: 'Powder Bathroom Selections',
              fields: [
                {
                  id: 'powder_vanity_sam_mueller_size_color_top',
                  type: 'text',
                  label: 'Vanity (Sam Mueller – Size/Color/Top)',
                  required: false,
                  placeholder: 'Enter powder vanity details'
                },
                {
                  id: 'powder_mirror_size_style',
                  type: 'text',
                  label: 'Mirror (Size/Style)',
                  required: false,
                  placeholder: 'Enter powder mirror details'
                },
                {
                  id: 'powder_faucet_sam_mueller_model_finish',
                  type: 'text',
                  label: 'Faucet (Sam Mueller – Model/Finish)',
                  required: false,
                  placeholder: 'Enter powder faucet details'
                },
                {
                  id: 'powder_tub_shower_sam_mueller_panels_tile_fixtures',
                  type: 'text',
                  label: 'Tub/Shower (Sam Mueller – Panels/Tile/Fixtures)',
                  required: false,
                  placeholder: 'Enter powder tub/shower details'
                },
                {
                  id: 'powder_toilet_brand_color',
                  type: 'text',
                  label: 'Toilet (Brand/Color)',
                  required: false,
                  placeholder: 'Enter powder toilet details'
                },
                {
                  id: 'powder_hardware_towel_bars_hooks_tp_holder',
                  type: 'text',
                  label: 'Hardware (Towel Bars / Hooks / TP Holder)',
                  required: false,
                  placeholder: 'Enter powder hardware details'
                }
              ]
            },
            {
              id: 'basement_bathroom_selections',
              title: 'Basement Bathroom Selections',
              fields: [
                {
                  id: 'basement_vanity_sam_mueller_size_color_top',
                  type: 'text',
                  label: 'Vanity (Sam Mueller – Size/Color/Top)',
                  required: false,
                  placeholder: 'Enter basement vanity details'
                },
                {
                  id: 'basement_mirror_size_style',
                  type: 'text',
                  label: 'Mirror (Size/Style)',
                  required: false,
                  placeholder: 'Enter basement mirror details'
                },
                {
                  id: 'basement_faucet_sam_mueller_model_finish',
                  type: 'text',
                  label: 'Faucet (Sam Mueller – Model/Finish)',
                  required: false,
                  placeholder: 'Enter basement faucet details'
                },
                {
                  id: 'basement_tub_shower_sam_mueller_panels_tile_fixtures',
                  type: 'text',
                  label: 'Tub/Shower (Sam Mueller – Panels/Tile/Fixtures)',
                  required: false,
                  placeholder: 'Enter basement tub/shower details'
                },
                {
                  id: 'basement_toilet_brand_color',
                  type: 'text',
                  label: 'Toilet (Brand/Color)',
                  required: false,
                  placeholder: 'Enter basement toilet details'
                },
                {
                  id: 'basement_hardware_towel_bars_hooks_tp_holder',
                  type: 'text',
                  label: 'Hardware (Towel Bars / Hooks / TP Holder)',
                  required: false,
                  placeholder: 'Enter basement hardware details'
                }
              ]
            },
            {
              id: 'final_review_sign_off',
              title: 'Final Review & Sign-Off',
              fields: [
                {
                  id: 'project_manager_verification_name',
                  type: 'text',
                  label: 'Project Manager Verification - Name',
                  required: true,
                  placeholder: 'Enter project manager name'
                },
                {
                  id: 'project_manager_verification_signature',
                  type: 'text',
                  label: 'Project Manager Verification - Signature',
                  required: true,
                  placeholder: 'Enter signature'
                },
                {
                  id: 'project_manager_verification_date',
                  type: 'date',
                  label: 'Project Manager Verification - Date',
                  required: true
                },
                {
                  id: 'designer_buyer_approval_name',
                  type: 'text',
                  label: 'Designer / Buyer Approval - Name',
                  required: true,
                  placeholder: 'Enter designer/buyer name'
                },
                {
                  id: 'designer_buyer_approval_signature',
                  type: 'text',
                  label: 'Designer / Buyer Approval - Signature',
                  required: true,
                  placeholder: 'Enter signature'
                },
                {
                  id: 'designer_buyer_approval_date',
                  type: 'date',
                  label: 'Designer / Buyer Approval - Date',
                  required: true
                }
              ]
            }
          ]
        };

      default:
        return {
          title: 'Basic Form',
          sections: [
            {
              id: 'basic_info',
              title: 'Basic Information',
              fields: [
                {
                  id: 'date',
                  type: 'date',
                  label: 'Date',
                  required: true
                },
                {
                  id: 'notes',
                  type: 'textarea',
                  label: 'Notes',
                  required: false,
                  placeholder: 'Additional notes...'
                }
              ]
            }
          ]
        };
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading forms...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center space-x-3 sm:space-x-4">
              {onBack && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBack}
                  className="mr-2 text-gray-600 hover:text-gray-900"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Back to Project</span>
                  <span className="sm:hidden">Back</span>
                </Button>
              )}
              <img src={hshLogo} alt="HSH Contractor" className="h-16 sm:h-20 lg:h-24 w-auto" />
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-1">
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">
                    {project?.name || 'Project Forms'}
                  </h1>
                  {project?.project_number && (
                    <span className="px-2 sm:px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 w-fit">
                      #{project.project_number}
                    </span>
                  )}
                  {project?.status && (
                    <span className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium w-fit ${
                      project.status === 'completed' ? 'bg-green-100 text-green-800' :
                      project.status === 'in-progress' ? 'bg-yellow-100 text-yellow-800' :
                      project.status === 'planning' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {project.status.replace('-', ' ').toUpperCase()}
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-gray-600">
                  Project Forms & Documentation
                </p>
              </div>
            </div>
            {/* Forms Statistics */}
            <div className="flex items-center space-x-6">
              <div className="text-center">
                <p className="text-xs sm:text-sm text-gray-500">Forms Created</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900">{forms.length}</p>
              </div>
              <div className="text-center">
                <p className="text-xs sm:text-sm text-gray-500">Completed</p>
                <p className="text-lg sm:text-2xl font-bold text-green-600">
                  {forms.filter(f => f.status === 'completed' || f.status === 'approved').length}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Create Forms Section */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New Form</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card 
              className="hover:shadow-lg transition-shadow cursor-pointer border-2 border-transparent hover:border-blue-200"
              onClick={() => createNewForm('architect_verification')}
            >
              <div className="w-full text-left p-4 sm:p-6">
                <div className="flex items-center mb-3">
                  <div className="bg-blue-100 rounded-lg p-2 sm:p-3 mr-3 sm:mr-4 flex-shrink-0">
                    <FileCheck className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Architect Verification</h3>
                    <p className="text-xs sm:text-sm text-gray-500">Design verification checklist</p>
                  </div>
                </div>
                <div className="flex items-center text-blue-600 text-xs sm:text-sm">
                  <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                  Create Form
                </div>
              </div>
            </Card>

            <Card 
              className="hover:shadow-lg transition-shadow cursor-pointer border-2 border-transparent hover:border-green-200"
              onClick={() => createNewForm('closing_checklist')}
            >
              <div className="w-full text-left p-4 sm:p-6">
                <div className="flex items-center mb-3">
                  <div className="bg-green-100 rounded-lg p-2 sm:p-3 mr-3 sm:mr-4 flex-shrink-0">
                    <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Site Start Checklist</h3>
                    <p className="text-xs sm:text-sm text-gray-500">Pre-construction setup</p>
                  </div>
                </div>
                <div className="flex items-center text-green-600 text-xs sm:text-sm">
                  <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                  Create Form
                </div>
              </div>
            </Card>

            <Card 
              className="hover:shadow-lg transition-shadow cursor-pointer border-2 border-transparent hover:border-orange-200"
              onClick={() => createNewForm('due_diligence')}
            >
              <div className="w-full text-left p-4 sm:p-6">
                <div className="flex items-center mb-3">
                  <div className="bg-orange-100 rounded-lg p-2 sm:p-3 mr-3 sm:mr-4 flex-shrink-0">
                    <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Due Diligence</h3>
                    <p className="text-xs sm:text-sm text-gray-500">Property analysis checklist</p>
                  </div>
                </div>
                <div className="flex items-center text-orange-600 text-xs sm:text-sm">
                  <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                  Create Form
                </div>
              </div>
            </Card>

            <Card 
              className="hover:shadow-lg transition-shadow cursor-pointer border-2 border-transparent hover:border-purple-200"
              onClick={() => createNewForm('selections')}
            >
              <div className="w-full text-left p-4 sm:p-6">
                <div className="flex items-center mb-3">
                  <div className="bg-purple-100 rounded-lg p-2 sm:p-3 mr-3 sm:mr-4 flex-shrink-0">
                    <Edit className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Selections Sheet</h3>
                    <p className="text-xs sm:text-sm text-gray-500">Material and finish selections</p>
                  </div>
                </div>
                <div className="flex items-center text-purple-600 text-xs sm:text-sm">
                  <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                  Create Form
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Existing Forms Section */}
        {forms.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Existing Forms</h2>
            <div className="grid gap-4">
              {forms.map((form) => (
                <Card key={form.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="bg-gray-100 rounded-lg p-3 mr-4">
                          <FileCheck className="w-6 h-6 text-gray-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{form.form_name}</h3>
                          <div className="flex items-center space-x-4 text-sm text-gray-500">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              form.status === 'completed' ? 'bg-green-100 text-green-800' :
                              form.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {form.status === 'completed' ? 'Completed' :
                               form.status === 'in_progress' ? 'In Progress' :
                               'Draft'}
                            </span>
                            <span>Updated {new Date(form.updated_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setSelectedForm(form)}
                        >
                          {form.status === 'draft' ? 'Continue' : 'View'}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => deleteForm(form.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {forms.length === 0 && (
          <Card className="text-center py-12">
            <CardContent>
              <FileCheck className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No forms created yet</h3>
              <p className="text-gray-500 mb-6">
                Create your first project form using one of the options above.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {selectedForm && (
        <DynamicForm 
          form={selectedForm}
          project={project}
          onClose={() => setSelectedForm(null)}
          onSave={(formData) => {
            // TODO: Implement save functionality
            console.log('Saving form data:', formData);
          }}
          onDelete={deleteForm}
        />
      )}
    </div>
  );
};

interface DynamicFormProps {
  form: ProjectForm;
  project?: any;
  onClose: () => void;
  onSave: (formData: Record<string, any>) => void;
  onDelete: (formId: string) => void;
}

const DynamicForm: React.FC<DynamicFormProps> = ({ form, project, onClose, onSave, onDelete }) => {
  const [formData, setFormData] = useState<Record<string, any>>(form.form_data);
  const [currentSection, setCurrentSection] = useState(0);

  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value
    }));
  };

  const handleSave = () => {
    onSave(formData);
  };

  const sections = form.form_schema.sections || [];
  const currentSectionData = sections[currentSection];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{form.form_name}</h2>
              <p className="text-sm text-gray-500">Section {currentSection + 1} of {sections.length}</p>
              {/* Project Information Header */}
              {project && (
                <div className="mt-3 p-3 bg-white rounded-lg border">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-700">Project:</span>
                      <span className="ml-2 text-gray-900">{project.name || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Address:</span>
                      <span className="ml-2 text-gray-900">
                        {typeof project.address === 'string' ? project.address : project.address?.street || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Plan:</span>
                      <span className="ml-2 text-gray-900">{project.plan?.name || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <Button variant="ghost" onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Close
            </Button>
          </div>
        </div>

        {/* Section Navigation */}
        {sections.length > 1 && (
          <div className="bg-white border-b border-gray-200 px-6 py-3">
            <div className="flex gap-2 overflow-x-auto">
              {sections.map((section, index) => (
                <Button
                  key={section.id}
                  variant={index === currentSection ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentSection(index)}
                  className="whitespace-nowrap"
                >
                  {section.title}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Form Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {currentSectionData && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{currentSectionData.title}</h3>
                <div className="grid gap-6">
                  {currentSectionData.fields.map((field) => (
                    <FormField
                      key={field.id}
                      field={field}
                      value={formData[field.id]}
                      onChange={(value) => handleFieldChange(field.id, value)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              {currentSection > 0 && (
                <Button 
                  variant="outline"
                  onClick={() => setCurrentSection(currentSection - 1)}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Previous
                </Button>
              )}
            </div>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => {
                  if (confirm('Are you sure you want to delete this form?')) {
                    onDelete(form.id);
                    onClose();
                  }
                }}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                Delete Form
              </Button>
              <Button variant="outline" onClick={handleSave}>
                Save Draft
              </Button>
              {currentSection < sections.length - 1 ? (
                <Button onClick={() => setCurrentSection(currentSection + 1)}>
                  Next
                  <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
                </Button>
              ) : (
                <Button onClick={handleSave} className="bg-green-600 hover:bg-green-700">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Complete Form
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface FormFieldProps {
  field: FormField;
  value: any;
  onChange: (value: any) => void;
}

const FormField: React.FC<FormFieldProps> = ({ field, value, onChange }) => {
  const renderField = () => {
    switch (field.type) {
      case 'text':
      case 'textarea':
        return (
          <Input
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
            className="w-full"
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            value={value || ''}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            placeholder={field.placeholder}
            required={field.required}
            className="w-full"
          />
        );

      case 'date':
        return (
          <Input
            type="date"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
            className="w-full"
          />
        );

      case 'select':
        return (
          <Select
            value={value || ''}
            onValueChange={onChange}
            required={field.required}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'checkbox':
        return (
          <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg border">
            <input
              type="checkbox"
              checked={value || false}
              onChange={(e) => onChange(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
            />
            <Label className="text-sm font-medium text-gray-700 cursor-pointer">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
          </div>
        );

      default:
        return (
          <Input
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
            className="w-full"
          />
        );
    }
  };

  return (
    <div className="space-y-2">
      {field.type !== 'checkbox' && (
        <Label className="text-sm font-medium text-gray-700">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </Label>
      )}
      {renderField()}
    </div>
  );
};
