import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';
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
    loadProjectForms();
  }, [projectId]);

  const loadProjectForms = async () => {
    try {
      setLoading(true);
      // TODO: Implement API call to load forms for this project
      // const response = await supabase
      //   .from('project_forms')
      //   .select('*')
      //   .eq('project_id', projectId);
      // setForms(response.data || []);
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
      
      // Add the new form to the local state
      setForms(prev => [...prev, data]);
      
      // Open the form for editing
      setSelectedForm(data);
      
    } catch (error) {
      console.error('Error creating form:', error);
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
    // This would typically come from the form_templates table
    // For now, return a basic structure with some sample fields
    return {
      title: getFormDisplayName(formType),
      sections: [
        {
          id: 'basic_info',
          title: 'Basic Information',
          fields: [
            {
              id: 'project_name',
              type: 'text',
              label: 'Project Name',
              required: true,
              placeholder: 'Enter project name'
            },
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
          onClose={() => setSelectedForm(null)}
          onSave={(formData) => {
            // TODO: Implement save functionality
            console.log('Saving form data:', formData);
          }}
        />
      )}
    </div>
  );
};

interface DynamicFormProps {
  form: ProjectForm;
  onClose: () => void;
  onSave: (formData: Record<string, any>) => void;
}

const DynamicForm: React.FC<DynamicFormProps> = ({ form, onClose, onSave }) => {
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
            <option value="">Select an option</option>
            {field.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
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
