import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';

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
}

export const ProjectForms: React.FC<ProjectFormsProps> = ({ projectId }) => {
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
    try {
      // TODO: Implement API call to create new form
      // const response = await supabase
      //   .from('project_forms')
      //   .insert({
      //     project_id: projectId,
      //     form_type: formType,
      //     form_name: getFormDisplayName(formType),
      //     form_schema: getFormTemplate(formType),
      //     form_data: {},
      //     status: 'draft'
      //   });
      // loadProjectForms();
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
    // For now, return a basic structure
    return {
      sections: [],
      sign_offs: {}
    };
  };

  if (loading) {
    return <div>Loading forms...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Project Forms</h2>
        <div className="flex gap-2">
          <Button onClick={() => createNewForm('architect_verification')}>
            + Architect Verification
          </Button>
          <Button onClick={() => createNewForm('closing_checklist')}>
            + Closing Checklist
          </Button>
          <Button onClick={() => createNewForm('due_diligence')}>
            + Due Diligence
          </Button>
          <Button onClick={() => createNewForm('selections')}>
            + Selections
          </Button>
        </div>
      </div>

      {forms.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-gray-500 mb-4">No forms created yet for this project.</p>
          <p className="text-sm text-gray-400">
            Click one of the buttons above to create a new form.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {forms.map((form) => (
            <Card key={form.id} className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold">{form.form_name}</h3>
                  <p className="text-sm text-gray-500">
                    Status: <span className="capitalize">{form.status}</span>
                  </p>
                  <p className="text-sm text-gray-500">
                    Updated: {new Date(form.updated_at).toLocaleDateString()}
                  </p>
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
            </Card>
          ))}
        </div>
      )}

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
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">{form.form_name}</h2>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>

          {/* Section Navigation */}
          {sections.length > 1 && (
            <div className="flex gap-2 mb-6 overflow-x-auto">
              {sections.map((section, index) => (
                <Button
                  key={section.id}
                  variant={index === currentSection ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentSection(index)}
                >
                  {section.title}
                </Button>
              ))}
            </div>
          )}

          {/* Current Section */}
          {currentSectionData && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">{currentSectionData.title}</h3>
              <div className="grid gap-4">
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
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-6 pt-4 border-t">
            <div>
              {currentSection > 0 && (
                <Button 
                  variant="outline"
                  onClick={() => setCurrentSection(currentSection - 1)}
                >
                  Previous
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleSave}>
                Save Draft
              </Button>
              {currentSection < sections.length - 1 ? (
                <Button onClick={() => setCurrentSection(currentSection + 1)}>
                  Next
                </Button>
              ) : (
                <Button onClick={handleSave}>
                  Complete Form
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
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
            multiline={field.type === 'textarea'}
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
          />
        );

      case 'date':
        return (
          <Input
            type="date"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
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
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={value || false}
              onChange={(e) => onChange(e.target.checked)}
              className="rounded"
            />
            <Label className="text-sm">{field.label}</Label>
          </div>
        );

      default:
        return (
          <Input
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
          />
        );
    }
  };

  return (
    <div className="space-y-2">
      {field.type !== 'checkbox' && (
        <Label className="text-sm font-medium">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </Label>
      )}
      {renderField()}
    </div>
  );
};
