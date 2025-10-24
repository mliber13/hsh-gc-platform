import { supabase } from '../lib/supabase';

export interface FormTemplate {
  id: string;
  template_name: string;
  form_type: string;
  version: string;
  form_schema: any;
  description?: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectForm {
  id: string;
  organization_id: string;
  project_id: string;
  template_id?: string;
  form_type: string;
  form_name: string;
  version: string;
  form_schema: any;
  form_data: Record<string, any>;
  status: 'draft' | 'in_progress' | 'completed' | 'approved';
  sign_offs: Record<string, any>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface FormResponse {
  id: string;
  organization_id: string;
  project_form_id: string;
  field_id: string;
  field_type: string;
  section_id?: string;
  response_value: any;
  responded_by: string;
  responded_at: string;
}

export class FormService {
  // ============================================================================
  // FORM TEMPLATES
  // ============================================================================

  static async getFormTemplates(): Promise<FormTemplate[]> {
    const { data, error } = await supabase
      .from('form_templates')
      .select('*')
      .eq('is_active', true)
      .order('template_name');

    if (error) throw error;
    return data || [];
  }

  static async getFormTemplate(formType: string): Promise<FormTemplate | null> {
    const { data, error } = await supabase
      .from('form_templates')
      .select('*')
      .eq('form_type', formType)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async createFormTemplate(template: Omit<FormTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<FormTemplate> {
    const { data, error } = await supabase
      .from('form_templates')
      .insert(template)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ============================================================================
  // PROJECT FORMS
  // ============================================================================

  static async getProjectForms(projectId: string): Promise<ProjectForm[]> {
    const { data, error } = await supabase
      .from('project_forms')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async getProjectForm(formId: string): Promise<ProjectForm | null> {
    const { data, error } = await supabase
      .from('project_forms')
      .select('*')
      .eq('id', formId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async createProjectForm(form: Omit<ProjectForm, 'id' | 'created_at' | 'updated_at'>): Promise<ProjectForm> {
    const { data, error } = await supabase
      .from('project_forms')
      .insert(form)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateProjectForm(formId: string, updates: Partial<ProjectForm>): Promise<ProjectForm> {
    const { data, error } = await supabase
      .from('project_forms')
      .update(updates)
      .eq('id', formId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateFormData(formId: string, formData: Record<string, any>): Promise<ProjectForm> {
    return this.updateProjectForm(formId, { 
      form_data: formData,
      status: 'in_progress'
    });
  }

  static async completeForm(formId: string, formData: Record<string, any>): Promise<ProjectForm> {
    return this.updateProjectForm(formId, { 
      form_data: formData,
      status: 'completed'
    });
  }

  static async addSignature(formId: string, signOffKey: string, signatureData: any): Promise<ProjectForm> {
    const form = await this.getProjectForm(formId);
    if (!form) throw new Error('Form not found');

    const updatedSignOffs = {
      ...form.sign_offs,
      [signOffKey]: {
        ...signatureData,
        signed_at: new Date().toISOString()
      }
    };

    return this.updateProjectForm(formId, { sign_offs: updatedSignOffs });
  }

  // ============================================================================
  // FORM RESPONSES (Detailed tracking)
  // ============================================================================

  static async getFormResponses(formId: string): Promise<FormResponse[]> {
    const { data, error } = await supabase
      .from('form_responses')
      .select('*')
      .eq('project_form_id', formId)
      .order('responded_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async createFormResponse(response: Omit<FormResponse, 'id' | 'responded_at'>): Promise<FormResponse> {
    const { data, error } = await supabase
      .from('form_responses')
      .insert(response)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  static async createFormFromTemplate(projectId: string, formType: string): Promise<ProjectForm> {
    // Get the latest template for this form type
    const template = await this.getFormTemplate(formType);
    if (!template) {
      throw new Error(`No template found for form type: ${formType}`);
    }

    // Create new form instance
    const formData: Omit<ProjectForm, 'id' | 'created_at' | 'updated_at'> = {
      organization_id: 'default-org', // This would come from user context
      project_id: projectId,
      template_id: template.id,
      form_type: formType,
      form_name: template.template_name,
      version: template.version,
      form_schema: template.form_schema,
      form_data: {},
      status: 'draft',
      sign_offs: {},
      created_by: (await supabase.auth.getUser()).data.user?.id || ''
    };

    return this.createProjectForm(formData);
  }

  static async getFormCompletionPercentage(formId: string): Promise<number> {
    const { data, error } = await supabase
      .rpc('get_form_completion_percentage', { form_id: formId });

    if (error) throw error;
    return data || 0;
  }

  static async isFormFullySignedOff(formId: string): Promise<boolean> {
    const { data, error } = await supabase
      .rpc('is_form_fully_signed_off', { form_id: formId });

    if (error) throw error;
    return data || false;
  }

  // ============================================================================
  // SEARCH AND FILTERING
  // ============================================================================

  static async searchForms(query: string, projectId?: string): Promise<ProjectForm[]> {
    let queryBuilder = supabase
      .from('project_forms')
      .select('*')
      .or(`form_name.ilike.%${query}%,form_data->>project_name.ilike.%${query}%`);

    if (projectId) {
      queryBuilder = queryBuilder.eq('project_id', projectId);
    }

    const { data, error } = await queryBuilder.order('updated_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async getFormsByStatus(status: string, projectId?: string): Promise<ProjectForm[]> {
    let queryBuilder = supabase
      .from('project_forms')
      .select('*')
      .eq('status', status);

    if (projectId) {
      queryBuilder = queryBuilder.eq('project_id', projectId);
    }

    const { data, error } = await queryBuilder.order('updated_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // ============================================================================
  // ANALYTICS AND REPORTING
  // ============================================================================

  static async getFormAnalytics(projectId?: string): Promise<{
    total_forms: number;
    completed_forms: number;
    pending_forms: number;
    completion_rate: number;
  }> {
    let queryBuilder = supabase
      .from('project_forms')
      .select('status');

    if (projectId) {
      queryBuilder = queryBuilder.eq('project_id', projectId);
    }

    const { data, error } = await queryBuilder;

    if (error) throw error;

    const forms = data || [];
    const total = forms.length;
    const completed = forms.filter(f => f.status === 'completed' || f.status === 'approved').length;
    const pending = forms.filter(f => f.status === 'draft' || f.status === 'in_progress').length;

    return {
      total_forms: total,
      completed_forms: completed,
      pending_forms: pending,
      completion_rate: total > 0 ? (completed / total) * 100 : 0
    };
  }
}
