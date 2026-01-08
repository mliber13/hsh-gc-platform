// ============================================================================
// HSH GC Platform - Projects Dashboard
// ============================================================================
//
// Main dashboard for viewing and managing all projects
//

import React, { useState, useEffect } from 'react'
import { Project } from '@/types'
import { getAllProjects } from '@/services/projectService'
import { getProjects_Hybrid, getTradesForEstimate_Hybrid } from '@/services/hybridService'
import { getProjectActuals_Hybrid } from '@/services/actualsHybridService'
import { getTradesForEstimate, exportAllData, importAllData } from '@/services'
import { usePermissions } from '@/hooks/usePermissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PlusCircle, Search, Building2, Calendar, DollarSign, FileText, Download, Upload, Eye, FileSpreadsheet, ChevronDown, TrendingUp } from 'lucide-react'
import hshLogo from '/HSH Contractor Logo - Color.png'
import ImportEstimate from './ImportEstimate'

interface ProjectsDashboardProps {
  onCreateProject: () => void
  onSelectProject: (project: Project) => void
  onOpenPlanLibrary: () => void
  onOpenItemLibrary: () => void
  onOpenDealPipeline?: () => void
}

interface ProjectWithStats extends Project {
  estimatedValue?: number
  actualCosts?: number
  tradeCount?: number
}

export function ProjectsDashboard({ onCreateProject, onSelectProject, onOpenPlanLibrary, onOpenItemLibrary, onOpenDealPipeline }: ProjectsDashboardProps) {
  const [projects, setProjects] = useState<ProjectWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showImportEstimate, setShowImportEstimate] = useState(false)
  const [showMobileActions, setShowMobileActions] = useState(false)
  const { canCreate, isViewer } = usePermissions()

  useEffect(() => {
    const loadProjects = async () => {
      setLoading(true)
      
      // First, load projects immediately (fast)
      const allProjects = await getProjects_Hybrid()
      
      // Show projects immediately without stats
      setProjects(allProjects.map(p => ({ ...p, estimatedValue: 0, actualCosts: 0, tradeCount: 0 })))
      setLoading(false)
      
      // Then load stats in the background (progressive enhancement)
      // Combine trade fetching to avoid duplicate calls
      const projectsWithStats = await Promise.all(
        allProjects.map(async (project) => {
          // Fetch trades once and use for both estimated value and trade count
          const [trades, actuals] = await Promise.all([
            getTradesForEstimate_Hybrid(project.estimate.id),
            getProjectActuals_Hybrid(project.id)
          ])
          
          // Calculate all stats from the single trades fetch
          const tradeCount = trades.length
          const basePriceTotal = trades.reduce((sum, trade) => sum + trade.totalCost, 0)
          const grossProfitTotal = trades.reduce((sum, trade) => {
            const markup = trade.markupPercent || 11.1
            return sum + (trade.totalCost * (markup / 100))
          }, 0)
          const contingency = basePriceTotal * 0.10 // 10% default
          const estimatedValue = basePriceTotal + grossProfitTotal + contingency
          const actualCosts = actuals?.totalActualCost || 0
          
          return { 
            ...project, 
            estimatedValue, 
            actualCosts, 
            tradeCount 
          }
        })
      )
      
      // Update with stats once loaded
      setProjects(projectsWithStats)
    }
    loadProjects()
  }, [])

  // Calculate estimated value for a project from its trades (kept for compatibility)
  const calculateEstimatedValue = async (project: Project): Promise<number> => {
    const trades = await getTradesForEstimate_Hybrid(project.estimate.id)
    const basePriceTotal = trades.reduce((sum, trade) => sum + trade.totalCost, 0)
    const grossProfitTotal = trades.reduce((sum, trade) => {
      const markup = trade.markupPercent || 11.1
      return sum + (trade.totalCost * (markup / 100))
    }, 0)
    const contingency = basePriceTotal * 0.10 // 10% default
    return basePriceTotal + grossProfitTotal + contingency
  }

  const calculateTradeCount = async (project: Project): Promise<number> => {
    const trades = await getTradesForEstimate_Hybrid(project.estimate.id)
    return trades.length
  }

  // Calculate actual costs for a project from actuals entries
  const calculateActualCosts = async (project: Project): Promise<number> => {
    const actuals = await getProjectActuals_Hybrid(project.id)
    if (!actuals) return 0
    return actuals.totalActualCost || 0
  }

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.address?.street?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.city?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const getStatusColor = (status: string) => {
    const colors = {
      estimating: 'bg-blue-100 text-blue-800',
      'in-progress': 'bg-orange-100 text-orange-800',
      complete: 'bg-green-100 text-green-800',
    }
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  // Export all localStorage data
  const handleExportData = () => {
    try {
      const data = exportAllData()

      const jsonString = JSON.stringify(data, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = url
      link.download = `hsh-backup-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      alert('✅ Data exported successfully!')
    } catch (error) {
      console.error('Export failed:', error)
      alert('❌ Failed to export data. Please try again.')
    }
  }

  // Import data from JSON file
  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        
        // Parse with date reviver
        const data = JSON.parse(content, (key, value) => {
          if (typeof value === 'string') {
            const dateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
            if (dateRegex.test(value)) {
              return new Date(value)
            }
          }
          return value
        })

        console.log('Importing data:', {
          projects: data.projects?.length || 0,
          estimates: data.estimates?.length || 0,
          trades: data.trades?.length || 0,
          actuals: data.actuals?.length || 0,
          laborEntries: data.laborEntries?.length || 0,
          materialEntries: data.materialEntries?.length || 0,
          itemTemplates: data.itemTemplates?.length || 0,
        })

        // Import all data (replace existing)
        importAllData(data, false)

        console.log('Import complete, data saved to localStorage')

        // Small delay to ensure localStorage is written
        setTimeout(() => {
          alert('✅ Data imported successfully! Refreshing page...')
          window.location.reload()
        }, 100)
      } catch (error) {
        console.error('Import failed:', error)
        alert(`❌ Failed to import data: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
    reader.readAsText(file)
  }

  // Handle import estimate success
  const handleImportEstimateSuccess = async (projectId: string) => {
    // Reload projects to show the new imported project
    const allProjects = await getProjects_Hybrid()
    
    // Calculate stats for each project
    const projectsWithStats = await Promise.all(
      allProjects.map(async (project) => {
        const estimatedValue = await calculateEstimatedValue(project)
        const actualCosts = await calculateActualCosts(project)
        const tradeCount = await calculateTradeCount(project)
        return { ...project, estimatedValue, actualCosts, tradeCount }
      })
    )
    
    setProjects(projectsWithStats)
    setShowImportEstimate(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <img src={hshLogo} alt="HSH Contractor" className="h-20 sm:h-24 lg:h-28 w-auto" />
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Projects Dashboard</h1>
                <p className="text-xs sm:text-sm text-gray-600 mt-1 hidden sm:block">Manage your construction projects</p>
              </div>
            </div>
            
            {/* Data Management Buttons */}
            <div className="hidden sm:flex items-center gap-3">
              {canCreate && (
                <Button
                  onClick={() => setShowImportEstimate(true)}
                  variant="outline"
                  size="sm"
                  className="border-[#D95C00] text-[#D95C00] hover:bg-[#D95C00] hover:text-white"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Import Estimate
                </Button>
              )}
              <Button
                onClick={handleExportData}
                variant="outline"
                size="sm"
                className="border-[#34AB8A] text-[#34AB8A] hover:bg-[#34AB8A] hover:text-white"
              >
                <Download className="w-4 h-4 mr-2" />
                Export Data
              </Button>
              <label htmlFor="import-file" className="cursor-pointer">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#0E79C9] text-[#0E79C9] hover:bg-[#0E79C9] hover:text-white"
                  onClick={(e) => {
                    e.preventDefault()
                    document.getElementById('import-file')?.click()
                  }}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import Data
                </Button>
              </label>
              <input
                id="import-file"
                type="file"
                accept=".json"
                onChange={handleImportData}
                className="hidden"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 pb-24 sm:pb-8">
        {/* Stats Cards - Show first on mobile, with action buttons on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Action Cards - Hidden on mobile, shown on desktop */}
          {canCreate && (
            <Card className="bg-gradient-to-br from-[#0E79C9] to-[#0A5A96] text-white hover:shadow-xl transition-shadow cursor-pointer border-none hidden sm:block">
              <CardContent className="pt-6">
                <button
                  onClick={onCreateProject}
                  className="w-full text-left"
                >
                  <div className="flex flex-col items-center justify-center py-3 sm:py-8">
                    <div className="bg-white/20 rounded-full p-2 sm:p-4 mb-2 sm:mb-4">
                      <PlusCircle className="w-8 sm:w-12 h-8 sm:h-12" />
                    </div>
                    <h3 className="text-lg sm:text-2xl font-bold mb-1 sm:mb-2">Create New Project</h3>
                    <p className="text-white/80 text-center text-sm sm:text-base hidden sm:block">Start a new construction project</p>
                  </div>
                </button>
              </CardContent>
            </Card>
          )}

          <Card className="bg-gradient-to-br from-[#D95C00] to-[#B34C00] text-white hover:shadow-xl transition-shadow cursor-pointer border-none hidden sm:block">
            <CardContent className="pt-6">
              <button
                onClick={onOpenPlanLibrary}
                className="w-full text-left"
              >
                <div className="flex flex-col items-center justify-center py-3 sm:py-8">
                  <div className="bg-white/20 rounded-full p-2 sm:p-4 mb-2 sm:mb-4">
                    <FileText className="w-8 sm:w-12 h-8 sm:h-12" />
                  </div>
                  <h3 className="text-lg sm:text-2xl font-bold mb-1 sm:mb-2">Plan Library</h3>
                  <p className="text-white/80 text-center text-sm sm:text-base hidden sm:block">Manage plan templates</p>
                </div>
              </button>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-[#34AB8A] to-[#2a8d6f] text-white hover:shadow-xl transition-shadow cursor-pointer border-none hidden sm:block">
            <CardContent className="pt-6">
              <button
                onClick={onOpenItemLibrary}
                className="w-full text-left"
              >
                <div className="flex flex-col items-center justify-center py-3 sm:py-8">
                  <div className="bg-white/20 rounded-full p-2 sm:p-4 mb-2 sm:mb-4">
                    <DollarSign className="w-8 sm:w-12 h-8 sm:h-12" />
                  </div>
                  <h3 className="text-lg sm:text-2xl font-bold mb-1 sm:mb-2">Item Library</h3>
                  <p className="text-white/80 text-center text-sm sm:text-base hidden sm:block">Manage default rates</p>
                </div>
              </button>
            </CardContent>
          </Card>

          {onOpenDealPipeline && (
            <Card className="bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] text-white hover:shadow-xl transition-shadow cursor-pointer border-none hidden sm:block">
              <CardContent className="pt-6">
                <button
                  onClick={onOpenDealPipeline}
                  className="w-full text-left"
                >
                  <div className="flex flex-col items-center justify-center py-3 sm:py-8">
                    <div className="bg-white/20 rounded-full p-2 sm:p-4 mb-2 sm:mb-4">
                      <TrendingUp className="w-8 sm:w-12 h-8 sm:h-12" />
                    </div>
                    <h3 className="text-lg sm:text-2xl font-bold mb-1 sm:mb-2">Deal Pipeline</h3>
                    <p className="text-white/80 text-center text-sm sm:text-base hidden sm:block">Manage deals before they become projects</p>
                  </div>
                </button>
              </CardContent>
            </Card>
          )}

          {/* Stats Cards */}
          <Card className="bg-white shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Active Projects</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {projects.filter(p => p.status === 'in-progress').length}
                  </p>
                </div>
                <div className="bg-orange-100 rounded-full p-3">
                  <Building2 className="w-8 h-8 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Projects</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{projects.length}</p>
                </div>
                <div className="bg-green-100 rounded-full p-3">
                  <DollarSign className="w-8 h-8 text-green-600" />
                </div>
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
                placeholder="Search projects by name or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 text-lg"
              />
            </div>
          </CardContent>
        </Card>

        {/* Projects List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Your Projects</span>
              <span className="text-sm font-normal text-gray-600">
                {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && projects.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#0E79C9]"></div>
                <p className="mt-4 text-gray-500">Loading projects...</p>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 text-lg mb-2">
                  {searchQuery ? 'No projects found' : 'No projects yet'}
                </p>
                <p className="text-gray-500 mb-6">
                  {searchQuery ? 'Try adjusting your search' : canCreate ? 'Create your first project to get started' : 'No projects yet'}
                </p>
                {!searchQuery && canCreate && (
                  <Button
                    onClick={onCreateProject}
                    className="bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226]"
                  >
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Create Project
                  </Button>
                )}
                {!searchQuery && isViewer && (
                  <div className="flex items-center justify-center gap-2 text-gray-600">
                    <Eye className="w-5 h-5" />
                    <span>You have view-only access</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredProjects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => onSelectProject(project)}
                    className="border border-gray-200 rounded-lg p-3 sm:p-4 hover:shadow-lg hover:border-[#0E79C9] transition-all cursor-pointer bg-white"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-semibold text-gray-900">{project.name}</h3>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                            {project.status.replace('-', ' ').toUpperCase()}
                          </span>
                        </div>
                        <div className="space-y-1 text-sm text-gray-600">
                          <p className="flex items-center gap-2">
                            <Building2 className="w-4 h-4" />
                            {typeof project.address === 'string' ? project.address : project.address?.street || 'No address'}
                            {project.city && `, ${project.city}`}
                            {project.state && `, ${project.state}`}
                          </p>
                          {project.metadata?.isCustomPlan || !project.metadata?.planId ? (
                            <p className="flex items-center gap-2">
                              <FileText className="w-4 h-4" />
                              Plan: Custom
                              <span className="text-xs bg-[#0E79C9] text-white px-1.5 py-0.5 rounded">
                                Custom
                              </span>
                            </p>
                          ) : (
                            <p className="flex items-center gap-2">
                              <FileText className="w-4 h-4" />
                              Plan: {project.metadata.planId}
                            </p>
                          )}
                          <p className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Created: {project.createdAt.toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-left sm:text-right sm:ml-4 space-y-2">
                        <div>
                          <p className="text-sm text-gray-600">Estimated Value</p>
                          <p className="text-xl sm:text-2xl font-bold text-[#0E79C9]">
                            {formatCurrency(project.estimatedValue || 0)}
                          </p>
                        </div>
                        {project.actualCosts && project.actualCosts > 0 ? (
                          <div>
                            <p className="text-sm text-gray-600">Actual Costs</p>
                            <p className="text-lg sm:text-xl font-bold text-[#34AB8A]">
                              {formatCurrency(project.actualCosts)}
                            </p>
                          </div>
                        ) : null}
                        <p className="text-xs text-gray-500">
                          {project.tradeCount || 0} {project.tradeCount === 1 ? 'item' : 'items'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mobile Action Menu - Fixed at bottom */}
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40">
          {showMobileActions && (
            <div className="border-b border-gray-200 p-2 bg-gray-50 max-h-80 overflow-y-auto">
              <div className="space-y-1">
                {canCreate && (
                  <button
                    onClick={() => {
                      onCreateProject()
                      setShowMobileActions(false)
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-white rounded-lg flex items-center gap-3 transition-colors"
                  >
                    <div className="bg-[#0E79C9] text-white rounded-full p-2">
                      <PlusCircle className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">New Project</p>
                      <p className="text-xs text-gray-500">Start a new construction project</p>
                    </div>
                  </button>
                )}
                <button
                  onClick={() => {
                    onOpenPlanLibrary()
                    setShowMobileActions(false)
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-white rounded-lg flex items-center gap-3 transition-colors"
                >
                  <div className="bg-[#D95C00] text-white rounded-full p-2">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Plan Library</p>
                    <p className="text-xs text-gray-500">Manage plan templates</p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    onOpenItemLibrary()
                    setShowMobileActions(false)
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-white rounded-lg flex items-center gap-3 transition-colors"
                >
                  <div className="bg-[#34AB8A] text-white rounded-full p-2">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Item Library</p>
                    <p className="text-xs text-gray-500">Manage default rates</p>
                  </div>
                </button>
                {onOpenDealPipeline && (
                  <button
                    onClick={() => {
                      onOpenDealPipeline()
                      setShowMobileActions(false)
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-white rounded-lg flex items-center gap-3 transition-colors"
                  >
                    <div className="bg-[#0E79C9] text-white rounded-full p-2">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Deal Pipeline</p>
                      <p className="text-xs text-gray-500">Manage deals before projects</p>
                    </div>
                  </button>
                )}
                {canCreate && (
                  <button
                    onClick={() => {
                      setShowImportEstimate(true)
                      setShowMobileActions(false)
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-white rounded-lg flex items-center gap-3 transition-colors"
                  >
                    <div className="bg-[#D95C00] text-white rounded-full p-2">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Import Estimate</p>
                      <p className="text-xs text-gray-500">Import from Excel file</p>
                    </div>
                  </button>
                )}
                <button
                  onClick={() => {
                    handleExportData()
                    setShowMobileActions(false)
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-white rounded-lg flex items-center gap-3 transition-colors"
                >
                  <div className="bg-[#34AB8A] text-white rounded-full p-2">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Export Data</p>
                    <p className="text-xs text-gray-500">Download backup</p>
                  </div>
                </button>
                <label htmlFor="import-file-mobile" className="block">
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      document.getElementById('import-file-mobile')?.click()
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-white rounded-lg flex items-center gap-3 transition-colors"
                  >
                    <div className="bg-[#0E79C9] text-white rounded-full p-2">
                      <Upload className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Import Data</p>
                      <p className="text-xs text-gray-500">Restore from backup</p>
                    </div>
                  </button>
                </label>
                <input
                  id="import-file-mobile"
                  type="file"
                  accept=".json"
                  onChange={handleImportData}
                  className="hidden"
                />
              </div>
            </div>
          )}
          <div className="p-3">
            <Button
              onClick={() => setShowMobileActions(!showMobileActions)}
              className="w-full bg-gradient-to-r from-[#0E79C9] to-[#0A5A96] hover:from-[#0A5A96] hover:to-[#084577] text-white h-12"
            >
              <span className="flex items-center justify-center gap-2">
                Actions
                <ChevronDown className={`w-5 h-5 transition-transform ${showMobileActions ? 'rotate-180' : ''}`} />
              </span>
            </Button>
          </div>
        </div>
      </main>

      {/* Import Estimate Dialog */}
      <ImportEstimate
        isOpen={showImportEstimate}
        onClose={() => setShowImportEstimate(false)}
        onImportSuccess={handleImportEstimateSuccess}
        existingProjects={projects}
      />
    </div>
  )
}

