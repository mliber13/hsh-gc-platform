import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Edit, ArchiveRestore, Archive, ArrowLeft } from 'lucide-react'
import {
  Subcontractor,
  Supplier,
  SubcontractorInput,
  SupplierInput,
} from '@/types'
import {
  fetchSubcontractors,
  fetchSuppliers,
  createSubcontractor,
  createSupplier,
  updateSubcontractor,
  updateSupplier,
  setSubcontractorActive,
  setSupplierActive,
} from '@/services/partnerDirectoryService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

type TabKey = 'subcontractors' | 'suppliers'

interface PartnerDirectoryProps {
  onBack: () => void
}

interface FormState {
  name: string
  tradeOrCategory: string
  contactName: string
  email: string
  phone: string
  website: string
  notes: string
  isActive: boolean
}

const INITIAL_FORM_STATE: FormState = {
  name: '',
  tradeOrCategory: '',
  contactName: '',
  email: '',
  phone: '',
  website: '',
  notes: '',
  isActive: true,
}

export function PartnerDirectory({ onBack }: PartnerDirectoryProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('subcontractors')
  const [showInactive, setShowInactive] = useState(false)

  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  const [loadingSubcontractors, setLoadingSubcontractors] = useState(false)
  const [loadingSuppliers, setLoadingSuppliers] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [formState, setFormState] = useState<FormState>(INITIAL_FORM_STATE)
  const [formMode, setFormMode] = useState<TabKey>('subcontractors')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const currentList = activeTab === 'subcontractors' ? subcontractors : suppliers
  const isLoadingCurrent = activeTab === 'subcontractors' ? loadingSubcontractors : loadingSuppliers

  const entityLabel = useMemo(() => (activeTab === 'subcontractors' ? 'Subcontractor' : 'Supplier'), [activeTab])

  const loadSubcontractors = useCallback(async (includeInactive: boolean) => {
    setLoadingSubcontractors(true)
    try {
      const data = await fetchSubcontractors({ includeInactive })
      setSubcontractors(data)
    } catch (error: any) {
      console.error('Failed to load subcontractors', error)
      alert(error?.message || 'Failed to load subcontractors.')
    } finally {
      setLoadingSubcontractors(false)
    }
  }, [])

  const loadSuppliers = useCallback(async (includeInactive: boolean) => {
    setLoadingSuppliers(true)
    try {
      const data = await fetchSuppliers({ includeInactive })
      setSuppliers(data)
    } catch (error: any) {
      console.error('Failed to load suppliers', error)
      alert(error?.message || 'Failed to load suppliers.')
    } finally {
      setLoadingSuppliers(false)
    }
  }, [])

  const refreshActiveTab = useCallback(async () => {
    if (activeTab === 'subcontractors') {
      await loadSubcontractors(showInactive)
    } else {
      await loadSuppliers(showInactive)
    }
  }, [activeTab, loadSubcontractors, loadSuppliers, showInactive])

  useEffect(() => {
    refreshActiveTab()
  }, [refreshActiveTab])

  const openCreateForm = (mode: TabKey) => {
    setFormMode(mode)
    setFormState({ ...INITIAL_FORM_STATE, isActive: true })
    setEditingId(null)
    setFormOpen(true)
  }

  const openEditForm = (mode: TabKey, record: Subcontractor | Supplier) => {
    setFormMode(mode)
    setEditingId(record.id)
    setFormState({
      name: record.name,
      tradeOrCategory: mode === 'subcontractors'
        ? (record as Subcontractor).trade || ''
        : (record as Supplier).category || '',
      contactName: record.contactName || '',
      email: record.email || '',
      phone: record.phone || '',
      website: record.website || '',
      notes: record.notes || '',
      isActive: record.isActive,
    })
    setFormOpen(true)
  }

  const handleFormChange = (field: keyof FormState, value: string | boolean) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!formState.name.trim()) {
      alert('Name is required.')
      return
    }

    setSaving(true)
    try {
      if (formMode === 'subcontractors') {
        const payload: SubcontractorInput = {
          name: formState.name,
          trade: formState.tradeOrCategory || null,
          contactName: formState.contactName || null,
          email: formState.email || null,
          phone: formState.phone || null,
          website: formState.website || null,
          notes: formState.notes || null,
          isActive: formState.isActive,
        }

        if (editingId) {
          await updateSubcontractor(editingId, payload)
        } else {
          await createSubcontractor(payload)
        }

        await loadSubcontractors(showInactive)
      } else {
        const payload: SupplierInput = {
          name: formState.name,
          category: formState.tradeOrCategory || null,
          contactName: formState.contactName || null,
          email: formState.email || null,
          phone: formState.phone || null,
          website: formState.website || null,
          notes: formState.notes || null,
          isActive: formState.isActive,
        }

        if (editingId) {
          await updateSupplier(editingId, payload)
        } else {
          await createSupplier(payload)
        }

        await loadSuppliers(showInactive)
      }

      setFormOpen(false)
      setFormState(INITIAL_FORM_STATE)
      setEditingId(null)
    } catch (error: any) {
      console.error('Failed to save partner record', error)
      alert(error?.message || 'Failed to save record. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (record: Subcontractor | Supplier) => {
    const nextState = !record.isActive
    try {
      if (activeTab === 'subcontractors') {
        await setSubcontractorActive(record.id, nextState)
        await loadSubcontractors(showInactive)
      } else {
        await setSupplierActive(record.id, nextState)
        await loadSuppliers(showInactive)
      }
    } catch (error: any) {
      console.error('Failed to toggle active state', error)
      alert(error?.message || 'Failed to update status.')
    }
  }

  const tableHeaders = useMemo(() => {
    if (activeTab === 'subcontractors') {
      return ['Name', 'Trade', 'Contact', 'Email', 'Phone', 'Status', '']
    }
    return ['Name', 'Category', 'Contact', 'Email', 'Phone', 'Status', '']
  }, [activeTab])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Button variant="ghost" className="mb-3 px-0" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-3xl font-semibold text-slate-900">Partner Directory</h1>
            <p className="text-sm text-slate-600 mt-1">
              Maintain reusable subcontractor and supplier lists for quick selection across the app.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={refreshActiveTab}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={() => openCreateForm(activeTab)}>
              <Plus className="w-4 h-4 mr-2" />
              Add {entityLabel}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex rounded-lg border border-slate-300 bg-white p-1">
            <button
              type="button"
              onClick={() => setActiveTab('subcontractors')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                activeTab === 'subcontractors'
                  ? 'bg-[#0E79C9] text-white shadow'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Subcontractors
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('suppliers')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                activeTab === 'suppliers'
                  ? 'bg-[#0E79C9] text-white shadow'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Suppliers
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Show inactive
          </label>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{entityLabel} List</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingCurrent ? (
              <div className="py-16 text-center text-sm text-slate-500">Loading {entityLabel.toLowerCase()}...</div>
            ) : currentList.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm text-slate-500">
                  {showInactive
                    ? `No ${entityLabel.toLowerCase()} records found for this organization.`
                    : `No active ${entityLabel.toLowerCase()} records yet. Add one to get started.`}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      {tableHeaders.map((header) => (
                        <th key={header} className="px-4 py-3">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentList.map((record) => (
                      <tr key={record.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-medium text-slate-900">{record.name}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {activeTab === 'subcontractors'
                            ? (record as Subcontractor).trade || '—'
                            : (record as Supplier).category || '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{record.contactName || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{record.email || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{record.phone || '—'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                              record.isActive
                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-200 text-slate-600 border border-slate-300'
                            }`}
                          >
                            {record.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openEditForm(activeTab, record)}
                            >
                              <Edit className="w-4 h-4 mr-1" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant={record.isActive ? 'secondary' : 'outline'}
                              size="sm"
                              onClick={() => handleToggleActive(record)}
                            >
                              {record.isActive ? (
                                <>
                                  <Archive className="w-4 h-4 mr-1" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <ArchiveRestore className="w-4 h-4 mr-1" />
                                  Activate
                                </>
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId ? `Edit ${formMode === 'subcontractors' ? 'Subcontractor' : 'Supplier'}` : `Add ${
                  formMode === 'subcontractors' ? 'Subcontractor' : 'Supplier'
                }`}
              </DialogTitle>
              <DialogDescription>
                Keep this directory up to date so everyone can reuse consistent partner information.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="partner-name">Name *</Label>
                  <Input
                    id="partner-name"
                    value={formState.name}
                    onChange={(e) => handleFormChange('name', e.target.value)}
                    placeholder="Company or individual name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="partner-trade">
                    {formMode === 'subcontractors' ? 'Trade / Specialty' : 'Category'}
                  </Label>
                  <Input
                    id="partner-trade"
                    value={formState.tradeOrCategory}
                    onChange={(e) => handleFormChange('tradeOrCategory', e.target.value)}
                    placeholder={formMode === 'subcontractors' ? 'e.g., Framing' : 'e.g., Lumber Supplier'}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="partner-contact">Contact Name</Label>
                  <Input
                    id="partner-contact"
                    value={formState.contactName}
                    onChange={(e) => handleFormChange('contactName', e.target.value)}
                    placeholder="Primary point of contact"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="partner-email">Email</Label>
                  <Input
                    id="partner-email"
                    type="email"
                    value={formState.email}
                    onChange={(e) => handleFormChange('email', e.target.value)}
                    placeholder="contact@example.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="partner-phone">Phone</Label>
                  <Input
                    id="partner-phone"
                    value={formState.phone}
                    onChange={(e) => handleFormChange('phone', e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="partner-website">Website</Label>
                  <Input
                    id="partner-website"
                    value={formState.website}
                    onChange={(e) => handleFormChange('website', e.target.value)}
                    placeholder="https://"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="partner-notes">Notes</Label>
                <textarea
                  id="partner-notes"
                  className="w-full min-h-[100px] rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E79C9]"
                  value={formState.notes}
                  onChange={(e) => handleFormChange('notes', e.target.value)}
                  placeholder="Additional details, coverage area, preferred contact method, etc."
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={formState.isActive}
                  onChange={(e) => handleFormChange('isActive', e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Active
              </label>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

