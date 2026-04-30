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
import { usePageTitle } from '@/contexts/PageTitleContext'
import { PlusCircle, Search, FileText, Edit, Trash2, FolderOpen, Home } from 'lucide-react'

interface PlanLibraryProps {
  onBack: () => void
  onCreatePlan: () => void
  onEditPlan: (plan: Plan) => void
}

export function PlanLibrary({ onBack, onCreatePlan, onEditPlan }: PlanLibraryProps) {
  usePageTitle('Plan Library')
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
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button onClick={onBack} variant="outline" className="text-muted-foreground">
          <Home className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
        <Button onClick={onCreatePlan}>
          <PlusCircle className="w-4 h-4 mr-2" />
          Create Plan
        </Button>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card className="border-border/60 bg-card/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Plans</p>
                  <p className="text-3xl font-bold mt-1">{stats.total}</p>
                </div>
                <div className="rounded-lg border border-sky-500/30 bg-sky-500/15 p-3 text-sky-400">
                  <FileText className="w-7 h-7" />
                </div>
              </div>
            </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active</p>
                  <p className="text-3xl font-bold mt-1">{stats.active}</p>
                </div>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 p-3 text-emerald-400">
                  <FileText className="w-7 h-7" />
                </div>
              </div>
            </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">With Documents</p>
                  <p className="text-3xl font-bold mt-1">{stats.withDocuments}</p>
                </div>
                <div className="rounded-lg border border-violet-500/30 bg-violet-500/15 p-3 text-violet-400">
                  <FolderOpen className="w-7 h-7" />
                </div>
              </div>
            </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">With Options</p>
                  <p className="text-3xl font-bold mt-1">{stats.withOptions}</p>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/15 p-3 text-amber-400">
                  <FileText className="w-7 h-7" />
                </div>
              </div>
            </CardContent>
        </Card>

        <Card className="cursor-pointer border-border/60 bg-card/50 transition-colors hover:bg-muted/20" onClick={onCreatePlan}>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center h-full">
                <PlusCircle className="w-10 h-10 mb-2 text-primary" />
                <p className="text-lg font-bold">Create Plan</p>
              </div>
            </CardContent>
        </Card>
      </section>

      <Card className="border-border/60 bg-card/50">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
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

      <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>All Plans</span>
              <span className="text-sm font-normal text-muted-foreground">
                {filteredPlans.length} {filteredPlans.length === 1 ? 'plan' : 'plans'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredPlans.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground text-lg mb-2">
                  {searchQuery ? 'No plans found' : 'No plans yet'}
                </p>
                <p className="text-muted-foreground mb-6">
                  {searchQuery ? 'Try adjusting your search' : 'Create your first plan template to get started'}
                </p>
                {!searchQuery && (
                  <Button onClick={onCreatePlan}>
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Create Plan
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPlans.map((plan) => (
                  <Card key={plan.id} className="border-border/60 bg-card/50 transition-colors hover:bg-muted/20">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold mb-1">{plan.name}</h3>
                          <p className="text-sm text-muted-foreground">{plan.planId}</p>
                        </div>
                        {!plan.isActive && (
                          <span className="inline-flex items-center rounded-full border border-muted-foreground/30 bg-muted px-2 py-1 text-xs text-muted-foreground">
                            Inactive
                          </span>
                        )}
                      </div>

                      {plan.description && (
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{plan.description}</p>
                      )}

                      <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                        {plan.squareFootage && (
                          <div>
                            <span className="text-muted-foreground">Sq Ft:</span>
                            <span className="ml-1 font-medium">{plan.squareFootage}</span>
                          </div>
                        )}
                        {plan.bedrooms && (
                          <div>
                            <span className="text-muted-foreground">Beds:</span>
                            <span className="ml-1 font-medium">{plan.bedrooms}</span>
                          </div>
                        )}
                        {plan.bathrooms && (
                          <div>
                            <span className="text-muted-foreground">Baths:</span>
                            <span className="ml-1 font-medium">{plan.bathrooms}</span>
                          </div>
                        )}
                        {plan.stories && (
                          <div>
                            <span className="text-muted-foreground">Stories:</span>
                            <span className="ml-1 font-medium">{plan.stories}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
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
                          className="text-destructive hover:text-destructive"
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
    </div>
  )
}

