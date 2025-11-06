// ============================================================================
// HSH GC Platform - Create Project Form
// ============================================================================
//
// Form for creating a new project with all required information
//

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft } from 'lucide-react'
import { PROJECT_TYPES, ProjectType, Plan } from '@/types'
import { getActivePlans_Hybrid, getPlanById_Hybrid } from '@/services/planHybridService'
import { getEstimateTemplateById, applyTemplateToEstimate } from '@/services'
import hshLogo from '/HSH Contractor Logo - Color.png'

interface CreateProjectFormProps {
  onBack: () => void
  onCreate: (projectData: ProjectFormData) => void
}

export interface ProjectFormData {
  name: string
  type: ProjectType
  planId: string
  customPlanId?: string
  planOptions?: string[]
  address: string
  city: string
  state: string
  zipCode: string
  startDate?: Date
  endDate?: Date
  estimateTemplateId?: string // Added to pass template ID to onCreate
  specs?: {
    livingSquareFootage: number
    existingSquareFootage?: number
    newSquareFootage?: number
    totalSquareFootage?: number
    bedrooms?: number
    bathrooms?: number
    stories?: number
    garageSpaces?: number
    foundationType?: 'slab' | 'crawl-space' | 'full-basement' | 'partial-basement' | 'other'
    roofType?: 'gable' | 'hip' | 'mansard' | 'flat' | 'shed' | 'gambrel' | 'other'
    basement?: 'none' | 'unfinished' | 'finished' | 'partial'
    lotSize?: number
  }
}

export function CreateProjectForm({ onBack, onCreate }: CreateProjectFormProps) {
  const [formData, setFormData] = useState<ProjectFormData>({
    name: '',
    type: 'residential-new-build',
    planId: '',
    customPlanId: '',
    planOptions: [],
    address: '',
    city: '',
    state: '',
    zipCode: '',
  })

  const [availablePlans, setAvailablePlans] = useState<Plan[]>([])

  useEffect(() => {
    // Load plans from Plan Library
    const loadPlans = async () => {
      console.log('🔍 Loading plans from hybrid service...');
      const plans = await getActivePlans_Hybrid()
      console.log('📋 Plans loaded:', plans.length, plans);
      setAvailablePlans(plans)
    }
    loadPlans()
  }, [])

  const selectedPlan = availablePlans.find(p => p.id === formData.planId)
  const isCustomPlan = formData.planId === 'custom'
  const isRenovation = formData.type === 'residential-renovation' || formData.type === 'commercial-renovation'
  
  // Auto-populate specs from plan when plan is selected
  useEffect(() => {
    if (selectedPlan && !isCustomPlan) {
      setFormData(prev => {
        const baseSqft = selectedPlan.squareFootage || 0
        const additionalSqft = (prev.planOptions || [])
          .map(optName => {
            const option = selectedPlan.options.find(o => o.name === optName)
            return option?.additionalSquareFootage || 0
          })
          .reduce((sum, sqft) => sum + sqft, 0)
        const totalSqft = baseSqft + additionalSqft
        
        return {
          ...prev,
          specs: {
            livingSquareFootage: prev.specs?.livingSquareFootage || totalSqft || 0,
            totalSquareFootage: prev.specs?.totalSquareFootage || totalSqft || undefined,
            bedrooms: prev.specs?.bedrooms ?? selectedPlan.bedrooms,
            bathrooms: prev.specs?.bathrooms ?? selectedPlan.bathrooms,
            stories: prev.specs?.stories ?? selectedPlan.stories,
            garageSpaces: prev.specs?.garageSpaces ?? selectedPlan.garageSpaces,
            // Keep existing foundation/roof/basement if set, otherwise leave undefined
            foundationType: prev.specs?.foundationType,
            roofType: prev.specs?.roofType,
            basement: prev.specs?.basement,
            lotSize: prev.specs?.lotSize,
            existingSquareFootage: prev.specs?.existingSquareFootage,
            newSquareFootage: prev.specs?.newSquareFootage,
          }
        }
      })
    }
  }, [selectedPlan, isCustomPlan, formData.planOptions])
  
  const handlePlanOptionToggle = (option: string) => {
    setFormData(prev => {
      const currentOptions = prev.planOptions || []
      const isSelected = currentOptions.includes(option)
      return {
        ...prev,
        planOptions: isSelected
          ? currentOptions.filter(o => o !== option)
          : [...currentOptions, option]
      }
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate required fields
    if (!isRenovation && !formData.specs?.livingSquareFootage) {
      alert('Please enter the living square footage. This is required for new builds.')
      return
    }
    
    // For renovations, calculate living sqft if not set
    if (isRenovation && !formData.specs?.livingSquareFootage) {
      const existing = formData.specs?.existingSquareFootage || 0
      const newSqft = formData.specs?.newSquareFootage || 0
      if (existing > 0 || newSqft > 0) {
        setFormData(prev => ({
          ...prev,
          specs: {
            ...prev.specs,
            livingSquareFootage: existing + newSqft,
          }
        }))
      }
    }
    
    // Check if selected plan has an estimate template
    if (selectedPlan?.estimateTemplateId) {
      onCreate({
        ...formData,
        estimateTemplateId: selectedPlan.estimateTemplateId
      })
    } else {
      onCreate(formData)
    }
  }

              return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <img src={hshLogo} alt="HSH Contractor" className="h-20 sm:h-24 lg:h-28 w-auto" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Create New Project</h1>
                <p className="text-sm text-gray-600 mt-1">Enter project details to get started</p>
              </div>
            </div>
            <Button
              onClick={onBack}
              variant="outline"
              className="border-gray-300 hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </div>
                                          </header>
  
      {/* Form */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Project Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Project Details */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Project Details</h3>
                
                <div>
                  <Label htmlFor="name">Project Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Smith Residence Addition"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="type">Project Type *</Label>
                  <Select 
                    value={formData.type} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, type: value as ProjectType }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PROJECT_TYPES).map(([key, value]) => (
                        <SelectItem key={key} value={key}>
                          {value.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="planId">Plan ID *</Label>
                  <Select 
                    value={formData.planId} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, planId: value, planOptions: [], customPlanId: '' }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a plan..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">
                        <span className="font-medium text-[#0E79C9]">✏️ Custom Plan (Enter ID)</span>
                      </SelectItem>
                      {availablePlans.length > 0 && (
                        <>
                          <div className="px-2 py-1 text-xs text-gray-500 font-semibold">FROM PLAN LIBRARY:</div>
                          {availablePlans.map((plan) => (
                            <SelectItem key={plan.id} value={plan.id}>
                              {plan.name} ({plan.planId})
                            </SelectItem>
                          ))}
                        </>
                      )}
                      {availablePlans.length === 0 && (
                        <SelectItem value="none" disabled>
                          No plans in library - Use custom or create one
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {formData.planId === '' && (
                    <p className="text-xs text-gray-500 mt-1">
                      Select a plan from the library or enter a custom plan ID
                    </p>
                  )}
                  {isCustomPlan && (
                    <div className="mt-2 space-y-2">
                      <Input
                        value={formData.customPlanId}
                        placeholder="Enter custom plan ID (e.g., 1416CN, Custom Apartment)"
                        onChange={(e) => setFormData(prev => ({ ...prev, customPlanId: e.target.value }))}
                        required
                        className="border-[#0E79C9] focus:ring-[#0E79C9]"
                      />
                      <p className="text-xs text-gray-600 italic">
                        💡 For one-off projects or plans not in your library
                      </p>
                    </div>
                  )}
                  {selectedPlan && selectedPlan.options.length > 0 && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-sm font-medium text-gray-700 mb-2">Plan Options:</p>
                      <div className="space-y-2">
                        {selectedPlan.options.map((option) => (
                          <label key={option.id} className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formData.planOptions?.includes(option.name) || false}
                              onChange={() => handlePlanOptionToggle(option.name)}
                              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <div className="flex-1">
                              <span className="text-sm text-gray-700 font-medium">{option.name}</span>
                              {option.description && (
                                <span className="text-xs text-gray-500 ml-2">- {option.description}</span>
                              )}
                              <div className="flex gap-2 mt-1">
                                {option.additionalSquareFootage && (
                                  <span className="text-xs text-blue-600">+{option.additionalSquareFootage.toLocaleString()} sq ft</span>
                                )}
                                {option.additionalCost && (
                                  <span className="text-xs text-green-600">+${option.additionalCost.toLocaleString()}</span>
                                )}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        startDate: e.target.value ? new Date(e.target.value) : undefined 
                      }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="endDate">Expected End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        endDate: e.target.value ? new Date(e.target.value) : undefined 
                      }))}
                    />
                  </div>
                </div>
              </div>

              {/* Project Specifications */}
              <div className="space-y-4 pt-6 border-t">
                <h3 className="text-lg font-semibold text-gray-900">Project Specifications</h3>
                <p className="text-sm text-gray-600 mb-4">
                  These specifications help inform budget estimates and will be visible while building your estimate.
                </p>
                
                {/* Square Footage - Different fields for renovations vs new builds */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {isRenovation ? (
                    <>
                      <div>
                        <Label htmlFor="existingSquareFootage">Existing Square Footage</Label>
                        <Input
                          id="existingSquareFootage"
                          type="number"
                          value={formData.specs?.existingSquareFootage || ''}
                          onChange={(e) => {
                            const existing = e.target.value ? parseFloat(e.target.value) : undefined
                            const newSqft = formData.specs?.newSquareFootage || 0
                            setFormData(prev => ({
                              ...prev,
                              specs: {
                                ...prev.specs,
                                existingSquareFootage: existing,
                                livingSquareFootage: (existing || 0) + newSqft,
                              }
                            }))
                          }}
                          placeholder="e.g., 2000"
                        />
                        <p className="text-xs text-gray-500 mt-1">Current living space</p>
                      </div>
                      <div>
                        <Label htmlFor="newSquareFootage">New Square Footage Being Added</Label>
                        <Input
                          id="newSquareFootage"
                          type="number"
                          value={formData.specs?.newSquareFootage || ''}
                          onChange={(e) => {
                            const newSqft = e.target.value ? parseFloat(e.target.value) : undefined
                            const existingSqft = formData.specs?.existingSquareFootage || 0
                            setFormData(prev => ({
                              ...prev,
                              specs: {
                                ...prev.specs,
                                newSquareFootage: newSqft,
                                livingSquareFootage: existingSqft + (newSqft || 0),
                              }
                            }))
                          }}
                          placeholder="e.g., 500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Additional space being added</p>
                      </div>
                    </>
                  ) : null}
                  
                  <div className={isRenovation ? 'md:col-span-2' : ''}>
                    <Label htmlFor="livingSquareFootage">
                      Living Square Footage {!isRenovation && '*'}
                    </Label>
                    <Input
                      id="livingSquareFootage"
                      type="number"
                      value={formData.specs?.livingSquareFootage || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        specs: {
                          ...prev.specs,
                          livingSquareFootage: e.target.value ? parseFloat(e.target.value) : 0,
                        }
                      }))}
                      placeholder="e.g., 2500"
                      required={!isRenovation}
                      className={!formData.specs?.livingSquareFootage && !isRenovation ? 'border-red-300' : ''}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {isRenovation 
                        ? 'Total living space after renovation (auto-calculated from existing + new)'
                        : 'Total heated living space (required)'}
                    </p>
                  </div>
                  
                  <div>
                    <Label htmlFor="totalSquareFootage">Total Square Footage (Optional)</Label>
                    <Input
                      id="totalSquareFootage"
                      type="number"
                      value={formData.specs?.totalSquareFootage || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        specs: {
                          ...prev.specs,
                          totalSquareFootage: e.target.value ? parseFloat(e.target.value) : undefined,
                        }
                      }))}
                      placeholder="e.g., 3000"
                    />
                    <p className="text-xs text-gray-500 mt-1">Includes garage, basement, etc.</p>
                  </div>
                </div>

                {/* Basic Specs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label htmlFor="bedrooms">Bedrooms</Label>
                    <Input
                      id="bedrooms"
                      type="number"
                      value={formData.specs?.bedrooms || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        specs: {
                          ...prev.specs,
                          bedrooms: e.target.value ? parseInt(e.target.value) : undefined,
                        }
                      }))}
                      placeholder="e.g., 3"
                    />
                  </div>
                  <div>
                    <Label htmlFor="bathrooms">Bathrooms</Label>
                    <Input
                      id="bathrooms"
                      type="number"
                      step="0.5"
                      value={formData.specs?.bathrooms || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        specs: {
                          ...prev.specs,
                          bathrooms: e.target.value ? parseFloat(e.target.value) : undefined,
                        }
                      }))}
                      placeholder="e.g., 2.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="stories">Stories/Levels</Label>
                    <Input
                      id="stories"
                      type="number"
                      value={formData.specs?.stories || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        specs: {
                          ...prev.specs,
                          stories: e.target.value ? parseInt(e.target.value) : undefined,
                        }
                      }))}
                      placeholder="e.g., 2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="garageSpaces">Garage Spaces</Label>
                    <Input
                      id="garageSpaces"
                      type="number"
                      value={formData.specs?.garageSpaces || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        specs: {
                          ...prev.specs,
                          garageSpaces: e.target.value ? parseInt(e.target.value) : undefined,
                        }
                      }))}
                      placeholder="e.g., 2"
                    />
                  </div>
                </div>

                {/* Foundation, Roof, Basement, Lot */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="foundationType">Foundation Type</Label>
                    <Select
                      value={formData.specs?.foundationType || ''}
                      onValueChange={(value) => setFormData(prev => ({
                        ...prev,
                        specs: {
                          ...prev.specs,
                          foundationType: value as any,
                        }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select foundation type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slab">Slab</SelectItem>
                        <SelectItem value="crawl-space">Crawl Space</SelectItem>
                        <SelectItem value="full-basement">Full Basement</SelectItem>
                        <SelectItem value="partial-basement">Partial Basement</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="roofType">Roof Type</Label>
                    <Select
                      value={formData.specs?.roofType || ''}
                      onValueChange={(value) => setFormData(prev => ({
                        ...prev,
                        specs: {
                          ...prev.specs,
                          roofType: value as any,
                        }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select roof type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gable">Gable (Standard)</SelectItem>
                        <SelectItem value="hip">Hip</SelectItem>
                        <SelectItem value="mansard">Mansard</SelectItem>
                        <SelectItem value="flat">Flat</SelectItem>
                        <SelectItem value="shed">Shed</SelectItem>
                        <SelectItem value="gambrel">Gambrel</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1">Hip roofs typically cost more than standard gable</p>
                  </div>
                  
                  <div>
                    <Label htmlFor="basement">Basement</Label>
                    <Select
                      value={formData.specs?.basement || ''}
                      onValueChange={(value) => setFormData(prev => ({
                        ...prev,
                        specs: {
                          ...prev.specs,
                          basement: value as any,
                        }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select basement type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="unfinished">Unfinished</SelectItem>
                        <SelectItem value="finished">Finished</SelectItem>
                        <SelectItem value="partial">Partial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="lotSize">Lot Size (Square Feet)</Label>
                    <Input
                      id="lotSize"
                      type="number"
                      value={formData.specs?.lotSize || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        specs: {
                          ...prev.specs,
                          lotSize: e.target.value ? parseFloat(e.target.value) : undefined,
                        }
                      }))}
                      placeholder="e.g., 10000"
                    />
                    <p className="text-xs text-gray-500 mt-1">Or enter in acres (1 acre = 43,560 sq ft)</p>
                  </div>
                </div>
              </div>

              {/* Project Location */}
              <div className="space-y-4 pt-6 border-t">
                <h3 className="text-lg font-semibold text-gray-900">Project Location</h3>
                
                <div>
                  <Label htmlFor="address">Street Address *</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="123 Main Street"
                    required
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-1">
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                      placeholder="City"
                      required
                    />
                  </div>
                  <div className="col-span-1">
                    <Label htmlFor="state">State *</Label>
                    <Input
                      id="state"
                      value={formData.state}
                      onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                      placeholder="State"
                      required
                    />
                  </div>
                  <div className="col-span-1">
                    <Label htmlFor="zipCode">ZIP Code *</Label>
                    <Input
                      id="zipCode"
                      value={formData.zipCode}
                      onChange={(e) => setFormData(prev => ({ ...prev, zipCode: e.target.value }))}
                      placeholder="12345"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-4 pt-6 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onBack}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-gradient-to-r from-[#0E79C9] to-[#0A5A96] hover:from-[#0A5A96] hover:to-[#084577]"
                >
                  Create Project & Build Estimate
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

