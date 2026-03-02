// ============================================================================
// HSH GC Platform - Deal Pipeline Component
// ============================================================================
//
// Component for managing deals in the pipeline before they become projects
//

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import {
  Plus,
  Search,
  Edit,
  Trash2,
  ArrowLeft,
  Building2,
  MapPin,
  DollarSign,
  Calendar,
  User,
  FileText,
  CheckCircle2,
  XCircle,
  PlusCircle,
  ChevronDown,
} from 'lucide-react'
import hshLogo from '/HSH Contractor Logo - Color.png'
import {
  fetchDeals,
  fetchDealById,
  createDeal,
  updateDeal,
  deleteDeal,
  addDealNote,
  deleteDealNote,
  convertDealToProjects,
} from '@/services/dealService'
import type { Deal, DealNote, DealType, DealStatus, CreateDealInput } from '@/types/deal'
import { DealDocuments } from './DealDocuments'

interface DealPipelineProps {
  onBack?: () => void
  onViewProjects?: () => void
}

type ViewMode = 'list' | 'detail' | 'create' | 'edit' | 'convert'

const DEAL_TYPE_LABELS: Record<DealType, string> = {
  'new-single-family': 'New Single Family',
  'mixed-residential': 'Mixed Residential',
  'multifamily': 'Multifamily',
  'residential': 'Residential',
  'commercial': 'Commercial',
  'custom': 'Custom',
}

const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  'early-stage': 'Early Stage',
  'concept-pre-funding': 'Concept/Pre-Funding',
  'very-early': 'Very Early',
  'pending-docs': 'Pending Docs',
  'active-pipeline': 'Active Pipeline',
  'custom': 'Custom',
}

export function DealPipeline({ onBack, onViewProjects }: DealPipelineProps) {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showMobileActions, setShowMobileActions] = useState(false)

  useEffect(() => {
    loadDeals()
  }, [])

  const loadDeals = async () => {
    setLoading(true)
    try {
      const allDeals = await fetchDeals()
      setDeals(allDeals)
    } catch (error) {
      console.error('Error loading deals:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleViewDeal = async (dealId: string) => {
    const deal = await fetchDealById(dealId)
    if (deal) {
      setSelectedDeal(deal)
      setViewMode('detail')
    }
  }

  const handleCreateDeal = () => {
    setSelectedDeal(null)
    setViewMode('create')
  }

  const handleEditDeal = () => {
    setViewMode('edit')
  }

  const handleDeleteDeal = async (dealId: string) => {
    if (!confirm('Are you sure you want to delete this deal? This action cannot be undone.')) {
      return
    }

    const success = await deleteDeal(dealId)
    if (success) {
      await loadDeals()
      if (selectedDeal?.id === dealId) {
        setSelectedDeal(null)
        setViewMode('list')
      }
    } else {
      alert('Failed to delete deal. Please try again.')
    }
  }

  const handleConvertDeal = () => {
    setViewMode('convert')
  }

  // Filter deals
  const filteredDeals = deals.filter(deal => {
    const matchesSearch = 
      deal.deal_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      deal.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      deal.contact?.name?.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || deal.status === statusFilter

    return matchesSearch && matchesStatus
  })

  if (viewMode === 'create' || viewMode === 'edit') {
    return (
      <DealForm
        deal={viewMode === 'edit' ? selectedDeal : null}
        onSave={async (dealData) => {
          if (viewMode === 'edit' && selectedDeal) {
            await updateDeal(selectedDeal.id, dealData)
          } else {
            await createDeal(dealData)
          }
          await loadDeals()
          setViewMode('list')
          setSelectedDeal(null)
        }}
        onCancel={() => {
          setViewMode(selectedDeal ? 'detail' : 'list')
        }}
      />
    )
  }

  if (viewMode === 'convert' && selectedDeal) {
    return (
      <ConvertDealDialog
        deal={selectedDeal}
        onConvert={async (input) => {
          const result = await convertDealToProjects(input)
          if (result.success) {
            alert(`Successfully created ${result.projectIds.length} project(s)!`)
            await loadDeals()
            setViewMode('detail')
            if (onViewProjects) {
              onViewProjects()
            }
          } else {
            alert(`Failed to convert deal: ${result.error || 'Unknown error'}`)
          }
        }}
        onCancel={() => setViewMode('detail')}
      />
    )
  }

  if (viewMode === 'detail' && selectedDeal) {
    return (
      <DealDetailView
        deal={selectedDeal}
        onBack={() => {
          setViewMode('list')
          setSelectedDeal(null)
        }}
        onEdit={handleEditDeal}
        onDelete={async () => {
          await handleDeleteDeal(selectedDeal.id)
        }}
        onConvert={handleConvertDeal}
        onRefresh={async () => {
          const updated = await fetchDealById(selectedDeal.id)
          if (updated) {
            setSelectedDeal(updated)
          }
        }}
      />
    )
  }

  // Deal status accent (align with dashboard palette: blue, orange, green, gray)
  const getDealStatusAccent = (status: string): string => {
    const colors: Record<string, string> = {
      'active-pipeline': '#15803D',
      'pending-docs': '#D95C00',
      'early-stage': '#0E79C9',
      'very-early': '#0E79C9',
      'concept-pre-funding': '#0E79C9',
      custom: '#9ca3af',
    }
    return colors[status] ?? '#9ca3af'
  }

  // List view
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Slim app bar - match Projects Dashboard */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <img src={hshLogo} alt="HSH Contractor" className="h-16 sm:h-20 lg:h-24 w-auto shrink-0" />
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-gray-900 truncate">Deal Pipeline</h1>
                <p className="text-xs text-gray-500 hidden sm:block">
                  {deals.length} {deals.length === 1 ? 'deal' : 'deals'}
                </p>
              </div>
            </div>
            <nav className="hidden sm:flex items-center gap-1 shrink-0">
              {onBack && (
                <Button variant="outline" onClick={onBack} size="sm">
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  Back
                </Button>
              )}
              <Button onClick={handleCreateDeal} size="sm" className="bg-[#0E79C9] hover:bg-[#0A5A96] text-white">
                <PlusCircle className="w-4 h-4 mr-1.5" />
                New Deal
              </Button>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 sm:pb-8">
        {/* Search + filters toolbar - match Projects Dashboard */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search by name, location, or contact..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 text-base bg-white border-gray-200"
            />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] h-10 bg-white border-gray-200">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(DEAL_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Deals List - single Card like Projects Dashboard */}
        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center justify-between text-lg">
              <span>Your Deals</span>
              <span className="text-sm font-normal text-gray-500">
                {filteredDeals.length} {filteredDeals.length === 1 ? 'deal' : 'deals'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading && deals.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-[#0E79C9]"></div>
                <p className="mt-4 text-gray-500 text-sm">Loading deals...</p>
              </div>
            ) : filteredDeals.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-14 h-14 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-700 font-medium mb-1">
                  {searchQuery || statusFilter !== 'all' ? 'No deals found' : 'No deals yet'}
                </p>
                <p className="text-gray-500 text-sm mb-6">
                  {searchQuery || statusFilter !== 'all' ? 'Try adjusting your search or filters' : 'Create your first deal to get started'}
                </p>
                {!searchQuery && statusFilter === 'all' && (
                  <Button onClick={handleCreateDeal} size="sm" className="bg-[#0E79C9] hover:bg-[#0A5A96]">
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Create Deal
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredDeals.map((deal) => (
                  <div
                    key={deal.id}
                    onClick={() => handleViewDeal(deal.id)}
                    className="flex rounded-lg overflow-hidden hover:bg-gray-50/80 transition-colors cursor-pointer -mx-1 border-t"
                    style={{ borderTopColor: getDealStatusAccent(deal.status) }}
                  >
                    <div
                      className="shrink-0 w-1.5 rounded-l-md"
                      style={{ backgroundColor: getDealStatusAccent(deal.status) }}
                      aria-hidden
                    />
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-4 sm:py-5 flex-1 min-w-0 px-3 sm:px-4 rounded-r-lg text-center sm:text-left">
                      <div className="flex-1 min-w-0 sm:max-w-[320px]">
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-0.5">
                          <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{deal.deal_name}</h3>
                          {deal.converted_to_projects ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800" title="Converted to projects">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Converted
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 border-l-4 border-transparent" style={{ borderLeftColor: getDealStatusAccent(deal.status) }}>
                              {deal.custom_status || DEAL_STATUS_LABELS[deal.status]}
                            </span>
                          )}
                        </div>
                        <p className="text-sm sm:text-base text-gray-500 truncate flex items-center justify-center sm:justify-start gap-1">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          {deal.location}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                          {deal.custom_type || DEAL_TYPE_LABELS[deal.type]}
                          {deal.projected_cost != null && ` · ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(deal.projected_cost)}`}
                          {deal.contact?.name && ` · ${deal.contact.name}`}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0 sm:min-w-[24px]" aria-hidden />
                      <div className="flex items-center justify-center sm:justify-end gap-4 sm:gap-6 shrink-0">
                        <div className="text-center sm:w-[100px]">
                          <p className="text-xs text-gray-500">Type</p>
                          <p className="text-sm font-medium text-gray-900 truncate">{deal.custom_type || DEAL_TYPE_LABELS[deal.type]}</p>
                        </div>
                        {deal.projected_cost != null && (
                          <div className="text-center sm:w-[100px]">
                            <p className="text-xs text-gray-500">Projected</p>
                            <p className="text-sm font-semibold text-sky-700 tabular-nums">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(deal.projected_cost)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mobile: bottom action bar - match Projects Dashboard */}
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 safe-area-pb">
          {showMobileActions && (
            <div className="border-b border-gray-100 px-3 py-2 bg-gray-50 max-h-72 overflow-y-auto">
              {onBack && (
                <button
                  onClick={() => { onBack(); setShowMobileActions(false) }}
                  className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 hover:bg-white text-gray-700"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-400" />
                  <span className="font-medium">Back to Projects</span>
                </button>
              )}
              <button
                onClick={() => { handleCreateDeal(); setShowMobileActions(false) }}
                className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 hover:bg-white border border-[#0E79C9]/20 bg-[#0E79C9]/5"
              >
                <PlusCircle className="w-5 h-5 text-[#0E79C9]" />
                <div>
                  <p className="font-medium text-gray-900">New Deal</p>
                  <p className="text-xs text-gray-500">Add a deal to the pipeline</p>
                </div>
              </button>
            </div>
          )}
          <div className="p-2">
            <Button
              onClick={() => setShowMobileActions(!showMobileActions)}
              variant="outline"
              className="w-full h-11 border-gray-200 bg-white hover:bg-gray-50"
            >
              <span className="flex items-center justify-center gap-2 text-gray-700">
                Actions
                <ChevronDown className={`w-4 h-4 transition-transform ${showMobileActions ? 'rotate-180' : ''}`} />
              </span>
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}

// ============================================================================
// Deal Form Component
// ============================================================================

interface DealFormProps {
  deal: Deal | null
  onSave: (data: CreateDealInput) => Promise<void>
  onCancel: () => void
}

function DealForm({ deal, onSave, onCancel }: DealFormProps) {
  const [formData, setFormData] = useState<CreateDealInput>({
    deal_name: deal?.deal_name || '',
    location: deal?.location || '',
    unit_count: deal?.unit_count,
    type: deal?.type || 'residential',
    custom_type: deal?.custom_type,
    projected_cost: deal?.projected_cost,
    estimated_duration_months: deal?.estimated_duration_months,
    expected_start_date: deal?.expected_start_date?.split('T')[0] || '',
    status: deal?.status || 'early-stage',
    custom_status: deal?.custom_status,
    contact: deal?.contact || undefined,
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(formData)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onCancel}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">
          {deal ? 'Edit Deal' : 'New Deal'}
        </h1>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Deal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="deal_name">Deal Name *</Label>
                <Input
                  id="deal_name"
                  value={formData.deal_name}
                  onChange={(e) => setFormData({ ...formData, deal_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="location">Location *</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="type">Type *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value as DealType, custom_type: value === 'custom' ? formData.custom_type : undefined })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DEAL_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formData.type === 'custom' && (
                <div>
                  <Label htmlFor="custom_type">Custom Type *</Label>
                  <Input
                    id="custom_type"
                    value={formData.custom_type || ''}
                    onChange={(e) => setFormData({ ...formData, custom_type: e.target.value })}
                    required={formData.type === 'custom'}
                  />
                </div>
              )}
              <div>
                <Label htmlFor="unit_count">Unit Count</Label>
                <Input
                  id="unit_count"
                  type="number"
                  min="0"
                  value={formData.unit_count || ''}
                  onChange={(e) => setFormData({ ...formData, unit_count: e.target.value ? parseInt(e.target.value) : undefined })}
                />
              </div>
              <div>
                <Label htmlFor="status">Status *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value as DealStatus, custom_status: value === 'custom' ? formData.custom_status : undefined })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DEAL_STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formData.status === 'custom' && (
                <div>
                  <Label htmlFor="custom_status">Custom Status *</Label>
                  <Input
                    id="custom_status"
                    value={formData.custom_status || ''}
                    onChange={(e) => setFormData({ ...formData, custom_status: e.target.value })}
                    required={formData.status === 'custom'}
                  />
                </div>
              )}
              <div>
                <Label htmlFor="projected_cost">Projected Cost</Label>
                <Input
                  id="projected_cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.projected_cost || ''}
                  onChange={(e) => setFormData({ ...formData, projected_cost: e.target.value ? parseFloat(e.target.value) : undefined })}
                />
              </div>
              <div>
                <Label htmlFor="estimated_duration_months">Estimated Duration (months)</Label>
                <Input
                  id="estimated_duration_months"
                  type="number"
                  min="0"
                  value={formData.estimated_duration_months || ''}
                  onChange={(e) => setFormData({ ...formData, estimated_duration_months: e.target.value ? parseInt(e.target.value) : undefined })}
                />
              </div>
              <div>
                <Label htmlFor="expected_start_date">Expected Start Date</Label>
                <Input
                  id="expected_start_date"
                  type="date"
                  value={formData.expected_start_date}
                  onChange={(e) => setFormData({ ...formData, expected_start_date: e.target.value || undefined })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contact_name">Contact Name</Label>
                <Input
                  id="contact_name"
                  value={formData.contact?.name || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    contact: { ...(formData.contact || {}), name: e.target.value },
                  })}
                />
              </div>
              <div>
                <Label htmlFor="contact_email">Email</Label>
                <Input
                  id="contact_email"
                  type="email"
                  value={formData.contact?.email || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    contact: { ...(formData.contact || {}), email: e.target.value },
                  })}
                />
              </div>
              <div>
                <Label htmlFor="contact_phone">Phone</Label>
                <Input
                  id="contact_phone"
                  type="tel"
                  value={formData.contact?.phone || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    contact: { ...(formData.contact || {}), phone: e.target.value },
                  })}
                />
              </div>
              <div>
                <Label htmlFor="contact_company">Company</Label>
                <Input
                  id="contact_company"
                  value={formData.contact?.company || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    contact: { ...(formData.contact || {}), company: e.target.value },
                  })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Deal'}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ============================================================================
// Deal Detail View Component
// ============================================================================

interface DealDetailViewProps {
  deal: Deal
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  onConvert: () => void
  onRefresh: () => Promise<void>
}

function DealDetailView({
  deal,
  onBack,
  onEdit,
  onDelete,
  onConvert,
  onRefresh,
}: DealDetailViewProps) {
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  const handleAddNote = async () => {
    if (!newNote.trim()) return

    setAddingNote(true)
    try {
      await addDealNote(deal.id, newNote.trim())
      setNewNote('')
      await onRefresh()
    } catch (error) {
      console.error('Error adding note:', error)
      alert('Failed to add note. Please try again.')
    } finally {
      setAddingNote(false)
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Delete this note?')) return

    const success = await deleteDealNote(noteId)
    if (success) {
      await onRefresh()
    } else {
      alert('Failed to delete note. Please try again.')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 sm:pb-8">
      {/* Slim app bar - match Projects Dashboard */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <img src={hshLogo} alt="HSH Contractor" className="h-16 sm:h-20 lg:h-24 w-auto shrink-0" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold text-gray-900 truncate">{deal.deal_name}</h1>
                  <span className={`px-2.5 py-0.5 rounded text-xs font-medium ${
                    deal.status === 'active-pipeline' ? 'bg-green-100 text-green-800' :
                    deal.status === 'pending-docs' ? 'bg-yellow-100 text-yellow-800' :
                    deal.status === 'early-stage' || deal.status === 'very-early' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  } shrink-0`}>
                    {deal.custom_status || DEAL_STATUS_LABELS[deal.status]}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 truncate">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  {deal.location}
                </p>
              </div>
            </div>
            <nav className="hidden sm:flex items-center gap-1 shrink-0">
              {onBack && (
                <Button variant="outline" onClick={onBack} size="sm">
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  Back
                </Button>
              )}
              {!deal.converted_to_projects && (
                <Button onClick={onConvert} size="sm" className="bg-[#15803D] hover:bg-[#166534] text-white">
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Convert to Projects
                </Button>
              )}
              <Button variant="outline" onClick={onEdit} size="sm">
                <Edit className="w-4 h-4 mr-1.5" />
                Edit
              </Button>
              <Button variant="outline" onClick={onDelete} size="sm">
                <Trash2 className="w-4 h-4 mr-1.5" />
                Delete
              </Button>
            </nav>
          </div>
          {/* Mobile: action row */}
          <div className="sm:hidden mt-3 flex flex-wrap gap-2">
            {onBack && (
              <Button variant="outline" onClick={onBack} size="sm" className="flex-1 min-w-0">
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Back
              </Button>
            )}
            {!deal.converted_to_projects && (
              <Button onClick={onConvert} size="sm" className="flex-1 min-w-0 bg-[#15803D] hover:bg-[#166534] text-white">
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Convert
              </Button>
            )}
            <Button variant="outline" onClick={onEdit} size="sm" className="flex-1 min-w-0">
              <Edit className="w-4 h-4 mr-1.5" />
              Edit
            </Button>
            <Button variant="outline" onClick={onDelete} size="sm" className="flex-1 min-w-0">
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Deal Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Deal Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-gray-500">Type</Label>
              <p className="font-medium">{deal.custom_type || DEAL_TYPE_LABELS[deal.type]}</p>
            </div>
            <div>
              <Label className="text-gray-500">Status</Label>
              <p className="font-medium">{deal.custom_status || DEAL_STATUS_LABELS[deal.status]}</p>
            </div>
            {deal.unit_count && (
              <div>
                <Label className="text-gray-500">Unit Count</Label>
                <p className="font-medium">{deal.unit_count}</p>
              </div>
            )}
            {deal.projected_cost && (
              <div>
                <Label className="text-gray-500">Projected Cost</Label>
                <p className="font-medium">${deal.projected_cost.toLocaleString()}</p>
              </div>
            )}
            {deal.estimated_duration_months && (
              <div>
                <Label className="text-gray-500">Estimated Duration</Label>
                <p className="font-medium">{deal.estimated_duration_months} months</p>
              </div>
            )}
            {deal.expected_start_date && (
              <div>
                <Label className="text-gray-500">Expected Start Date</Label>
                <p className="font-medium">{formatDate(deal.expected_start_date)}</p>
              </div>
            )}
            {deal.converted_to_projects && deal.converted_at && (
              <div>
                <Label className="text-gray-500">Converted to Projects</Label>
                <p className="font-medium text-green-600">{formatDate(deal.converted_at)}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {deal.contact && (
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {deal.contact.name && (
                <div>
                  <Label className="text-gray-500">Name</Label>
                  <p className="font-medium">{deal.contact.name}</p>
                </div>
              )}
              {deal.contact.email && (
                <div>
                  <Label className="text-gray-500">Email</Label>
                  <p className="font-medium">{deal.contact.email}</p>
                </div>
              )}
              {deal.contact.phone && (
                <div>
                  <Label className="text-gray-500">Phone</Label>
                  <p className="font-medium">{deal.contact.phone}</p>
                </div>
              )}
              {deal.contact.company && (
                <div>
                  <Label className="text-gray-500">Company</Label>
                  <p className="font-medium">{deal.contact.company}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Notes Log */}
      <Card>
        <CardHeader>
          <CardTitle>Notes Log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Note */}
          <div className="space-y-2">
            <Label htmlFor="new_note">Add Note</Label>
            <div className="flex gap-2">
              <Textarea
                id="new_note"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Enter a note about this deal..."
                rows={3}
                className="flex-1"
              />
              <Button onClick={handleAddNote} disabled={!newNote.trim() || addingNote}>
                <PlusCircle className="w-4 h-4 mr-2" />
                {addingNote ? 'Adding...' : 'Add'}
              </Button>
            </div>
          </div>

          {/* Notes List */}
          {deal.notes && deal.notes.length > 0 ? (
            <div className="space-y-3">
              {deal.notes.map((note) => (
                <div
                  key={note.id}
                  className="border rounded-lg p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{note.note_text}</p>
                      <p className="text-xs text-gray-500 mt-2">{formatDate(note.created_at)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteNote(note.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No notes yet. Add your first note above.</p>
          )}
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardContent className="pt-6">
          <DealDocuments dealId={deal.id} />
        </CardContent>
      </Card>
      </main>
    </div>
  )
}

// ============================================================================
// Convert Deal Dialog Component
// ============================================================================

interface ConvertDealDialogProps {
  deal: Deal
  onConvert: (input: { dealId: string; projectCount: number; namingPattern?: string; startDateOffset?: number }) => Promise<void>
  onCancel: () => void
}

function ConvertDealDialog({ deal, onConvert, onCancel }: ConvertDealDialogProps) {
  const [projectCount, setProjectCount] = useState(deal.unit_count || 1)
  const [namingPattern, setNamingPattern] = useState('{Deal Name} - Unit {#}')
  const [startDateOffset, setStartDateOffset] = useState(0)
  const [converting, setConverting] = useState(false)

  // Determine if this is a multi-project deal
  const isMultiProject = deal.type === 'new-single-family' || (deal.unit_count && deal.unit_count > 1)

  const handleConvert = async () => {
    if (projectCount < 1) {
      alert('Project count must be at least 1')
      return
    }

    setConverting(true)
    try {
      await onConvert({
        dealId: deal.id,
        projectCount,
        namingPattern: isMultiProject ? namingPattern : undefined,
        startDateOffset: isMultiProject ? startDateOffset : undefined,
      })
    } finally {
      setConverting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onCancel}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Convert Deal to Projects</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conversion Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-gray-500">Deal</Label>
            <p className="font-medium text-lg">{deal.deal_name}</p>
          </div>

          {isMultiProject ? (
            <>
              <div>
                <Label htmlFor="project_count">Number of Projects to Create *</Label>
                <Input
                  id="project_count"
                  type="number"
                  min="1"
                  value={projectCount}
                  onChange={(e) => setProjectCount(parseInt(e.target.value) || 1)}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  This deal will create {projectCount} separate project{projectCount !== 1 ? 's' : ''}
                </p>
              </div>

              <div>
                <Label htmlFor="naming_pattern">Project Naming Pattern *</Label>
                <Input
                  id="naming_pattern"
                  value={namingPattern}
                  onChange={(e) => setNamingPattern(e.target.value)}
                  placeholder="{Deal Name} - Unit {#}"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use {'{Deal Name}'} for the deal name and {'{#}'} for the unit/lot number
                </p>
              </div>

              <div>
                <Label htmlFor="start_date_offset">Start Date Offset (days)</Label>
                <Input
                  id="start_date_offset"
                  type="number"
                  min="0"
                  value={startDateOffset}
                  onChange={(e) => setStartDateOffset(parseInt(e.target.value) || 0)}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Days to offset each project's start date from the previous one (0 = all start on same date)
                </p>
              </div>
            </>
          ) : (
            <div>
              <p className="text-gray-600">
                This deal will be converted to a single project: <strong>{deal.deal_name}</strong>
              </p>
            </div>
          )}

          <div className="pt-4 border-t">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                <strong>Note:</strong> Once converted, this deal will be marked as converted and cannot be converted again.
                All deal information will be transferred to the project(s).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleConvert} disabled={converting}>
          {converting ? 'Converting...' : 'Convert to Projects'}
        </Button>
      </div>
    </div>
  )
}

