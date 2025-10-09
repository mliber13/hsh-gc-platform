// ============================================================================
// HSH GC Platform - Project Detail View
// ============================================================================
//
// Main view for a selected project with navigation to Estimate and Actuals
//

import React from 'react'
import { Project } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, BookOpen, ClipboardList, BarChart3, Building2, Calendar, DollarSign } from 'lucide-react'
import hshLogo from '/HSH Contractor Logo - Color.png'

interface ProjectDetailViewProps {
  project: Project
  onBack: () => void
  onViewEstimate: () => void
  onViewActuals: () => void
  onViewVariance: () => void
}

export function ProjectDetailView({
  project,
  onBack,
  onViewEstimate,
  onViewActuals,
  onViewVariance,
}: ProjectDetailViewProps) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const getStatusColor = (status: string) => {
    const colors = {
      estimating: 'bg-blue-100 text-blue-800',
      bidding: 'bg-yellow-100 text-yellow-800',
      awarded: 'bg-green-100 text-green-800',
      'in-progress': 'bg-orange-100 text-orange-800',
      complete: 'bg-gray-100 text-gray-800',
      archived: 'bg-slate-100 text-slate-800',
    }
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <img src={hshLogo} alt="HSH Contractor" className="h-16 sm:h-20 lg:h-24 w-auto" />
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-1">
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">{project.name}</h1>
                  <span className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)} w-fit`}>
                    {project.status.replace('-', ' ').toUpperCase()}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-gray-600">{project.address}</p>
              </div>
            </div>
            <Button
              onClick={onBack}
              variant="outline"
              className="border-gray-300 hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Projects
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Project Info Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <Card className="bg-white shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm text-gray-600">Plan ID</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">
                    {project.metadata?.planId || 'N/A'}
                  </p>
                  {project.metadata?.planOptions && project.metadata.planOptions.length > 0 && (
                    <div className="mt-2">
                      {project.metadata.planOptions.map((option: string) => (
                        <span 
                          key={option}
                          className="inline-block text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded mr-1"
                        >
                          {option}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="bg-purple-100 rounded-full p-3">
                  <Building2 className="w-8 h-8 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Project Type</p>
                  <p className="text-xl font-bold text-gray-900 mt-1 capitalize">
                    {project.type.replace('-', ' ')}
                  </p>
                </div>
                <div className="bg-blue-100 rounded-full p-3">
                  <Building2 className="w-8 h-8 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Start Date</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">
                    {project.startDate ? project.startDate.toLocaleDateString() : 'Not set'}
                  </p>
                </div>
                <div className="bg-orange-100 rounded-full p-3">
                  <Calendar className="w-8 h-8 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Estimated Value</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">
                    {formatCurrency(project.estimate?.totals?.totalEstimated || 0)}
                  </p>
                </div>
                <div className="bg-green-100 rounded-full p-3">
                  <DollarSign className="w-8 h-8 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Navigation Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Estimate Book Card */}
          <Card className="bg-gradient-to-br from-[#213069] to-[#1a2550] text-white hover:shadow-2xl transition-all cursor-pointer border-none group">
            <button onClick={onViewEstimate} className="w-full text-left">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="bg-white/20 rounded-full p-3 group-hover:bg-white/30 transition-colors">
                    <BookOpen className="w-8 h-8" />
                  </div>
                  <div className="text-right">
                    <p className="text-sm opacity-80">Budget Items</p>
                    <p className="text-3xl font-bold">{project.estimate?.trades?.length || 0}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <h3 className="text-2xl font-bold mb-3">Estimate Book</h3>
                <p className="text-white/80 mb-4">
                  Build and manage your project budget, add line items, calculate costs, and set pricing.
                </p>
                <div className="bg-white/10 rounded-lg p-3 mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Base Price</span>
                    <span className="font-semibold">{formatCurrency(project.estimate?.totals?.basePriceTotal || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Gross Profit</span>
                    <span className="font-semibold">{formatCurrency(project.estimate?.totals?.grossProfitTotal || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-white/20">
                    <span>Total</span>
                    <span>{formatCurrency(project.estimate?.totals?.totalEstimated || 0)}</span>
                  </div>
                </div>
                <div className="flex items-center text-sm text-white/60">
                  <span>Click to view and edit estimate →</span>
                </div>
              </CardContent>
            </button>
          </Card>

          {/* Project Actuals Card */}
          <Card className="bg-gradient-to-br from-[#D95C00] to-[#B34C00] text-white hover:shadow-2xl transition-all cursor-pointer border-none group">
            <button onClick={onViewActuals} className="w-full text-left">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="bg-white/20 rounded-full p-3 group-hover:bg-white/30 transition-colors">
                    <ClipboardList className="w-8 h-8" />
                  </div>
                  <div className="text-right">
                    <p className="text-sm opacity-80">Status</p>
                    <p className="text-2xl font-bold capitalize">{project.status.replace('-', ' ')}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <h3 className="text-2xl font-bold mb-3">Project Actuals</h3>
                <p className="text-white/80 mb-4">
                  Track real costs and revenue as they occur. Compare actual spending against your budget in real-time.
                </p>
                <div className="bg-white/10 rounded-lg p-3 mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Actual Labor</span>
                    <span className="font-semibold">$0.00</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Actual Materials</span>
                    <span className="font-semibold">$0.00</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-white/20">
                    <span>Total Spent</span>
                    <span>$0.00</span>
                  </div>
                </div>
                <div className="flex items-center text-sm text-white/60">
                  <span>Click to track actuals →</span>
                </div>
              </CardContent>
            </button>
          </Card>
        </div>

        {/* Variance Report Card */}
        <Card className="bg-gradient-to-br from-[#34AB8A] to-[#2a8d6f] text-white hover:shadow-2xl transition-all cursor-pointer border-none">
          <button onClick={onViewVariance} className="w-full text-left">
            <CardContent className="py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="bg-white/20 rounded-full p-4">
                    <BarChart3 className="w-10 h-10" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold mb-1">Variance Report</h3>
                    <p className="text-white/80">
                      Compare estimated vs actual costs to see how your project is performing
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm opacity-80 mb-1">Variance</p>
                  <p className="text-3xl font-bold">--</p>
                  <p className="text-sm opacity-80">Coming Soon</p>
                </div>
              </div>
            </CardContent>
          </button>
        </Card>
      </main>
    </div>
  )
}

