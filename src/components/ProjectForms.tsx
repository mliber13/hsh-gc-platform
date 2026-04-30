import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { usePageTitle } from '@/contexts/PageTitleContext';
import { ArrowLeft, FileCheck, Plus, CheckCircle, Clock, Edit, X, Trash2, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { requireUserOrgId } from '../services/userService';
import { SignaturePad } from './ui/signature-pad';

interface FormField {
  id: string;
  type: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'textarea' | 'signature';
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
  usePageTitle('Forms');

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
      const organizationId = await requireUserOrgId();
      const { data, error } = await supabase
        .from('project_forms')
        .insert({
          organization_id: organizationId,
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
      'due_diligence': 'Due Diligence Checklist'
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
                  type: 'signature',
                  label: 'Project Manager Verification - Signature',
                  required: true
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
                  type: 'signature',
                  label: 'Architect / Engineer Verification - Signature',
                  required: true
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
                  type: 'signature',
                  label: 'Owner / Executive Approval - Signature',
                  required: true
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
            },
            {
              id: 'final_review_sign_off',
              title: 'Final Review & Sign-Off',
              fields: [
                {
                  id: 'closing_project_manager_verification_name',
                  type: 'text',
                  label: 'Project Manager Verification - Name',
                  required: true,
                  placeholder: 'Enter project manager name'
                },
                {
                  id: 'closing_project_manager_verification_signature',
                  type: 'signature',
                  label: 'Project Manager Verification - Signature',
                  required: true
                },
                {
                  id: 'closing_project_manager_verification_date',
                  type: 'date',
                  label: 'Project Manager Verification - Date',
                  required: true
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
                  type: 'signature',
                  label: 'Due Diligence Conducted By (Project Manager) - Signature',
                  required: true
                },
                {
                  id: 'due_diligence_conducted_by_date',
                  type: 'date',
                  label: 'Due Diligence Conducted By (Project Manager) - Date',
                  required: true
                },
                {
                  id: 'due_diligence_owner_executive_approval_name',
                  type: 'text',
                  label: 'Owner / Executive Approval - Name',
                  required: true,
                  placeholder: 'Enter owner/executive name'
                },
                {
                  id: 'due_diligence_owner_executive_approval_signature',
                  type: 'signature',
                  label: 'Owner / Executive Approval - Signature',
                  required: true
                },
                {
                  id: 'due_diligence_owner_executive_approval_date',
                  type: 'date',
                  label: 'Owner / Executive Approval - Date',
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
      <Card className="border-border/60 bg-card/50">
        <CardContent className="py-12 text-center">
          <div className="mx-auto inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Loading forms...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        {onBack ? (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to Project
          </button>
        ) : (
          <span />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="relative overflow-hidden border-border/60 bg-card/50">
          <div className="absolute inset-y-0 left-0 w-1 bg-sky-500" aria-hidden />
          <CardContent className="p-4 pl-5">
            <p className="mb-1 text-xs text-muted-foreground">Forms Created</p>
            <p className="text-xl font-semibold tabular-nums text-foreground">{forms.length}</p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-border/60 bg-card/50">
          <div className="absolute inset-y-0 left-0 w-1 bg-emerald-500" aria-hidden />
          <CardContent className="p-4 pl-5">
            <p className="mb-1 text-xs text-muted-foreground">Completed</p>
            <p className="text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {forms.filter(f => f.status === 'completed' || f.status === 'approved').length}
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Create New Form</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            className="cursor-pointer border-border/60 bg-card/50 transition-colors hover:bg-muted/30"
            onClick={() => createNewForm('architect_verification')}
          >
            <div className="w-full p-6 text-left">
              <div className="mb-3 flex items-center">
                <div className="mr-4 rounded-lg bg-muted/40 p-3">
                  <FileCheck className="h-6 w-6 text-sky-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-foreground">Architect Verification</h3>
                  <p className="text-sm text-muted-foreground">Design verification checklist</p>
                </div>
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <Plus className="mr-1 h-4 w-4" />
                Create Form
              </div>
            </div>
          </Card>

          <Card
            className="cursor-pointer border-border/60 bg-card/50 transition-colors hover:bg-muted/30"
            onClick={() => createNewForm('closing_checklist')}
          >
            <div className="w-full p-6 text-left">
              <div className="mb-3 flex items-center">
                <div className="mr-4 rounded-lg bg-muted/40 p-3">
                  <CheckCircle className="h-6 w-6 text-emerald-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-foreground">Site Start Checklist</h3>
                  <p className="text-sm text-muted-foreground">Pre-construction setup</p>
                </div>
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <Plus className="mr-1 h-4 w-4" />
                Create Form
              </div>
            </div>
          </Card>

          <Card
            className="cursor-pointer border-border/60 bg-card/50 transition-colors hover:bg-muted/30"
            onClick={() => createNewForm('due_diligence')}
          >
            <div className="w-full p-6 text-left">
              <div className="mb-3 flex items-center">
                <div className="mr-4 rounded-lg bg-muted/40 p-3">
                  <Clock className="h-6 w-6 text-amber-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-foreground">Due Diligence</h3>
                  <p className="text-sm text-muted-foreground">Property analysis checklist</p>
                </div>
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <Plus className="mr-1 h-4 w-4" />
                Create Form
              </div>
            </div>
          </Card>
        </div>
      </section>

      {forms.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Existing Forms</h2>
          <div className="grid gap-4">
              {forms.map((form) => (
                <Card key={form.id} className="border-border/60 bg-card/50">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="mr-4 rounded-lg bg-muted/40 p-3">
                          <FileCheck className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{form.form_name}</h3>
                          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              form.status === 'completed' || form.status === 'approved'
                                ? 'bg-sky-500/15 text-sky-500 border border-sky-500/30'
                                : form.status === 'in_progress'
                                  ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                                  : 'bg-muted text-muted-foreground border border-border'
                            }`}>
                              {form.status === 'completed' ? 'Completed' :
                               form.status === 'approved' ? 'Approved' :
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
                          className="text-destructive hover:text-destructive"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </section>
      )}

      {forms.length === 0 && (
        <Card className="border-border/60 bg-card/50 text-center">
            <CardContent>
              <FileCheck className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
              <h3 className="mb-2 text-lg font-medium text-foreground">No forms created yet</h3>
              <p className="mb-6 text-muted-foreground">
                Create your first project form using one of the options above.
              </p>
            </CardContent>
        </Card>
      )}

      {selectedForm && (
        <DynamicForm 
          form={selectedForm}
          project={project}
          onClose={() => setSelectedForm(null)}
          onSave={async (formData) => {
            try {
              console.log('Saving form data:', formData);
              
              const { error } = await supabase
                .from('project_forms')
                .update({
                  form_data: formData,
                  updated_at: new Date().toISOString()
                })
                .eq('id', selectedForm.id);

              if (error) {
                console.error('Error saving form:', error);
                alert('Failed to save form. Please try again.');
                return;
              }

              console.log('Form saved successfully');
              
              // Reload forms to get the latest data
              await loadProjectForms();
              
              // Update the selected form with new data
              const updatedForm = { ...selectedForm, form_data: formData };
              setSelectedForm(updatedForm);
              
              // Show success message
              alert('Form saved successfully!');
            } catch (error) {
              console.error('Error saving form:', error);
              alert('Failed to save form. Please try again.');
            }
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
  const [currentView, setCurrentView] = useState<'overview' | 'section'>('overview');
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value
    }));
  };

  const handleSave = () => {
    onSave(formData);
  };

  const handleSectionClick = (sectionId: string) => {
    setSelectedSection(sectionId);
    setCurrentView('section');
  };

  const handleBackToOverview = () => {
    setCurrentView('overview');
    setSelectedSection(null);
  };

  const getCurrentSection = () => {
    if (!selectedSection) return null;
    return sections.find(s => s.id === selectedSection);
  };

  const getSectionProgress = (section: any) => {
    const totalFields = section.fields.length;
    const completedFields = section.fields.filter((field: any) => {
      const value = formData[field.id];
      return value !== undefined && value !== null && value !== '';
    }).length;
    return { completed: completedFields, total: totalFields };
  };

  const sections = form.form_schema.sections || [];
  const activeSection = getCurrentSection();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-lg border border-border bg-card">
        {/* Header */}
        <div className="border-b border-border/60 bg-muted/30 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-3">
                {currentView === 'section' && (
                  <Button
                    variant="ghost"
                    onClick={handleBackToOverview}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                )}
                <div>
                  <h2 className="text-xl font-bold text-foreground">{form.form_name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {currentView === 'overview' 
                      ? `${sections.length} sections` 
                      : `${getCurrentSection()?.title || 'Section'}`
                    }
                  </p>
                </div>
              </div>
              {/* Project Information Header */}
              {project && (
                <div className="mt-3 rounded-lg border border-border/60 bg-card p-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-muted-foreground">Project:</span>
                      <span className="ml-2 text-foreground">{project.name || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">Address:</span>
                      <span className="ml-2 text-foreground">
                        {typeof project.address === 'string' 
                          ? project.address 
                          : project.address?.street || 'N/A'
                        }
                        {project.city && `, ${project.city}`}
                        {project.state && `, ${project.state}`}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">Plan:</span>
                      <span className="ml-2 text-foreground">
                        {project.metadata?.planId || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <Button variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4 mr-2" />
              Close
            </Button>
          </div>
        </div>

        {/* Form Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {currentView === 'overview' ? (
            /* Overview - Section Cards */
            <div className="space-y-4">
              {sections.map((section) => {
                const progress = getSectionProgress(section);
                const isComplete = progress.completed === progress.total;
                
                return (
                  <Card 
                    key={section.id} 
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => handleSectionClick(section.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="mb-2 text-lg font-semibold text-foreground">
                            {section.title}
                          </h3>
                          <p className="mb-3 text-sm text-muted-foreground">
                            {section.fields.length} fields
                          </p>
                          <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-2">
                              <div className="h-2 w-24 rounded-full bg-muted">
                                <div 
                                  className="h-2 rounded-full bg-primary transition-all duration-300"
                                  style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {progress.completed}/{progress.total}
                              </span>
                            </div>
                            {isComplete && (
                              <span className="rounded-full border border-sky-500/30 bg-sky-500/15 px-2 py-1 text-xs text-sky-500">
                                Complete
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="ml-4">
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            /* Section Detail */
            <div className="space-y-6">
              {getCurrentSection() && (
                <div>
                  <h3 className="mb-4 text-lg font-semibold text-foreground">
                    {activeSection?.title}
                  </h3>
                  <div className="grid gap-6">
                    {activeSection?.fields.map((field) => (
                      <FormField
                        key={field.id}
                        field={field}
                        value={formData[field.id]}
                        onChange={(value) => handleFieldChange(field.id, value)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/60 bg-muted/30 px-6 py-4">
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              onClick={() => {
                if (confirm('Are you sure you want to delete this form?')) {
                  onDelete(form.id);
                  onClose();
                }
              }}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Form
            </Button>
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Form
            </Button>
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
        return (
          <Input
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
            className="w-full"
          />
        );

      case 'textarea':
        return (
          <textarea
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            rows={4}
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
          <div className="flex items-center space-x-3 rounded-lg border border-border/60 bg-muted/30 p-3">
            <input
              type="checkbox"
              checked={value || false}
              onChange={(e) => onChange(e.target.checked)}
              className="h-4 w-4 rounded border-border/60 text-primary focus:ring-primary"
            />
            <Label className="cursor-pointer text-sm font-medium text-foreground">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
          </div>
        );

      case 'signature':
        return (
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <SignaturePad
              value={value || ''}
              onChange={onChange}
              width={400}
              height={150}
              className="w-full"
              showLabel={false}
            />
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
        <Label className="text-sm font-medium text-foreground">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </Label>
      )}
      {renderField()}
    </div>
  );
};
