// ============================================================================
// HSH GC Platform - Plan Library
// ============================================================================
//
// Main dashboard for managing construction plan templates
//

import React, { useState, useEffect } from 'react'
import { Plan } from '@/types'
import { getPlanStats } from '@/services/planService'
import { getAllPlans_Hybrid, deletePlan_Hybrid } from '@/services/planHybridService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PlusCircle, Search, FileText, Edit, Trash2, FolderOpen, Home } from 'lucide-react'
import hshLogo from '/HSH Contractor Logo - Color.png'

interface PlanLibraryProps {
  onBack: () => void
  onCreatePlan: () => void
  onEditPlan: (plan: Plan) => void
}

export function PlanLibrary({ onBack, onCreatePlan, onEditPlan }: PlanLibraryProps) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, withDocuments: 0, withOptions: 0 })

  useEffect(() => {
    loadPlans()
  }, [])

  const loadPlans = async () => {
    const allPlans = await getAllPlans_Hybrid()
    setPlans(allPlans)
    setStats(getPlanStats())
  }

  const handleDeletePlan = async (planId: string) => {
    if (window.confirm('Are you sure you want to delete this plan? This cannot be undone.')) {
      await deletePlan_Hybrid(planId)
      loadPlans()
    }
  }

  const filteredPlans = plans.filter(plan =>
    plan.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    plan.planId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    plan.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="p-2 sm:p-4 lg:p-6 xl:p-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <img src={hshLogo} alt="HSH Contractor" className="h-20 sm:h-24 lg:h-28 w-auto" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Plan Library</h1>
                <p className="text-sm text-gray-600 mt-1">Manage construction plan templates</p>
              </div>
            </div>
            <Button
              onClick={onBack}
              variant="outline"
              className="border-gray-300 hover:bg-gray-50"
            >
              <Home className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <Card className="bg-white shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Plans</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
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
                  <p className="text-sm text-gray-600">Active</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stats.active}</p>
                </div>
                <div className="bg-green-100 rounded-full p-3">
                  <FileText className="w-8 h-8 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">With Documents</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stats.withDocuments}</p>
                </div>
                <div className="bg-purple-100 rounded-full p-3">
                  <FolderOpen className="w-8 h-8 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">With Options</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stats.withOptions}</p>
                </div>
                <div className="bg-orange-100 rounded-full p-3">
                  <FileText className="w-8 h-8 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card 
            className="bg-gradient-to-br from-[#0E79C9] to-[#0A5A96] text-white hover:shadow-xl transition-shadow cursor-pointer border-none"
            onClick={onCreatePlan}
          >
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center h-full">
                <PlusCircle className="w-12 h-12 mb-2" />
                <p className="text-lg font-bold">Create Plan</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search Bar */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                type="text"
                placeholder="Search plans by name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 text-lg"
              />
            </div>
          </CardContent>
        </Card>

        {/* Plans Grid */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>All Plans</span>
              <span className="text-sm font-normal text-gray-600">
                {filteredPlans.length} {filteredPlans.length === 1 ? 'plan' : 'plans'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredPlans.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 text-lg mb-2">
                  {searchQuery ? 'No plans found' : 'No plans yet'}
                </p>
                <p className="text-gray-500 mb-6">
                  {searchQuery ? 'Try adjusting your search' : 'Create your first plan template to get started'}
                </p>
                {!searchQuery && (
                  <Button
                    onClick={onCreatePlan}
                    className="bg-gradient-to-r from-[#0E79C9] to-[#0A5A96]"
                  >
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Create Plan
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPlans.map((plan) => (
                  <Card key={plan.id} className="hover:shadow-lg transition-shadow">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-gray-900 mb-1">{plan.name}</h3>
                          <p className="text-sm text-gray-600">{plan.planId}</p>
                        </div>
                        {!plan.isActive && (
                          <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                            Inactive
                          </span>
                        )}
                      </div>

                      {plan.description && (
                        <p className="text-sm text-gray-600 mb-4 line-clamp-2">{plan.description}</p>
                      )}

                      <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                        {plan.squareFootage && (
                          <div>
                            <span className="text-gray-500">Sq Ft:</span>
                            <span className="ml-1 font-medium">{plan.squareFootage}</span>
                          </div>
                        )}
                        {plan.bedrooms && (
                          <div>
                            <span className="text-gray-500">Beds:</span>
                            <span className="ml-1 font-medium">{plan.bedrooms}</span>
                          </div>
                        )}
                        {plan.bathrooms && (
                          <div>
                            <span className="text-gray-500">Baths:</span>
                            <span className="ml-1 font-medium">{plan.bathrooms}</span>
                          </div>
                        )}
                        {plan.stories && (
                          <div>
                            <span className="text-gray-500">Stories:</span>
                            <span className="ml-1 font-medium">{plan.stories}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                        <span>{plan.documents.length} documents</span>
                        <span>{plan.options.length} options</span>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          onClick={() => onEditPlan(plan)}
                          variant="outline"
                          size="sm"
                          className="flex-1"
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          onClick={() => handleDeletePlan(plan.id)}
                          variant="outline"
                          size="sm"
                          className="text-red-600 border-red-300 hover:bg-red-50"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

