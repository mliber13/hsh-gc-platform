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
import { getActivePlans } from '@/services/planService'
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
    const plans = getActivePlans()
    setAvailablePlans(plans)
  }, [])

  const selectedPlan = availablePlans.find(p => p.id === formData.planId)
  const isCustomPlan = formData.planId === 'custom'
  
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
    onCreate(formData)
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

