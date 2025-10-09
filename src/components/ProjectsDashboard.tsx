// ============================================================================
// HSH GC Platform - Projects Dashboard
// ============================================================================
//
// Main dashboard for viewing and managing all projects
//

import React, { useState, useEffect } from 'react'
import { Project } from '@/types'
import { getAllProjects } from '@/services/projectService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PlusCircle, Search, Building2, Calendar, DollarSign, FileText } from 'lucide-react'
import hshLogo from '/HSH Contractor Logo - Color.png'

interface ProjectsDashboardProps {
  onCreateProject: () => void
  onSelectProject: (project: Project) => void
  onOpenPlanLibrary: () => void
}

export function ProjectsDashboard({ onCreateProject, onSelectProject, onOpenPlanLibrary }: ProjectsDashboardProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const allProjects = getAllProjects()
    setProjects(allProjects)
  }, [])

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.address?.street?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.city?.toLowerCase().includes(searchQuery.toLowerCase())
  )

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <img src={hshLogo} alt="HSH Contractor" className="h-20 sm:h-24 lg:h-28 w-auto" />
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Projects Dashboard</h1>
                <p className="text-xs sm:text-sm text-gray-600 mt-1 hidden sm:block">Manage your construction projects</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 pb-24 sm:pb-8">
        {/* Stats Cards - Show first on mobile, with action buttons on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Action Cards - Hidden on mobile, shown on desktop */}
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

          {/* Stats Cards */}
          <Card className="bg-white shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Active Projects</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {projects.filter(p => p.status === 'in-progress' || p.status === 'awarded').length}
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
                placeholder="Search projects by name, client, or address..."
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
            {filteredProjects.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 text-lg mb-2">
                  {searchQuery ? 'No projects found' : 'No projects yet'}
                </p>
                <p className="text-gray-500 mb-6">
                  {searchQuery ? 'Try adjusting your search' : 'Create your first project to get started'}
                </p>
                {!searchQuery && (
                  <Button
                    onClick={onCreateProject}
                    className="bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226]"
                  >
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Create Project
                  </Button>
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
                            {project.client.name}
                          </p>
                          <p className="ml-6">
                            {typeof project.address === 'string' ? project.address : project.address?.street || 'No address'}
                            {project.city && `, ${project.city}`}
                            {project.state && `, ${project.state}`}
                          </p>
                          <p className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Created: {project.createdAt.toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-left sm:text-right sm:ml-4">
                        <p className="text-sm text-gray-600">Estimated Value</p>
                        <p className="text-xl sm:text-2xl font-bold text-[#0E79C9]">
                          {formatCurrency(project.estimate?.totals?.totalEstimated || 0)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {project.estimate?.trades?.length || 0} {project.estimate?.trades?.length === 1 ? 'item' : 'items'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mobile Action Buttons - Fixed at bottom */}
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg z-40">
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={onCreateProject}
              className="bg-gradient-to-r from-[#0E79C9] to-[#0A5A96] hover:from-[#0A5A96] hover:to-[#084577] text-white h-12"
            >
              <PlusCircle className="w-5 h-5 mr-2" />
              New Project
            </Button>
            <Button
              onClick={onOpenPlanLibrary}
              className="bg-gradient-to-r from-[#D95C00] to-[#B34C00] hover:from-[#B34C00] hover:to-[#8A3900] text-white h-12"
            >
              <FileText className="w-5 h-5 mr-2" />
              Plan Library
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}

