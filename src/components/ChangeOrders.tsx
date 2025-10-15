// ============================================================================
// HSH GC Platform - Change Orders
// ============================================================================
//
// Track scope changes, cost impacts, and approval status
//

import React, { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Project, ChangeOrder, Trade } from '@/types'
import { getTradesForEstimate, updateProject } from '@/services'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ArrowLeft,
  PlusCircle,
  FileText,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Edit,
  Trash2,
} from 'lucide-react'
import hshLogo from '/HSH Contractor Logo - Color.png'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

interface ChangeOrdersProps {
  project: Project
  onBack: () => void
}

// ----------------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------------

export function ChangeOrders({ project, onBack }: ChangeOrdersProps) {
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([])
  const [showCOForm, setShowCOForm] = useState(false)
  const [editingCO, setEditingCO] = useState<ChangeOrder | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])

  useEffect(() => {
    // Load trades for linking
    const loadedTrades = getTradesForEstimate(project.estimate.id)
    setTrades(loadedTrades)
    
    // Load change orders from project actuals
    if (project.actuals?.changeOrders) {
      setChangeOrders(project.actuals.changeOrders)
    }
  }, [project])

  const handleAddChangeOrder = () => {
    setEditingCO(null)
    setShowCOForm(true)
  }

  const handleEditChangeOrder = (co: ChangeOrder) => {
    setEditingCO(co)
    setShowCOForm(true)
  }

  const handleDeleteChangeOrder = (coId: string) => {
    if (confirm('Delete this change order?')) {
      const updated = changeOrders.filter(co => co.id !== coId)
      setChangeOrders(updated)
      
      // Update project
      updateProject(project.id, {
        actuals: {
          ...project.actuals!,
          changeOrders: updated,
        },
      })
    }
  }

  const handleSaveChangeOrder = (co: ChangeOrder) => {
    let updated: ChangeOrder[]
    
    if (editingCO) {
      // Update existing
      updated = changeOrders.map(item => item.id === co.id ? co : item)
    } else {
      // Add new
      updated = [...changeOrders, co]
    }
    
    setChangeOrders(updated)
    
    // Update project
    updateProject(project.id, {
      actuals: {
        ...project.actuals!,
        changeOrders: updated,
      },
    })
    
    setShowCOForm(false)
    setEditingCO(null)
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const getStatusColor = (status: ChangeOrder['status']) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800 border-green-300'
      case 'rejected': return 'bg-red-100 text-red-800 border-red-300'
      case 'pending-approval': return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'implemented': return 'bg-blue-100 text-blue-800 border-blue-300'
      default: return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getStatusIcon = (status: ChangeOrder['status']) => {
    switch (status) {
      case 'approved': return <CheckCircle className="w-4 h-4" />
      case 'rejected': return <XCircle className="w-4 h-4" />
      case 'pending-approval': return <Clock className="w-4 h-4" />
      case 'implemented': return <CheckCircle className="w-4 h-4" />
      default: return <FileText className="w-4 h-4" />
    }
  }

  const totalCostImpact = changeOrders
    .filter(co => co.status === 'approved' || co.status === 'implemented')
    .reduce((sum, co) => sum + co.costImpact, 0)

  const pendingCount = changeOrders.filter(co => co.status === 'pending-approval').length
  const approvedCount = changeOrders.filter(co => co.status === 'approved' || co.status === 'implemented').length

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <div className="p-2 sm:p-4 lg:p-6">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {/* Header */}
          <ChangeOrdersHeader project={project} onBack={onBack} />

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-white shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Change Orders</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{changeOrders.length}</p>
                  </div>
                  <div className="bg-blue-100 rounded-full p-3">
                    <FileText className="w-8 h-8 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Pending Approval</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{pendingCount}</p>
                  </div>
                  <div className="bg-yellow-100 rounded-full p-3">
                    <Clock className="w-8 h-8 text-yellow-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Approved</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{approvedCount}</p>
                  </div>
                  <div className="bg-green-100 rounded-full p-3">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Cost Impact</p>
                    <p className={`text-2xl font-bold mt-1 ${totalCostImpact >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(Math.abs(totalCostImpact))}
                    </p>
                    <p className="text-xs text-gray-500">{totalCostImpact >= 0 ? 'Added' : 'Saved'}</p>
                  </div>
                  <div className="bg-orange-100 rounded-full p-3">
                    <DollarSign className="w-8 h-8 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Add Change Order Button */}
          <div>
            <Button
              onClick={handleAddChangeOrder}
              className="bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226]"
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              Add Change Order
            </Button>
          </div>

          {/* Change Orders List */}
          <Card>
            <CardHeader>
              <CardTitle>Change Orders</CardTitle>
            </CardHeader>
            <CardContent>
              {changeOrders.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-lg font-medium mb-2">No Change Orders</p>
                  <p>Track scope changes and their impact on budget and schedule</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {changeOrders.map((co) => (
                    <Card key={co.id} className="border-2">
                      <CardContent className="pt-4">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-semibold text-gray-900">{co.title}</h4>
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(co.status)}`}>
                                    {getStatusIcon(co.status)}
                                    {co.status.replace('-', ' ').toUpperCase()}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600">{co.changeOrderNumber}</p>
                              </div>
                            </div>

                            <p className="text-sm text-gray-700 mb-3">{co.description}</p>

                            {co.trades && co.trades.length > 0 && (
                              <div className="mb-3">
                                <p className="text-xs font-semibold text-gray-600 mb-1">Affected Items:</p>
                                <div className="flex flex-wrap gap-1">
                                  {co.trades.map((trade) => (
                                    <span key={trade.id} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                      {trade.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                              <div>
                                <p className="text-gray-600">Requested By</p>
                                <p className="font-medium">{co.requestedBy}</p>
                              </div>
                              <div>
                                <p className="text-gray-600">Date</p>
                                <p className="font-medium">{co.requestDate.toLocaleDateString()}</p>
                              </div>
                              <div>
                                <p className="text-gray-600">Cost Impact</p>
                                <p className={`font-bold ${co.costImpact >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                  {co.costImpact >= 0 ? '+' : ''}{formatCurrency(co.costImpact)}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-600">Schedule Impact</p>
                                <p className={`font-medium ${co.scheduleImpact > 0 ? 'text-red-600' : co.scheduleImpact < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                                  {co.scheduleImpact > 0 ? '+' : ''}{co.scheduleImpact} days
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="flex sm:flex-col gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditChangeOrder(co)}
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteChangeOrder(co.id)}
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Change Order Form Modal */}
      {showCOForm && (
        <ChangeOrderForm
          project={project}
          trades={trades}
          changeOrder={editingCO}
          onSave={handleSaveChangeOrder}
          onCancel={() => {
            setShowCOForm(false)
            setEditingCO(null)
          }}
        />
      )}

      {/* Mobile Back Button */}
      {onBack && (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 shadow-lg z-40">
          <Button onClick={onBack} variant="outline" className="border-gray-300 hover:bg-gray-50 w-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Project Detail
          </Button>
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Header Component
// ----------------------------------------------------------------------------

interface ChangeOrdersHeaderProps {
  project: Project
  onBack?: () => void
}

function ChangeOrdersHeader({ project, onBack }: ChangeOrdersHeaderProps) {
  const getStatusColor = (status: string) => {
    const colors = {
      estimating: 'bg-blue-100 text-blue-800',
      'in-progress': 'bg-orange-100 text-orange-800',
      complete: 'bg-green-100 text-green-800',
    }
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  return (
    <>
      {/* Mobile Header */}
      <header className="sm:hidden bg-white shadow-md border-b border-gray-200">
        <div className="px-4 py-4">
          <div className="flex items-center space-x-3">
            <img src={hshLogo} alt="HSH Contractor" className="h-16 w-auto" />
            <div className="flex-1">
              <div className="flex flex-col gap-2 mb-1">
                <h1 className="text-lg font-bold text-gray-900">Change Orders</h1>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)} w-fit`}>
                  {project.status.replace('-', ' ').toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-gray-600">{project.name}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Desktop Header */}
      <Card className="hidden sm:block bg-gradient-to-br from-gray-50 to-white border border-gray-200 shadow-lg">
        <CardHeader className="pb-3 sm:pb-6">
          <div className="space-y-2 sm:space-y-4">
            <div className="flex items-center justify-center gap-2 sm:gap-4 lg:gap-6">
              <div className="flex-shrink-0">
                <img src={hshLogo} alt="HSH Contractor Logo" className="h-20 sm:h-32 lg:h-40 w-auto" />
              </div>
              <div className="flex-shrink-0">
                <h2 className="text-xl sm:text-4xl lg:text-5xl font-bold text-gray-900">Change Orders</h2>
                <p className="text-sm sm:text-base text-gray-600 mt-1">{project.name}</p>
              </div>
            </div>

            {onBack && (
              <div className="hidden sm:flex justify-center">
                <Button
                  onClick={onBack}
                  variant="outline"
                  size="sm"
                  className="border-gray-300 hover:bg-gray-50 w-full max-w-md text-xs sm:text-sm"
                >
                  <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  Back to Project Detail
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>
    </>
  )
}

// ----------------------------------------------------------------------------
// Change Order Form Component
// ----------------------------------------------------------------------------

interface ChangeOrderFormProps {
  project: Project
  trades: Trade[]
  changeOrder: ChangeOrder | null
  onSave: (co: ChangeOrder) => void
  onCancel: () => void
}

function ChangeOrderForm({ project, trades, changeOrder, onSave, onCancel }: ChangeOrderFormProps) {
  // Generate next CO number
  const existingCOs = project.actuals?.changeOrders || []
  const nextNumber = changeOrder?.changeOrderNumber || `CO-${String(existingCOs.length + 1).padStart(3, '0')}`

  const [formData, setFormData] = useState({
    changeOrderNumber: changeOrder?.changeOrderNumber || nextNumber,
    title: changeOrder?.title || '',
    description: changeOrder?.description || '',
    status: changeOrder?.status || 'draft',
    requestedBy: changeOrder?.requestedBy || '',
    costImpact: changeOrder?.costImpact?.toString() || '0',
    scheduleImpact: changeOrder?.scheduleImpact?.toString() || '0',
    notes: changeOrder?.notes || '',
    affectedTradeIds: changeOrder?.trades?.map(t => t.id) || [] as string[],
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Get the affected trades
    const affectedTrades = trades.filter(t => formData.affectedTradeIds.includes(t.id))

    const co: ChangeOrder = {
      id: changeOrder?.id || uuidv4(),
      projectId: project.id,
      changeOrderNumber: formData.changeOrderNumber,
      title: formData.title,
      description: formData.description,
      status: formData.status as any,
      requestedBy: formData.requestedBy,
      requestDate: changeOrder?.requestDate || new Date(),
      trades: affectedTrades,
      costImpact: parseFloat(formData.costImpact) || 0,
      scheduleImpact: parseInt(formData.scheduleImpact) || 0,
      notes: formData.notes,
      createdAt: changeOrder?.createdAt || new Date(),
      updatedAt: new Date(),
    }

    onSave(co)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>{changeOrder ? 'Edit Change Order' : 'Add Change Order'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="coNumber">Change Order Number *</Label>
                <Input
                  id="coNumber"
                  value={formData.changeOrderNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, changeOrderNumber: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="status">Status *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: any) => setFormData(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="pending-approval">Pending Approval</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="implemented">Implemented</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Add skylight to master bedroom"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description *</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Detailed description of the change"
                required
              />
            </div>

            <div>
              <Label htmlFor="requestedBy">Requested By *</Label>
              <Input
                id="requestedBy"
                value={formData.requestedBy}
                onChange={(e) => setFormData(prev => ({ ...prev, requestedBy: e.target.value }))}
                placeholder="e.g., Client, Architect, Contractor"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="costImpact">Cost Impact ($)</Label>
                <Input
                  id="costImpact"
                  type="number"
                  step="0.01"
                  value={formData.costImpact}
                  onChange={(e) => setFormData(prev => ({ ...prev, costImpact: e.target.value }))}
                  placeholder="Positive = added cost, Negative = savings"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use negative numbers for cost reductions
                </p>
              </div>
              <div>
                <Label htmlFor="scheduleImpact">Schedule Impact (days)</Label>
                <Input
                  id="scheduleImpact"
                  type="number"
                  value={formData.scheduleImpact}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduleImpact: e.target.value }))}
                  placeholder="Positive = delay, Negative = time saved"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use negative numbers for time savings
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="affectedItems">Affected Cost Items (Optional)</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-3">
                {trades.length === 0 ? (
                  <p className="text-sm text-gray-500">No estimate items available</p>
                ) : (
                  trades.map((trade) => (
                    <label key={trade.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                      <input
                        type="checkbox"
                        checked={formData.affectedTradeIds.includes(trade.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData(prev => ({
                              ...prev,
                              affectedTradeIds: [...prev.affectedTradeIds, trade.id]
                            }))
                          } else {
                            setFormData(prev => ({
                              ...prev,
                              affectedTradeIds: prev.affectedTradeIds.filter(id => id !== trade.id)
                            }))
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">
                        {trade.name} - {trade.category}
                      </span>
                    </label>
                  ))
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Select which estimate items are affected by this change order
              </p>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes or comments"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226]"
              >
                {changeOrder ? 'Save Changes' : 'Add Change Order'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

