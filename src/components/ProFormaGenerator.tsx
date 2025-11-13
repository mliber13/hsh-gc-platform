// ============================================================================
// Pro Forma Generator
// ============================================================================
//
// Component for generating construction loan pro forma financial projections
//

import React, { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Project, Trade } from '@/types'
import {
  ProFormaInput,
  ProFormaProjection,
  PaymentMilestone,
} from '@/types/proforma'
import { calculateProForma, generateDefaultMilestones } from '@/services/proformaService'
import { getTradesForEstimate_Hybrid } from '@/services/hybridService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { X, Plus, Trash2, Download, FileText, Calendar, DollarSign } from 'lucide-react'

interface ProFormaGeneratorProps {
  project: Project
  onClose: () => void
}

export function ProFormaGenerator({ project, onClose }: ProFormaGeneratorProps) {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [contractValue, setContractValue] = useState<number>(0)
  const [paymentMilestones, setPaymentMilestones] = useState<PaymentMilestone[]>([])
  const [monthlyOverhead, setMonthlyOverhead] = useState<number>(0)
  const [overheadMethod, setOverheadMethod] = useState<'proportional' | 'flat' | 'none'>('proportional')
  const [projectionMonths, setProjectionMonths] = useState<6 | 12>(12)
  const [startDate, setStartDate] = useState<string>(
    project.startDate 
      ? new Date(project.startDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]
  )
  const [projection, setProjection] = useState<ProFormaProjection | null>(null)

  // Load trades
  useEffect(() => {
    const loadTrades = async () => {
      try {
        const loadedTrades = await getTradesForEstimate_Hybrid(project.estimate.id)
        setTrades(loadedTrades)
        
        // Calculate initial contract value from estimate
        const totalEstimate = loadedTrades.reduce((sum, t) => sum + t.totalCost, 0)
        setContractValue(totalEstimate)
      } catch (error) {
        console.error('Error loading trades:', error)
      } finally {
        setLoading(false)
      }
    }
    loadTrades()
  }, [project])

  // Generate default milestones when contract value or months change
  useEffect(() => {
    if (contractValue > 0 && startDate) {
      const defaults = generateDefaultMilestones(
        contractValue,
        new Date(startDate),
        projectionMonths
      )
      setPaymentMilestones(defaults)
    }
  }, [contractValue, projectionMonths, startDate])

  const handleAddMilestone = () => {
    const newMilestone: PaymentMilestone = {
      id: uuidv4(),
      name: '',
      date: new Date(startDate),
      amount: 0,
      percentComplete: 0,
    }
    setPaymentMilestones([...paymentMilestones, newMilestone])
  }

  const handleRemoveMilestone = (id: string) => {
    setPaymentMilestones(paymentMilestones.filter(m => m.id !== id))
  }

  const handleMilestoneChange = (id: string, field: keyof PaymentMilestone, value: any) => {
    setPaymentMilestones(
      paymentMilestones.map(m =>
        m.id === id ? { ...m, [field]: value } : m
      )
    )
  }

  const handleGenerate = () => {
    if (!contractValue || paymentMilestones.length === 0) {
      alert('Please enter contract value and at least one payment milestone')
      return
    }

    const input: ProFormaInput = {
      projectId: project.id,
      contractValue,
      paymentMilestones,
      monthlyOverhead,
      overheadAllocationMethod: overheadMethod,
      projectionMonths,
      startDate: new Date(startDate),
    }

    const result = calculateProForma(project, trades, input)
    setProjection(result)
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const formatPercent = (value: number) => `${value.toFixed(1)}%`

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-8 text-center">
            <p>Loading project data...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card className="w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl">Pro Forma Generator - {project.name}</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {!projection ? (
            <>
              {/* Input Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="contractValue">Contract Value *</Label>
                  <Input
                    id="contractValue"
                    type="number"
                    step="0.01"
                    value={contractValue}
                    onChange={(e) => setContractValue(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Total estimated cost: {formatCurrency(
                      trades.reduce((sum, t) => sum + t.totalCost, 0)
                    )}
                  </p>
                </div>

                <div>
                  <Label htmlFor="startDate">Project Start Date *</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="projectionMonths">Projection Period *</Label>
                  <Select
                    value={projectionMonths.toString()}
                    onValueChange={(v) => setProjectionMonths(v === '6' ? 6 : 12)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6">6 Months</SelectItem>
                      <SelectItem value="12">12 Months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="monthlyOverhead">Monthly Overhead</Label>
                  <Input
                    id="monthlyOverhead"
                    type="number"
                    step="0.01"
                    value={monthlyOverhead}
                    onChange={(e) => setMonthlyOverhead(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="overheadMethod">Overhead Allocation Method</Label>
                  <Select
                    value={overheadMethod}
                    onValueChange={(v: 'proportional' | 'flat' | 'none') => setOverheadMethod(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="proportional">Proportional (based on monthly costs)</SelectItem>
                      <SelectItem value="flat">Flat Rate (same amount each month)</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Payment Milestones */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Label>Payment Milestones *</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddMilestone}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Milestone
                  </Button>
                </div>
                <div className="space-y-3">
                  {paymentMilestones.map((milestone) => (
                    <div key={milestone.id} className="grid grid-cols-12 gap-2 p-3 border rounded-lg">
                      <div className="col-span-4">
                        <Input
                          placeholder="Milestone name"
                          value={milestone.name}
                          onChange={(e) => handleMilestoneChange(milestone.id, 'name', e.target.value)}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="date"
                          value={new Date(milestone.date).toISOString().split('T')[0]}
                          onChange={(e) => handleMilestoneChange(milestone.id, 'date', new Date(e.target.value))}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Amount"
                          value={milestone.amount}
                          onChange={(e) => handleMilestoneChange(milestone.id, 'amount', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="% Complete"
                          value={milestone.percentComplete}
                          onChange={(e) => handleMilestoneChange(milestone.id, 'percentComplete', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="col-span-2 flex items-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMilestone(milestone.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <Button variant="outline" onClick={onClose} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleGenerate} className="flex-1">
                  Generate Pro Forma
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Projection Results */}
              <div className="space-y-6">
                {/* Summary Card */}
                <Card>
                  <CardHeader>
                    <CardTitle>Financial Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Contract Value</p>
                        <p className="text-lg font-semibold">{formatCurrency(projection.contractValue)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Total Estimated Cost</p>
                        <p className="text-lg font-semibold">{formatCurrency(projection.totalEstimatedCost)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Projected Profit</p>
                        <p className={`text-lg font-semibold ${projection.projectedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(projection.projectedProfit)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Projected Margin</p>
                        <p className={`text-lg font-semibold ${projection.projectedMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatPercent(projection.projectedMargin)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Cash Flow Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Monthly Cash Flow Projection</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">Month</th>
                            <th className="text-right p-2">Inflow</th>
                            <th className="text-right p-2">Labor</th>
                            <th className="text-right p-2">Materials</th>
                            <th className="text-right p-2">Subs</th>
                            <th className="text-right p-2">Overhead</th>
                            <th className="text-right p-2">Total Outflow</th>
                            <th className="text-right p-2">Net Cash Flow</th>
                            <th className="text-right p-2">Cumulative</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projection.monthlyCashFlows.map((month, idx) => (
                            <tr key={idx} className={`border-b ${month.cumulativeBalance < 0 ? 'bg-red-50' : ''}`}>
                              <td className="p-2">{month.monthLabel}</td>
                              <td className="text-right p-2">{formatCurrency(month.totalInflow)}</td>
                              <td className="text-right p-2">{formatCurrency(month.laborCost)}</td>
                              <td className="text-right p-2">{formatCurrency(month.materialCost)}</td>
                              <td className="text-right p-2">{formatCurrency(month.subcontractorCost)}</td>
                              <td className="text-right p-2">{formatCurrency(month.overheadAllocation)}</td>
                              <td className="text-right p-2">{formatCurrency(month.totalOutflow)}</td>
                              <td className={`text-right p-2 font-medium ${month.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCurrency(month.netCashFlow)}
                              </td>
                              <td className={`text-right p-2 font-semibold ${month.cumulativeBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCurrency(month.cumulativeBalance)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Action Buttons */}
                <div className="flex gap-4">
                  <Button variant="outline" onClick={() => setProjection(null)} className="flex-1">
                    Edit Inputs
                  </Button>
                  <Button variant="outline" onClick={() => alert('PDF export coming soon')} className="flex-1">
                    <FileText className="w-4 h-4 mr-2" />
                    Export PDF
                  </Button>
                  <Button variant="outline" onClick={() => alert('Excel export coming soon')} className="flex-1">
                    <Download className="w-4 h-4 mr-2" />
                    Export Excel
                  </Button>
                  <Button onClick={onClose} className="flex-1">
                    Close
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

