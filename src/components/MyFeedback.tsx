// ============================================================================
// My Feedback Component
// ============================================================================
//
// User-facing view to see their own submitted feedback and status
//

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import {
  ArrowLeft,
  Search,
  Bug,
  Lightbulb,
  MessageSquare,
  CheckCircle2,
  Clock,
  XCircle,
  User as UserIcon,
} from 'lucide-react'
import { getFeedback } from '@/services/feedbackService'
import type { Feedback, FeedbackType } from '@/types/feedback'
import {
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUS_COLORS,
} from '@/types/feedback'
import { useAuth } from '@/contexts/AuthContext'

interface MyFeedbackProps {
  onBack: () => void
  onNewFeedback: () => void
}

export function MyFeedback({ onBack, onNewFeedback }: MyFeedbackProps) {
  const { user } = useAuth()
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  useEffect(() => {
    loadFeedback()
  }, [])

  // Expose refresh function to parent
  useEffect(() => {
    // This will be called when component mounts or when parent triggers refresh
    const handleRefresh = () => {
      loadFeedback()
    }
    // Store refresh function on window for parent to call if needed
    ;(window as any).refreshMyFeedback = handleRefresh
    return () => {
      delete (window as any).refreshMyFeedback
    }
  }, [])

  const loadFeedback = async () => {
    setLoading(true)
    try {
      const allFeedback = await getFeedback()
      // Filter to only show current user's feedback
      const myFeedback = allFeedback.filter((item) => item.submitted_by === user?.id)
      setFeedback(myFeedback)
    } catch (error) {
      console.error('Error loading feedback:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredFeedback = feedback.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter
    const matchesType = typeFilter === 'all' || item.type === typeFilter
    return matchesSearch && matchesStatus && matchesType
  })

  const getTypeIcon = (type: FeedbackType) => {
    switch (type) {
      case 'bug':
        return <Bug className="w-4 h-4" />
      case 'feature-request':
        return <Lightbulb className="w-4 h-4" />
      default:
        return <MessageSquare className="w-4 h-4" />
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-600" />
      default:
        return <Clock className="w-4 h-4 text-yellow-600" />
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Feedback & Feature Requests</h1>
            <p className="text-gray-500 mt-1">View all feedback, feature requests, and their status</p>
          </div>
        </div>
        <Button onClick={onNewFeedback}>
          <MessageSquare className="w-4 h-4 mr-2" />
          New Feedback
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="search" className="text-sm font-medium text-gray-700">Search</label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  id="search"
                  placeholder="Search your feedback..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <label htmlFor="status" className="text-sm font-medium text-gray-700">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(FEEDBACK_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="type" className="text-sm font-medium text-gray-700">Type</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(FEEDBACK_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feedback List */}
      {loading ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#0E79C9]"></div>
              <p className="mt-4 text-gray-500">Loading your feedback...</p>
            </div>
          </CardContent>
        </Card>
      ) : filteredFeedback.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 text-lg mb-2">
                {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
                  ? 'No feedback found matching your filters'
                  : 'No feedback submitted yet'}
              </p>
              <p className="text-gray-500 mb-6">
                {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'Be the first to share your ideas, report bugs, or request features'}
              </p>
              <Button onClick={onNewFeedback}>
                <MessageSquare className="w-4 h-4 mr-2" />
                Submit Your First Feedback
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredFeedback.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getTypeIcon(item.type)}
                      <CardTitle className="text-lg">{item.title}</CardTitle>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${FEEDBACK_STATUS_COLORS[item.status]}`}>
                        {getStatusIcon(item.status)}
                        <span className="ml-1">{FEEDBACK_STATUS_LABELS[item.status]}</span>
                      </span>
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {FEEDBACK_TYPE_LABELS[item.type]}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <UserIcon className="w-3 h-3" />
                        <span>Submitted by {item.submitted_by === user?.id ? 'you' : 'team member'}</span>
                      </div>
                      <span>•</span>
                      <span>Submitted {formatDate(item.submitted_at)}</span>
                      {item.resolved_at && (
                        <>
                          <span>•</span>
                          <span>Resolved {formatDate(item.resolved_at)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Description</label>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap mt-1">
                      {item.description}
                    </p>
                  </div>

                  {item.admin_notes && (
                    <div className="border-t pt-4">
                      <label className="text-sm font-medium text-gray-500 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" />
                        Admin Response
                      </label>
                      <p className="text-sm text-gray-700 bg-blue-50 p-3 rounded mt-1 whitespace-pre-wrap">
                        {item.admin_notes}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

