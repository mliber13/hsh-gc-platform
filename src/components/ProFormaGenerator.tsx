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
  RentalUnit,
  OperatingExpenses,
  DebtService,
} from '@/types/proforma'
import { calculateProForma, generateDefaultMilestones } from '@/services/proformaService'
import { getTradesForEstimate_Hybrid } from '@/services/hybridService'
import { exportProFormaToPDF, exportProFormaToExcel } from '@/services/proformaExportService'
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
  const [projectionMonths, setProjectionMonths] = useState<6 | 12 | 24 | 36 | 60>(12)
  const [startDate, setStartDate] = useState<string>(
    project.startDate 
      ? new Date(project.startDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]
  )
  const [projection, setProjection] = useState<ProFormaProjection | null>(null)
  
  // Rental income
  const [includeRentalIncome, setIncludeRentalIncome] = useState<boolean>(false)
  const [rentalUnits, setRentalUnits] = useState<RentalUnit[]>([])
  
  // Operating expenses
  const [includeOperatingExpenses, setIncludeOperatingExpenses] = useState<boolean>(false)
  const [operatingExpenses, setOperatingExpenses] = useState<OperatingExpenses>({
    propertyManagementPercent: 0,
    monthlyMaintenanceReserve: 0,
    monthlyPropertyInsurance: 0,
    monthlyPropertyTax: 0,
    monthlyUtilities: 0,
    monthlyOther: 0,
  })
  
  // Debt service
  const [includeDebtService, setIncludeDebtService] = useState<boolean>(false)
  const [debtService, setDebtService] = useState<DebtService>({
    loanAmount: 0,
    interestRate: 0,
    loanTermMonths: 360, // 30 years default
    startDate: new Date(),
    paymentType: 'principal-interest',
  })
  
  // Construction completion
  const [constructionCompletionDate, setConstructionCompletionDate] = useState<string>('')
  
  // Total project square footage
  const [totalProjectSquareFootage, setTotalProjectSquareFootage] = useState<number>(
    project.specs?.totalSquareFootage || project.specs?.livingSquareFootage || 0
  )
  
  // Track if we've loaded saved data (to prevent overwriting with defaults)
  const [hasLoadedSavedData, setHasLoadedSavedData] = useState<boolean>(false)

  // Storage key for this project's pro forma inputs
  const storageKey = `hsh_gc_proforma_${project.id}`

  // Interface for saved pro forma inputs (serialized to JSON)
  interface SavedProFormaInputsSerialized {
    contractValue: number
    paymentMilestones: Array<Omit<PaymentMilestone, 'date'> & { date: string }>
    monthlyOverhead: number
    overheadMethod: 'proportional' | 'flat' | 'none'
    projectionMonths: 6 | 12 | 24 | 36 | 60
    startDate: string
    totalProjectSquareFootage?: number
    includeRentalIncome: boolean
    rentalUnits: Array<Omit<RentalUnit, 'occupancyStartDate'> & { occupancyStartDate?: string }>
    includeOperatingExpenses: boolean
    operatingExpenses: OperatingExpenses
    includeDebtService: boolean
    debtService: Omit<DebtService, 'startDate'> & { startDate: string }
    constructionCompletionDate: string
  }

  // Interface for loaded pro forma inputs (deserialized with Date objects)
  interface SavedProFormaInputs {
    contractValue: number
    paymentMilestones: PaymentMilestone[]
    monthlyOverhead: number
    overheadMethod: 'proportional' | 'flat' | 'none'
    projectionMonths: 6 | 12 | 24 | 36 | 60
    startDate: string
    totalProjectSquareFootage?: number
    includeRentalIncome: boolean
    rentalUnits: RentalUnit[]
    includeOperatingExpenses: boolean
    operatingExpenses: OperatingExpenses
    includeDebtService: boolean
    debtService: DebtService
    constructionCompletionDate: string
  }

  // Save pro forma inputs to localStorage
  const saveProFormaInputs = () => {
    try {
      const savedInputs: SavedProFormaInputsSerialized = {
        contractValue,
        paymentMilestones: paymentMilestones.map(m => ({
          ...m,
          date: m.date instanceof Date ? m.date.toISOString() : (m.date as any).toISOString(),
        })),
        monthlyOverhead,
        overheadMethod,
        projectionMonths,
        startDate,
        totalProjectSquareFootage,
        includeRentalIncome,
        rentalUnits: rentalUnits.map(u => ({
          ...u,
          occupancyStartDate: u.occupancyStartDate instanceof Date 
            ? u.occupancyStartDate.toISOString() 
            : u.occupancyStartDate,
        })),
        includeOperatingExpenses,
        operatingExpenses,
        includeDebtService,
        debtService: {
          ...debtService,
          startDate: debtService.startDate instanceof Date
            ? debtService.startDate.toISOString()
            : (debtService.startDate as any).toISOString(),
        },
        constructionCompletionDate,
      }
      localStorage.setItem(storageKey, JSON.stringify(savedInputs))
    } catch (error) {
      console.error('Error saving pro forma inputs:', error)
    }
  }

  // Load saved pro forma inputs from localStorage
  const loadProFormaInputs = (): SavedProFormaInputs | null => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved) as SavedProFormaInputsSerialized
        // Convert date strings back to Date objects
        const loaded: SavedProFormaInputs = {
          ...parsed,
          paymentMilestones: parsed.paymentMilestones.map(m => ({
            ...m,
            date: new Date(m.date),
          })),
          rentalUnits: parsed.rentalUnits.map(u => ({
            ...u,
            occupancyStartDate: u.occupancyStartDate 
              ? new Date(u.occupancyStartDate)
              : undefined,
          })),
          debtService: {
            ...parsed.debtService,
            startDate: new Date(parsed.debtService.startDate),
          },
        }
        return loaded
      }
    } catch (error) {
      console.error('Error loading pro forma inputs:', error)
    }
    return null
  }

  // Load trades and saved inputs
  useEffect(() => {
    const loadTrades = async () => {
      try {
        const loadedTrades = await getTradesForEstimate_Hybrid(project.estimate.id)
        setTrades(loadedTrades)
        
        // Try to load saved pro forma inputs first
        const savedInputs = loadProFormaInputs()
        
        if (savedInputs) {
          // Restore saved inputs
          setContractValue(savedInputs.contractValue)
          setPaymentMilestones(savedInputs.paymentMilestones)
          setMonthlyOverhead(savedInputs.monthlyOverhead)
          setOverheadMethod(savedInputs.overheadMethod)
          setProjectionMonths(savedInputs.projectionMonths)
          setStartDate(savedInputs.startDate)
          setIncludeRentalIncome(savedInputs.includeRentalIncome)
          setRentalUnits(savedInputs.rentalUnits)
          setIncludeOperatingExpenses(savedInputs.includeOperatingExpenses)
          setOperatingExpenses(savedInputs.operatingExpenses)
          setIncludeDebtService(savedInputs.includeDebtService)
          setDebtService(savedInputs.debtService)
          setConstructionCompletionDate(savedInputs.constructionCompletionDate)
          setTotalProjectSquareFootage(savedInputs.totalProjectSquareFootage || 0)
          setHasLoadedSavedData(true) // Mark that we've loaded saved data
        } else {
          // No saved inputs, use defaults
          // Calculate initial contract value from estimate
          const totalEstimate = loadedTrades.reduce((sum, t) => sum + t.totalCost, 0)
          setContractValue(totalEstimate)
        }
      } catch (error) {
        console.error('Error loading trades:', error)
        // Fallback to default contract value
        const loadedTrades = await getTradesForEstimate_Hybrid(project.estimate.id)
        const totalEstimate = loadedTrades.reduce((sum, t) => sum + t.totalCost, 0)
        setContractValue(totalEstimate)
      } finally {
        setLoading(false)
      }
    }
    loadTrades()
  }, [project])

  // Generate default milestones when contract value or months change
  // Only if milestones are empty AND we haven't loaded saved data
  useEffect(() => {
    if (contractValue > 0 && startDate && paymentMilestones.length === 0 && !hasLoadedSavedData) {
      const defaults = generateDefaultMilestones(
        contractValue,
        new Date(startDate),
        projectionMonths
      )
      setPaymentMilestones(defaults)
    }
  }, [contractValue, projectionMonths, startDate, hasLoadedSavedData, paymentMilestones.length])

  // Save inputs to localStorage whenever they change (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveProFormaInputs()
    }, 500) // Debounce by 500ms to avoid excessive writes

    return () => clearTimeout(timeoutId)
  }, [
    contractValue,
    paymentMilestones,
    monthlyOverhead,
    overheadMethod,
    projectionMonths,
    startDate,
    includeRentalIncome,
    rentalUnits,
    includeOperatingExpenses,
    operatingExpenses,
    includeDebtService,
    debtService,
    constructionCompletionDate,
    totalProjectSquareFootage,
  ])

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

  const handleAddRentalUnit = () => {
    const newUnit: RentalUnit = {
      id: uuidv4(),
      name: '',
      unitType: 'residential',
      rentType: 'fixed',
      monthlyRent: 0,
      occupancyRate: 100,
    }
    setRentalUnits([...rentalUnits, newUnit])
  }

  const handleRemoveRentalUnit = (id: string) => {
    setRentalUnits(rentalUnits.filter(u => u.id !== id))
  }

  const handleRentalUnitChange = (id: string, field: keyof RentalUnit, value: any) => {
    setRentalUnits(
      rentalUnits.map(u =>
        u.id === id ? { ...u, [field]: value } : u
      )
    )
  }

  const handleGenerate = () => {
    if (!contractValue || paymentMilestones.length === 0) {
      alert('Please enter contract value and at least one payment milestone')
      return
    }

    if (includeRentalIncome && rentalUnits.length === 0) {
      alert('Please add at least one rental unit if rental income is enabled')
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
      totalProjectSquareFootage: totalProjectSquareFootage > 0 ? totalProjectSquareFootage : undefined,
      rentalUnits,
      includeRentalIncome,
      operatingExpenses,
      includeOperatingExpenses,
      debtService: {
        ...debtService,
        startDate: debtService.startDate || new Date(startDate),
      },
      includeDebtService,
      constructionCompletionDate: constructionCompletionDate 
        ? new Date(constructionCompletionDate)
        : undefined,
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
                    onValueChange={(v) => setProjectionMonths(parseInt(v) as 6 | 12 | 24 | 36 | 60)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6">6 Months</SelectItem>
                      <SelectItem value="12">12 Months</SelectItem>
                      <SelectItem value="24">24 Months (2 Years)</SelectItem>
                      <SelectItem value="36">36 Months (3 Years)</SelectItem>
                      <SelectItem value="60">60 Months (5 Years)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="constructionCompletionDate">Construction Completion Date</Label>
                  <Input
                    id="constructionCompletionDate"
                    type="date"
                    value={constructionCompletionDate}
                    onChange={(e) => setConstructionCompletionDate(e.target.value)}
                    placeholder="Optional - defaults to 80% of projection period"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    When construction ends and rental income begins (if applicable)
                  </p>
                </div>

                <div>
                  <Label htmlFor="totalProjectSquareFootage">Total Project Square Footage</Label>
                  <Input
                    id="totalProjectSquareFootage"
                    type="number"
                    step="0.01"
                    value={totalProjectSquareFootage}
                    onChange={(e) => setTotalProjectSquareFootage(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Total square footage of the project (auto-filled from project specs if available)
                  </p>
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

              {/* Rental Income Section */}
              <div className="border-t pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="includeRentalIncome"
                      checked={includeRentalIncome}
                      onChange={(e) => setIncludeRentalIncome(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="includeRentalIncome" className="text-lg font-semibold cursor-pointer">
                      Rental Income
                    </Label>
                  </div>
                  {includeRentalIncome && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddRentalUnit}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Unit
                    </Button>
                  )}
                </div>
                
                {includeRentalIncome && (
                  <div className="space-y-3">
                    {rentalUnits.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">
                        No rental units added. Click "Add Unit" to start.
                      </p>
                    ) : (
                      rentalUnits.map((unit) => (
                        <div key={unit.id} className="grid grid-cols-12 gap-2 p-4 border rounded-lg bg-gray-50">
                          <div className="col-span-12 md:col-span-3">
                            <Label className="text-xs">Unit Name *</Label>
                            <Input
                              placeholder="e.g., First Floor Store, Unit 2A"
                              value={unit.name}
                              onChange={(e) => handleRentalUnitChange(unit.id, 'name', e.target.value)}
                            />
                          </div>
                          <div className="col-span-6 md:col-span-2">
                            <Label className="text-xs">Rent Type *</Label>
                            <Select
                              value={unit.rentType}
                              onValueChange={(v: 'fixed' | 'perSqft') => handleRentalUnitChange(unit.id, 'rentType', v)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="fixed">Fixed Monthly</SelectItem>
                                <SelectItem value="perSqft">Per Sqft</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          {unit.rentType === 'fixed' ? (
                            <>
                              <div className="col-span-6 md:col-span-2">
                                <Label className="text-xs">Monthly Rent *</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="750.00"
                                  value={unit.monthlyRent || ''}
                                  onChange={(e) => handleRentalUnitChange(unit.id, 'monthlyRent', parseFloat(e.target.value) || 0)}
                                />
                              </div>
                              <div className="col-span-6 md:col-span-2">
                                <Label className="text-xs">Square Feet (Optional)</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="1000"
                                  value={unit.squareFootage || ''}
                                  onChange={(e) => handleRentalUnitChange(unit.id, 'squareFootage', parseFloat(e.target.value) || 0)}
                                />
                              </div>
                              <div className="col-span-6 md:col-span-2">
                                <Label className="text-xs">Occupancy Rate (%)</Label>
                                <Input
                                  type="number"
                                  step="0.1"
                                  placeholder="100"
                                  value={unit.occupancyRate}
                                  onChange={(e) => handleRentalUnitChange(unit.id, 'occupancyRate', parseFloat(e.target.value) || 0)}
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="col-span-6 md:col-span-2">
                                <Label className="text-xs">Square Feet *</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="1000"
                                  value={unit.squareFootage || ''}
                                  onChange={(e) => handleRentalUnitChange(unit.id, 'squareFootage', parseFloat(e.target.value) || 0)}
                                />
                              </div>
                              <div className="col-span-6 md:col-span-2">
                                <Label className="text-xs">Rent Per Sqft/Month *</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="10.00"
                                  value={unit.rentPerSqft || ''}
                                  onChange={(e) => handleRentalUnitChange(unit.id, 'rentPerSqft', parseFloat(e.target.value) || 0)}
                                />
                              </div>
                              <div className="col-span-6 md:col-span-2">
                                <Label className="text-xs">Occupancy Rate (%)</Label>
                                <Input
                                  type="number"
                                  step="0.1"
                                  placeholder="100"
                                  value={unit.occupancyRate}
                                  onChange={(e) => handleRentalUnitChange(unit.id, 'occupancyRate', parseFloat(e.target.value) || 0)}
                                />
                              </div>
                            </>
                          )}
                          
                          <div className="col-span-6 md:col-span-2 flex items-end">
                            <div className="w-full">
                              <Label className="text-xs">Start Date (Optional)</Label>
                              <Input
                                type="date"
                                value={unit.occupancyStartDate ? new Date(unit.occupancyStartDate).toISOString().split('T')[0] : ''}
                                onChange={(e) => handleRentalUnitChange(unit.id, 'occupancyStartDate', e.target.value ? new Date(e.target.value) : undefined)}
                              />
                            </div>
                          </div>
                          
                          <div className="col-span-6 md:col-span-1 flex items-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveRentalUnit(unit.id)}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                          
                          {unit.rentType === 'fixed' && unit.monthlyRent ? (
                            <div className="col-span-12 text-sm text-gray-600">
                              Monthly income: {formatCurrency((unit.monthlyRent || 0) * (unit.occupancyRate / 100))}
                            </div>
                          ) : unit.rentType === 'perSqft' && unit.squareFootage && unit.rentPerSqft ? (
                            <div className="col-span-12 text-sm text-gray-600">
                              Monthly income: {formatCurrency((unit.squareFootage || 0) * (unit.rentPerSqft || 0) * (unit.occupancyRate / 100))}
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Operating Expenses Section */}
              <div className="border-t pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="checkbox"
                    id="includeOperatingExpenses"
                    checked={includeOperatingExpenses}
                    onChange={(e) => setIncludeOperatingExpenses(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="includeOperatingExpenses" className="text-lg font-semibold cursor-pointer">
                    Operating Expenses
                  </Label>
                </div>
                
                {includeOperatingExpenses && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="propertyManagementPercent">Property Management (%)</Label>
                      <Input
                        id="propertyManagementPercent"
                        type="number"
                        step="0.1"
                        value={operatingExpenses.propertyManagementPercent}
                        onChange={(e) => setOperatingExpenses({
                          ...operatingExpenses,
                          propertyManagementPercent: parseFloat(e.target.value) || 0,
                        })}
                        placeholder="0.0"
                      />
                      <p className="text-xs text-gray-500 mt-1">% of rental income</p>
                    </div>
                    <div>
                      <Label htmlFor="propertyManagementFixed">Property Management (Fixed $)</Label>
                      <Input
                        id="propertyManagementFixed"
                        type="number"
                        step="0.01"
                        value={operatingExpenses.propertyManagementFixed || ''}
                        onChange={(e) => setOperatingExpenses({
                          ...operatingExpenses,
                          propertyManagementFixed: parseFloat(e.target.value) || undefined,
                        })}
                        placeholder="0.00"
                      />
                      <p className="text-xs text-gray-500 mt-1">Fixed monthly amount (if not %)</p>
                    </div>
                    <div>
                      <Label htmlFor="monthlyMaintenanceReserve">Monthly Maintenance Reserve</Label>
                      <Input
                        id="monthlyMaintenanceReserve"
                        type="number"
                        step="0.01"
                        value={operatingExpenses.monthlyMaintenanceReserve}
                        onChange={(e) => setOperatingExpenses({
                          ...operatingExpenses,
                          monthlyMaintenanceReserve: parseFloat(e.target.value) || 0,
                        })}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label htmlFor="monthlyPropertyInsurance">Monthly Property Insurance</Label>
                      <Input
                        id="monthlyPropertyInsurance"
                        type="number"
                        step="0.01"
                        value={operatingExpenses.monthlyPropertyInsurance}
                        onChange={(e) => setOperatingExpenses({
                          ...operatingExpenses,
                          monthlyPropertyInsurance: parseFloat(e.target.value) || 0,
                        })}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label htmlFor="monthlyPropertyTax">Monthly Property Tax</Label>
                      <Input
                        id="monthlyPropertyTax"
                        type="number"
                        step="0.01"
                        value={operatingExpenses.monthlyPropertyTax}
                        onChange={(e) => setOperatingExpenses({
                          ...operatingExpenses,
                          monthlyPropertyTax: parseFloat(e.target.value) || 0,
                        })}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label htmlFor="monthlyUtilities">Monthly Utilities (Common Areas)</Label>
                      <Input
                        id="monthlyUtilities"
                        type="number"
                        step="0.01"
                        value={operatingExpenses.monthlyUtilities || ''}
                        onChange={(e) => setOperatingExpenses({
                          ...operatingExpenses,
                          monthlyUtilities: parseFloat(e.target.value) || undefined,
                        })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="monthlyOther">Other Monthly Expenses</Label>
                      <Input
                        id="monthlyOther"
                        type="number"
                        step="0.01"
                        value={operatingExpenses.monthlyOther || ''}
                        onChange={(e) => setOperatingExpenses({
                          ...operatingExpenses,
                          monthlyOther: parseFloat(e.target.value) || undefined,
                        })}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Debt Service Section */}
              <div className="border-t pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="checkbox"
                    id="includeDebtService"
                    checked={includeDebtService}
                    onChange={(e) => setIncludeDebtService(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="includeDebtService" className="text-lg font-semibold cursor-pointer">
                    Debt Service
                  </Label>
                </div>
                
                {includeDebtService && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="loanAmount">Loan Amount</Label>
                      <Input
                        id="loanAmount"
                        type="number"
                        step="0.01"
                        value={debtService.loanAmount}
                        onChange={(e) => setDebtService({
                          ...debtService,
                          loanAmount: parseFloat(e.target.value) || 0,
                        })}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label htmlFor="interestRate">Interest Rate (%)</Label>
                      <Input
                        id="interestRate"
                        type="number"
                        step="0.01"
                        value={debtService.interestRate}
                        onChange={(e) => setDebtService({
                          ...debtService,
                          interestRate: parseFloat(e.target.value) || 0,
                        })}
                        placeholder="5.5"
                      />
                      <p className="text-xs text-gray-500 mt-1">Annual percentage rate</p>
                    </div>
                    <div>
                      <Label htmlFor="loanTermMonths">Loan Term (Months)</Label>
                      <Input
                        id="loanTermMonths"
                        type="number"
                        value={debtService.loanTermMonths}
                        onChange={(e) => setDebtService({
                          ...debtService,
                          loanTermMonths: parseInt(e.target.value) || 360,
                        })}
                        placeholder="360"
                      />
                      <p className="text-xs text-gray-500 mt-1">Amortization period (e.g., 360 = 30 years)</p>
                    </div>
                    <div>
                      <Label htmlFor="paymentType">Payment Type</Label>
                      <Select
                        value={debtService.paymentType}
                        onValueChange={(v: 'interest-only' | 'principal-interest') => setDebtService({
                          ...debtService,
                          paymentType: v,
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="interest-only">Interest Only (Construction)</SelectItem>
                          <SelectItem value="principal-interest">Principal + Interest (Permanent)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {debtService.loanAmount > 0 && debtService.interestRate > 0 && (
                      <div className="md:col-span-2">
                        <p className="text-sm text-gray-600">
                          Estimated monthly payment: <span className="font-semibold">
                            {formatCurrency(
                              debtService.paymentType === 'interest-only'
                                ? (debtService.loanAmount * debtService.interestRate / 100 / 12)
                                : (debtService.loanAmount * 
                                    (debtService.interestRate / 100 / 12 * Math.pow(1 + debtService.interestRate / 100 / 12, debtService.loanTermMonths)) /
                                    (Math.pow(1 + debtService.interestRate / 100 / 12, debtService.loanTermMonths) - 1))
                            )}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                )}
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
                    <div className="space-y-4">
                      {/* Construction Summary */}
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Construction Phase</h4>
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
                      </div>

                      {/* Rental Income Summary */}
                      {projection.summary.monthlyRentalIncome > 0 && (
                        <div className="border-t pt-4">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Rental Income Summary</h4>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div>
                              <p className="text-sm text-gray-600">Total Units</p>
                              <p className="text-lg font-semibold">{projection.rentalSummary.totalUnits}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Total Square Footage</p>
                              <p className="text-lg font-semibold">
                                {projection.rentalSummary.totalProjectSquareFootage.toLocaleString()} sqft
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Monthly Rental Income</p>
                              <p className="text-lg font-semibold text-green-600">
                                {formatCurrency(projection.summary.monthlyRentalIncome)}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Annual Rental Income</p>
                              <p className="text-lg font-semibold text-green-600">
                                {formatCurrency(projection.summary.annualRentalIncome)}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Occupancy Rate</p>
                              <p className="text-lg font-semibold">
                                {formatPercent(projection.rentalSummary.stabilizedOccupancy)}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Financial Metrics */}
                      {projection.summary.monthlyRentalIncome > 0 && (
                        <div className="border-t pt-4">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Financial Metrics</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <p className="text-sm text-gray-600">Net Operating Income (NOI)</p>
                              <p className="text-lg font-semibold text-green-600">
                                {formatCurrency(projection.summary.netOperatingIncome)}
                              </p>
                              <p className="text-xs text-gray-500">Annual</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Operating Expenses</p>
                              <p className="text-lg font-semibold text-red-600">
                                {formatCurrency(projection.summary.annualOperatingExpenses)}
                              </p>
                              <p className="text-xs text-gray-500">Annual</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Debt Service</p>
                              <p className="text-lg font-semibold text-red-600">
                                {formatCurrency(projection.summary.monthlyDebtService * 12)}
                              </p>
                              <p className="text-xs text-gray-500">Annual</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Cash Flow After Debt</p>
                              <p className={`text-lg font-semibold ${projection.summary.cashFlowAfterDebt >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCurrency(projection.summary.cashFlowAfterDebt)}
                              </p>
                              <p className="text-xs text-gray-500">Annual</p>
                            </div>
                          </div>
                        </div>
                      )}
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
                            <th className="text-right p-2">Phase</th>
                            <th className="text-right p-2">Milestone</th>
                            <th className="text-right p-2">Rental</th>
                            <th className="text-right p-2">Total Inflow</th>
                            <th className="text-right p-2">Labor</th>
                            <th className="text-right p-2">Materials</th>
                            <th className="text-right p-2">Subs</th>
                            <th className="text-right p-2">Overhead</th>
                            <th className="text-right p-2">OpEx</th>
                            <th className="text-right p-2">Debt</th>
                            <th className="text-right p-2">Total Outflow</th>
                            <th className="text-right p-2">Net</th>
                            <th className="text-right p-2">Cumulative</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projection.monthlyCashFlows.map((month, idx) => (
                            <tr 
                              key={idx} 
                              className={`border-b ${
                                month.cumulativeBalance < 0 ? 'bg-red-50' : 
                                month.phase === 'post-construction' ? 'bg-green-50' : ''
                              }`}
                            >
                              <td className="p-2">{month.monthLabel}</td>
                              <td className="text-right p-2">
                                <span className={`text-xs px-2 py-1 rounded ${
                                  month.phase === 'construction' 
                                    ? 'bg-blue-100 text-blue-700' 
                                    : 'bg-green-100 text-green-700'
                                }`}>
                                  {month.phase === 'construction' ? 'Build' : 'Rent'}
                                </span>
                              </td>
                              <td className="text-right p-2">{formatCurrency(month.milestonePayments)}</td>
                              <td className="text-right p-2 text-green-600">
                                {month.rentalIncome > 0 ? formatCurrency(month.rentalIncome) : '-'}
                              </td>
                              <td className="text-right p-2 font-medium">{formatCurrency(month.totalInflow)}</td>
                              <td className="text-right p-2">{formatCurrency(month.laborCost)}</td>
                              <td className="text-right p-2">{formatCurrency(month.materialCost)}</td>
                              <td className="text-right p-2">{formatCurrency(month.subcontractorCost)}</td>
                              <td className="text-right p-2">{formatCurrency(month.overheadAllocation)}</td>
                              <td className="text-right p-2 text-orange-600">
                                {month.operatingExpenses > 0 ? formatCurrency(month.operatingExpenses) : '-'}
                              </td>
                              <td className="text-right p-2 text-red-600">
                                {month.debtService > 0 ? formatCurrency(month.debtService) : '-'}
                              </td>
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
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      if (projection) {
                        exportProFormaToPDF(projection)
                      }
                    }} 
                    className="flex-1"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Export PDF
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      if (projection) {
                        exportProFormaToExcel(projection)
                      }
                    }} 
                    className="flex-1"
                  >
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



