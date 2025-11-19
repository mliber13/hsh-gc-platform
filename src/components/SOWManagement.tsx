// ============================================================================
// SOW Management Component
// ============================================================================
//
// Component for managing Statement of Work (SOW) templates
//

import React, { useEffect, useState } from 'react'
import {
  SOWTemplate,
  CreateSOWTemplateInput,
  UpdateSOWTemplateInput,
  SOWTask,
  SOWMaterial,
  SOWSpecification,
} from '@/types/sow'
import {
  fetchSOWTemplates,
  createSOWTemplate,
  updateSOWTemplate,
  deleteSOWTemplate,
  formatSOWForQuoteRequest,
} from '@/services/sowService'
import { TRADE_CATEGORIES, TradeCategory } from '@/types/constants'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Edit, Trash2, ArrowLeft, X } from 'lucide-react'
import hshLogo from '/HSH Contractor Logo - Color.png'

interface SOWManagementProps {
  onBack: () => void
}

export function SOWManagement({ onBack }: SOWManagementProps) {
  const [templates, setTemplates] = useState<SOWTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTradeCategory, setSelectedTradeCategory] = useState<string>('all')
  const [showForm, setShowForm] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<SOWTemplate | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [formTradeCategory, setFormTradeCategory] = useState<TradeCategory | undefined>(undefined)
  const [formTasks, setFormTasks] = useState<SOWTask[]>([])
  const [formMaterialsIncluded, setFormMaterialsIncluded] = useState<SOWMaterial[]>([])
  const [formMaterialsExcluded, setFormMaterialsExcluded] = useState<SOWMaterial[]>([])
  const [formSpecifications, setFormSpecifications] = useState<SOWSpecification[]>([])

  // Load templates
  useEffect(() => {
    loadTemplates()
  }, [selectedTradeCategory])

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const tradeCategory = selectedTradeCategory === 'all' ? undefined : selectedTradeCategory
      const data = await fetchSOWTemplates(tradeCategory)
      setTemplates(data)
    } catch (error) {
      console.error('Error loading SOW templates:', error)
      alert('Failed to load SOW templates')
    } finally {
      setLoading(false)
    }
  }

  const handleNewTemplate = () => {
    setEditingTemplate(null)
    resetForm()
    setShowForm(true)
  }

  const handleEditTemplate = (template: SOWTemplate) => {
    setEditingTemplate(template)
    setFormName(template.name)
    setFormTradeCategory(template.tradeCategory)
    setFormTasks([...template.tasks])
    setFormMaterialsIncluded([...template.materialsIncluded])
    setFormMaterialsExcluded([...template.materialsExcluded])
    setFormSpecifications([...template.specifications])
    setShowForm(true)
  }

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this SOW template? This action cannot be undone.')) {
      return
    }

    try {
      const deleted = await deleteSOWTemplate(templateId)
      if (deleted) {
        await loadTemplates()
        alert('SOW template deleted successfully')
      } else {
        alert('Failed to delete SOW template')
      }
    } catch (error) {
      console.error('Error deleting SOW template:', error)
      alert('Failed to delete SOW template')
    }
  }

  const handleCreateDefaultTemplates = async () => {
    if (!confirm('This will create default SOW templates for Electrical, Plumbing, HVAC, Roofing, and Drywall. Continue?')) {
      return
    }

    setSaving(true)
    try {
      const defaultTemplates: CreateSOWTemplateInput[] = [
        {
          name: 'Standard Electrical SOW',
          tradeCategory: 'electrical',
          tasks: [
            { id: '1', description: 'Rough electrical installation per NEC code', order: 1 },
            { id: '2', description: 'Install all electrical panels and sub-panels', order: 2 },
            { id: '3', description: 'Install all outlets, switches, and junction boxes', order: 3 },
            { id: '4', description: 'Run all electrical wiring (NM-B, THHN as specified)', order: 4 },
            { id: '5', description: 'Install ground fault circuit interrupters (GFCI) as required', order: 5 },
            { id: '6', description: 'Install arc fault circuit interrupters (AFCI) as required', order: 6 },
            { id: '7', description: 'Rough-in for all light fixtures, ceiling fans, and appliances', order: 7 },
            { id: '8', description: 'Complete trim-out and device installation', order: 8 },
            { id: '9', description: 'Install and connect all light fixtures', order: 9 },
            { id: '10', description: 'Coordinate with utility for service connection', order: 10 },
          ],
          materialsIncluded: [
            { id: '1', description: 'All electrical wire and cable', included: true, order: 1 },
            { id: '2', description: 'Electrical boxes (device, junction, panel)', included: true, order: 2 },
            { id: '3', description: 'Circuit breakers and panel components', included: true, order: 3 },
            { id: '4', description: 'Outlet and switch devices (standard grade)', included: true, order: 4 },
            { id: '5', description: 'Wire connectors, staples, and mounting hardware', included: true, order: 5 },
            { id: '6', description: 'Conduit and fittings (if specified)', included: true, order: 6 },
          ],
          materialsExcluded: [
            { id: '1', description: 'Light fixtures and ceiling fans', included: false, order: 1 },
            { id: '2', description: 'Appliances and equipment', included: false, order: 2 },
            { id: '3', description: 'Decorative switches, outlets, and plates', included: false, order: 3 },
            { id: '4', description: 'Owner-furnished equipment', included: false, order: 4 },
          ],
          specifications: [
            { id: '1', label: 'Code Compliance', value: 'NEC 2020 or local code, whichever is stricter', order: 1 },
            { id: '2', label: 'Voltage', value: '120/240V single-phase', order: 2 },
            { id: '3', label: 'Service Size', value: 'As per load calculation', order: 3 },
          ],
        },
        {
          name: 'Standard Plumbing SOW',
          tradeCategory: 'plumbing',
          tasks: [
            { id: '1', description: 'Rough plumbing installation per local plumbing code', order: 1 },
            { id: '2', description: 'Install all water supply lines (hot and cold)', order: 2 },
            { id: '3', description: 'Install all waste and vent (DWV) lines', order: 3 },
            { id: '4', description: 'Install water heater and connections', order: 4 },
            { id: '5', description: 'Rough-in for all fixtures (toilets, sinks, tubs, showers)', order: 5 },
            { id: '6', description: 'Install all shut-off valves', order: 6 },
            { id: '7', description: 'Pressure test all water lines', order: 7 },
            { id: '8', description: 'Water test all waste lines', order: 8 },
            { id: '9', description: 'Complete trim-out and fixture installation', order: 9 },
            { id: '10', description: 'Install and connect all plumbing fixtures', order: 10 },
            { id: '11', description: 'Coordinate with utility for water/sewer connection', order: 11 },
          ],
          materialsIncluded: [
            { id: '1', description: 'All water supply piping (PEX, copper, or as specified)', included: true, order: 1 },
            { id: '2', description: 'All DWV piping (PVC, ABS, or cast iron as specified)', included: true, order: 2 },
            { id: '3', description: 'Fittings, valves, and connectors', included: true, order: 3 },
            { id: '4', description: 'Pipe hangers, straps, and supports', included: true, order: 4 },
            { id: '5', description: 'Water heater (if specified)', included: true, order: 5 },
            { id: '6', description: 'Drain assemblies and trap fittings', included: true, order: 6 },
          ],
          materialsExcluded: [
            { id: '1', description: 'Plumbing fixtures (toilets, sinks, tubs, showers)', included: false, order: 1 },
            { id: '2', description: 'Faucets and shower valves', included: false, order: 2 },
            { id: '3', description: 'Water heater (if owner-furnished)', included: false, order: 3 },
            { id: '4', description: 'Water treatment equipment', included: false, order: 4 },
          ],
          specifications: [
            { id: '1', label: 'Code Compliance', value: 'Local plumbing code and UPC', order: 1 },
            { id: '2', label: 'Water Pressure', value: 'Minimum 40 PSI at all fixtures', order: 2 },
            { id: '3', label: 'Water Supply', value: '3/4" main, 1/2" branch lines', order: 3 },
          ],
        },
        {
          name: 'Standard HVAC SOW',
          tradeCategory: 'hvac',
          tasks: [
            { id: '1', description: 'Install HVAC system per specifications and local code', order: 1 },
            { id: '2', description: 'Install all supply and return ductwork', order: 2 },
            { id: '3', description: 'Install air handler/furnace unit', order: 3 },
            { id: '4', description: 'Install condenser unit (if applicable)', order: 4 },
            { id: '5', description: 'Install all supply and return grilles', order: 5 },
            { id: '6', description: 'Install thermostat and control wiring', order: 6 },
            { id: '7', description: 'Install condensate drain system', order: 7 },
            { id: '8', description: 'Complete refrigerant line connections (if applicable)', order: 8 },
            { id: '9', description: 'Pressure test all refrigerant lines', order: 9 },
            { id: '10', description: 'Perform system start-up and commissioning', order: 10 },
            { id: '11', description: 'Balance air flow to all registers', order: 11 },
          ],
          materialsIncluded: [
            { id: '1', description: 'Air handler/furnace unit', included: true, order: 1 },
            { id: '2', description: 'Condenser unit (if applicable)', included: true, order: 2 },
            { id: '3', description: 'All ductwork (supply and return)', included: true, order: 3 },
            { id: '4', description: 'Duct fittings, transitions, and boots', included: true, order: 4 },
            { id: '5', description: 'Supply and return grilles', included: true, order: 5 },
            { id: '6', description: 'Thermostat and control system', included: true, order: 6 },
            { id: '7', description: 'Refrigerant lines and connections (if applicable)', included: true, order: 7 },
            { id: '8', description: 'Duct insulation and vapor barrier', included: true, order: 8 },
          ],
          materialsExcluded: [
            { id: '1', description: 'Electrical connections to panel (handled by electrician)', included: false, order: 1 },
            { id: '2', description: 'Gas line connections (handled by plumber)', included: false, order: 2 },
            { id: '3', description: 'Upgrade thermostat options', included: false, order: 3 },
          ],
          specifications: [
            { id: '1', label: 'Code Compliance', value: 'Local mechanical code and manufacturer specifications', order: 1 },
            { id: '2', label: 'System Capacity', value: 'As per load calculation', order: 2 },
            { id: '3', label: 'Efficiency Rating', value: 'SEER 14 minimum (or as specified)', order: 3 },
          ],
        },
        {
          name: 'Standard Roofing SOW',
          tradeCategory: 'roofing',
          tasks: [
            { id: '1', description: 'Remove existing roofing materials (if applicable)', order: 1 },
            { id: '2', description: 'Inspect and repair roof deck as needed', order: 2 },
            { id: '3', description: 'Install ice and water shield at eaves and valleys', order: 3 },
            { id: '4', description: 'Install underlayment (felt or synthetic)', order: 4 },
            { id: '5', description: 'Install starter strip at eaves', order: 5 },
            { id: '6', description: 'Install roofing shingles per manufacturer specifications', order: 6 },
            { id: '7', description: 'Install ridge cap shingles', order: 7 },
            { id: '8', description: 'Install step flashing at walls and chimneys', order: 8 },
            { id: '9', description: 'Install valley flashing (if applicable)', order: 9 },
            { id: '10', description: 'Install vent boots and flashing', order: 10 },
            { id: '11', description: 'Clean up all debris and dispose of waste materials', order: 11 },
          ],
          materialsIncluded: [
            { id: '1', description: 'Roofing shingles (architectural grade)', included: true, order: 1 },
            { id: '2', description: 'Underlayment (30# felt or synthetic)', included: true, order: 2 },
            { id: '3', description: 'Ice and water shield', included: true, order: 3 },
            { id: '4', description: 'Roofing nails and fasteners', included: true, order: 4 },
            { id: '5', description: 'Starter strip and ridge cap shingles', included: true, order: 5 },
            { id: '6', description: 'Flashing (step, valley, vent boots)', included: true, order: 6 },
            { id: '7', description: 'Drip edge (if specified)', included: true, order: 7 },
          ],
          materialsExcluded: [
            { id: '1', description: 'Roof deck repair materials (if extensive)', included: false, order: 1 },
            { id: '2', description: 'Chimney repair or tuckpointing', included: false, order: 2 },
            { id: '3', description: 'Gutter installation', included: false, order: 3 },
            { id: '4', description: 'Skylights', included: false, order: 4 },
          ],
          specifications: [
            { id: '1', label: 'Code Compliance', value: 'Local building code and manufacturer specifications', order: 1 },
            { id: '2', label: 'Shingle Type', value: 'Architectural/3-tab (as specified)', order: 2 },
            { id: '3', label: 'Warranty', value: 'Manufacturer warranty applies', order: 3 },
          ],
        },
        {
          name: 'Standard Drywall SOW',
          tradeCategory: 'drywall',
          tasks: [
            { id: '1', description: 'Install all drywall panels per specifications', order: 1 },
            { id: '2', description: 'Hang drywall on walls (all rooms)', order: 2 },
            { id: '3', description: 'Hang drywall on ceilings', order: 3 },
            { id: '4', description: 'Tape all joints with joint compound', order: 4 },
            { id: '5', description: 'Apply first coat of joint compound', order: 5 },
            { id: '6', description: 'Apply second coat of joint compound', order: 6 },
            { id: '7', description: 'Apply final coat and sand smooth', order: 7 },
            { id: '8', description: 'Install corner bead at all outside corners', order: 8 },
            { id: '9', description: 'Install drywall around electrical boxes and fixtures', order: 9 },
            { id: '10', description: 'Prime all drywall surfaces', order: 10 },
          ],
          materialsIncluded: [
            { id: '1', description: 'Drywall panels (1/2" standard, 5/8" ceilings if specified)', included: true, order: 1 },
            { id: '2', description: 'Drywall screws and fasteners', included: true, order: 2 },
            { id: '3', description: 'Joint compound (pre-mixed)', included: true, order: 3 },
            { id: '4', description: 'Drywall tape (paper or mesh)', included: true, order: 4 },
            { id: '5', description: 'Corner bead (metal or plastic)', included: true, order: 5 },
            { id: '6', description: 'Primer (PVA or drywall primer)', included: true, order: 6 },
          ],
          materialsExcluded: [
            { id: '1', description: 'Paint and finish materials', included: false, order: 1 },
            { id: '2', description: 'Texture materials (if applicable)', included: false, order: 2 },
            { id: '3', description: 'Backing materials for heavy fixtures', included: false, order: 3 },
          ],
          specifications: [
            { id: '1', label: 'Code Compliance', value: 'Local building code', order: 1 },
            { id: '2', label: 'Drywall Thickness', value: '1/2" walls, 5/8" ceilings (or as specified)', order: 2 },
            { id: '3', label: 'Finish Level', value: 'Level 4 finish (ready for paint)', order: 3 },
          ],
        },
      ]

      let createdCount = 0
      for (const template of defaultTemplates) {
        const result = await createSOWTemplate(template)
        if (result) {
          createdCount++
        }
      }

      await loadTemplates()
      
      if (createdCount === defaultTemplates.length) {
        alert(`Successfully created ${createdCount} default SOW templates!`)
      } else if (createdCount > 0) {
        alert(`Created ${createdCount} of ${defaultTemplates.length} templates. Some may already exist.`)
      } else {
        alert('Unable to create templates. They may already exist, or there was an error.')
      }
    } catch (error) {
      console.error('Error creating default templates:', error)
      alert('Failed to create default templates')
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setFormName('')
    setFormTradeCategory(undefined)
    setFormTasks([])
    setFormMaterialsIncluded([])
    setFormMaterialsExcluded([])
    setFormSpecifications([])
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      alert('Please enter a name for the SOW template')
      return
    }

    setSaving(true)
    try {
      if (editingTemplate) {
        const updateInput: UpdateSOWTemplateInput = {
          name: formName.trim(),
          tradeCategory: formTradeCategory,
          tasks: formTasks,
          materialsIncluded: formMaterialsIncluded,
          materialsExcluded: formMaterialsExcluded,
          specifications: formSpecifications,
        }
        const updated = await updateSOWTemplate(editingTemplate.id, updateInput)
        if (updated) {
          await loadTemplates()
          setShowForm(false)
          alert('SOW template updated successfully')
        } else {
          alert('Failed to update SOW template')
        }
      } else {
        const createInput: CreateSOWTemplateInput = {
          name: formName.trim(),
          tradeCategory: formTradeCategory,
          tasks: formTasks,
          materialsIncluded: formMaterialsIncluded,
          materialsExcluded: formMaterialsExcluded,
          specifications: formSpecifications,
        }
        const created = await createSOWTemplate(createInput)
        if (created) {
          await loadTemplates()
          setShowForm(false)
          alert('SOW template created successfully')
        } else {
          alert('Failed to create SOW template')
        }
      }
    } catch (error) {
      console.error('Error saving SOW template:', error)
      alert('Failed to save SOW template')
    } finally {
      setSaving(false)
    }
  }

  // Task management helpers
  const addTask = () => {
    const newTask: SOWTask = {
      id: `task-${Date.now()}`,
      description: '',
      order: formTasks.length,
    }
    setFormTasks([...formTasks, newTask])
  }

  const updateTask = (id: string, description: string) => {
    setFormTasks(formTasks.map(t => t.id === id ? { ...t, description } : t))
  }

  const removeTask = (id: string) => {
    setFormTasks(formTasks.filter(t => t.id !== id).map((t, idx) => ({ ...t, order: idx })))
  }

  // Material management helpers
  const addMaterial = (included: boolean) => {
    const newMaterial: SOWMaterial = {
      id: `material-${Date.now()}`,
      description: '',
      included,
      order: included ? formMaterialsIncluded.length : formMaterialsExcluded.length,
    }
    if (included) {
      setFormMaterialsIncluded([...formMaterialsIncluded, newMaterial])
    } else {
      setFormMaterialsExcluded([...formMaterialsExcluded, newMaterial])
    }
  }

  const updateMaterial = (id: string, description: string, included: boolean) => {
    if (included) {
      setFormMaterialsIncluded(formMaterialsIncluded.map(m => 
        m.id === id ? { ...m, description } : m
      ))
    } else {
      setFormMaterialsExcluded(formMaterialsExcluded.map(m => 
        m.id === id ? { ...m, description } : m
      ))
    }
  }

  const removeMaterial = (id: string, included: boolean) => {
    if (included) {
      setFormMaterialsIncluded(
        formMaterialsIncluded.filter(m => m.id !== id).map((m, idx) => ({ ...m, order: idx }))
      )
    } else {
      setFormMaterialsExcluded(
        formMaterialsExcluded.filter(m => m.id !== id).map((m, idx) => ({ ...m, order: idx }))
      )
    }
  }

  // Specification management helpers
  const addSpecification = () => {
    const newSpec: SOWSpecification = {
      id: `spec-${Date.now()}`,
      label: '',
      value: '',
      order: formSpecifications.length,
    }
    setFormSpecifications([...formSpecifications, newSpec])
  }

  const updateSpecification = (id: string, label: string, value: string) => {
    setFormSpecifications(formSpecifications.map(s => 
      s.id === id ? { ...s, label, value } : s
    ))
  }

  const removeSpecification = (id: string) => {
    setFormSpecifications(
      formSpecifications.filter(s => s.id !== id).map((s, idx) => ({ ...s, order: idx }))
    )
  }

  const filteredTemplates = selectedTradeCategory === 'all'
    ? templates
    : templates.filter(t => t.tradeCategory === selectedTradeCategory)

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pb-20 sm:pb-0">
      {/* Header */}
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <img src={hshLogo} alt="HSH Contractor" className="h-12 w-auto" />
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Statement of Work Templates</h1>
                <p className="text-sm text-gray-600 mt-1">Manage SOW templates for quote requests</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleNewTemplate} className="bg-[#0E79C9] hover:bg-[#0A5A96]">
                <Plus className="w-4 h-4 mr-2" />
                New Template
              </Button>
              <Button 
                onClick={handleCreateDefaultTemplates} 
                variant="outline"
                disabled={saving}
                className="border-[#0E79C9] text-[#0E79C9] hover:bg-[#0E79C9] hover:text-white"
              >
                {saving ? 'Creating...' : 'Create Default Templates'}
              </Button>
              <Button onClick={onBack} variant="outline" className="border-[#0E79C9] text-[#0E79C9] hover:bg-[#0E79C9] hover:text-white">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Filter */}
        <div className="mb-6">
          <Select value={selectedTradeCategory} onValueChange={setSelectedTradeCategory}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Filter by trade category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Trade Categories</SelectItem>
              {Object.entries(TRADE_CATEGORIES).map(([key, { label }]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Templates List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0E79C9] mx-auto mb-4"></div>
            <p className="text-gray-600">Loading SOW templates...</p>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center py-12">
              <p className="text-gray-600 mb-4">No SOW templates found</p>
              <Button onClick={handleNewTemplate} className="bg-[#0E79C9] hover:bg-[#0A5A96]">
                <Plus className="w-4 h-4 mr-2" />
                Create First Template
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map(template => (
              <Card key={template.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                <CardTitle className="text-lg">{template.name}</CardTitle>
                {template.tradeCategory && (
                        <p className="text-xs text-gray-500 mt-1">
                          {TRADE_CATEGORIES[template.tradeCategory]?.label || template.tradeCategory}
                        </p>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-gray-600 mb-4">
                    <p>{template.tasks.length} task(s)</p>
                    <p>{template.materialsIncluded.length} material(s) included</p>
                    <p>{template.materialsExcluded.length} material(s) excluded</p>
                    <p>{template.specifications.length} specification(s)</p>
                    <p className="text-xs text-gray-500">Used {template.useCount} time(s)</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleEditTemplate(template)}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      onClick={() => handleDeleteTemplate(template.id)}
                      variant="destructive"
                      size="sm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit SOW Template' : 'New SOW Template'}</DialogTitle>
            <DialogDescription>
              {editingTemplate ? 'Update the Statement of Work template' : 'Create a new Statement of Work template'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="templateName">Name *</Label>
                <Input
                  id="templateName"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Standard Electrical SOW"
                  required
                />
              </div>
              <div>
                <Label htmlFor="tradeCategory">Trade Category</Label>
                <Select
                  value={formTradeCategory || 'none'}
                  onValueChange={(value) => setFormTradeCategory(value === 'none' ? undefined : value as TradeCategory)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select trade category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {Object.entries(TRADE_CATEGORIES).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tasks */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Tasks</Label>
                <Button type="button" onClick={addTask} variant="outline" size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Task
                </Button>
              </div>
              <div className="space-y-2">
                {formTasks.map((task, index) => (
                  <div key={task.id} className="flex gap-2">
                    <Input
                      value={task.description}
                      onChange={(e) => updateTask(task.id, e.target.value)}
                      placeholder={`Task ${index + 1}`}
                    />
                    <Button
                      type="button"
                      onClick={() => removeTask(task.id)}
                      variant="ghost"
                      size="sm"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                {formTasks.length === 0 && (
                  <p className="text-sm text-gray-500 italic">No tasks added yet</p>
                )}
              </div>
            </div>

            {/* Materials Included */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Materials Included</Label>
                <Button type="button" onClick={() => addMaterial(true)} variant="outline" size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Material
                </Button>
              </div>
              <div className="space-y-2">
                {formMaterialsIncluded.map((material, index) => (
                  <div key={material.id} className="flex gap-2">
                    <Input
                      value={material.description}
                      onChange={(e) => updateMaterial(material.id, e.target.value, true)}
                      placeholder={`Material ${index + 1}`}
                    />
                    <Button
                      type="button"
                      onClick={() => removeMaterial(material.id, true)}
                      variant="ghost"
                      size="sm"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                {formMaterialsIncluded.length === 0 && (
                  <p className="text-sm text-gray-500 italic">No materials included yet</p>
                )}
              </div>
            </div>

            {/* Materials Excluded */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Materials Excluded</Label>
                <Button type="button" onClick={() => addMaterial(false)} variant="outline" size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Material
                </Button>
              </div>
              <div className="space-y-2">
                {formMaterialsExcluded.map((material, index) => (
                  <div key={material.id} className="flex gap-2">
                    <Input
                      value={material.description}
                      onChange={(e) => updateMaterial(material.id, e.target.value, false)}
                      placeholder={`Material ${index + 1}`}
                    />
                    <Button
                      type="button"
                      onClick={() => removeMaterial(material.id, false)}
                      variant="ghost"
                      size="sm"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                {formMaterialsExcluded.length === 0 && (
                  <p className="text-sm text-gray-500 italic">No materials excluded yet</p>
                )}
              </div>
            </div>

            {/* Specifications */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Specifications</Label>
                <Button type="button" onClick={addSpecification} variant="outline" size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Specification
                </Button>
              </div>
              <div className="space-y-2">
                {formSpecifications.map((spec, index) => (
                  <div key={spec.id} className="grid grid-cols-2 gap-2">
                    <Input
                      value={spec.label}
                      onChange={(e) => updateSpecification(spec.id, e.target.value, spec.value)}
                      placeholder={`Label ${index + 1}`}
                    />
                    <div className="flex gap-2">
                      <Input
                        value={spec.value}
                        onChange={(e) => updateSpecification(spec.id, spec.label, e.target.value)}
                        placeholder={`Value ${index + 1}`}
                      />
                      <Button
                        type="button"
                        onClick={() => removeSpecification(spec.id)}
                        variant="ghost"
                        size="sm"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {formSpecifications.length === 0 && (
                  <p className="text-sm text-gray-500 italic">No specifications added yet</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#0E79C9] hover:bg-[#0A5A96]">
              {saving ? 'Saving...' : editingTemplate ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

