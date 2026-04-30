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
  Edit,
  Trash2,
} from 'lucide-react'
import { getFeedback, updateFeedback, deleteFeedback } from '@/services/feedbackService'
import { getCurrentUserProfile } from '@/services/userService'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import type { Feedback, FeedbackType, FeedbackStatus } from '@/types/feedback'
import {
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_STATUS_LABELS,
} from '@/types/feedback'
import { useAuth } from '@/contexts/AuthContext'
import { usePageTitle } from '@/contexts/PageTitleContext'

interface MyFeedbackProps {
  onBack: () => void
  onNewFeedback: () => void
}

export function MyFeedback({ onBack, onNewFeedback }: MyFeedbackProps) {
  const { user } = useAuth()
  usePageTitle('Feedback')
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [isAdmin, setIsAdmin] = useState(false)
  const [editingFeedback, setEditingFeedback] = useState<Feedback | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<FeedbackStatus>('new')

  useEffect(() => {
    loadFeedback()
    loadUserProfile()
  }, [])

  const loadUserProfile = async () => {
    if (user) {
      const profile = await getCurrentUserProfile()
      if (profile) {
        setIsAdmin(profile.role === 'admin')
      }
    }
  }

  const handleUpdateStatus = async (feedbackId: string, status: FeedbackStatus) => {
    const success = await updateFeedback(feedbackId, { status })
    if (success) {
      await loadFeedback()
      setEditingFeedback(null)
    } else {
      alert('Failed to update feedback status')
    }
  }

  const handleUpdateNotes = async (feedbackId: string) => {
    const success = await updateFeedback(feedbackId, { admin_notes: adminNotes })
    if (success) {
      await loadFeedback()
      setEditingFeedback(null)
      setAdminNotes('')
    } else {
      alert('Failed to update admin response')
    }
  }

  const handleDelete = async (feedbackId: string) => {
    if (!confirm('Are you sure you want to delete this feedback?')) {
      return
    }

    const success = await deleteFeedback(feedbackId)
    if (success) {
      await loadFeedback()
    } else {
      alert('Failed to delete feedback')
    }
  }

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
      // Show all feedback for transparency
      setFeedback(allFeedback)
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

  const statusVisual = (status: FeedbackStatus) => {
    switch (status) {
      case 'completed':
        return { bg: 'bg-sky-500/15', text: 'text-sky-500', border: 'border-sky-500/30', dot: 'bg-sky-500' }
      case 'in-progress':
        return { bg: 'bg-amber-500/15', text: 'text-amber-500', border: 'border-amber-500/30', dot: 'bg-amber-500' }
      case 'new':
        return { bg: 'bg-violet-500/15', text: 'text-violet-500', border: 'border-violet-500/30', dot: 'bg-violet-500' }
      default:
        return { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border', dot: 'bg-muted-foreground' }
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <Button onClick={onNewFeedback}>
          <MessageSquare className="mr-2 h-4 w-4" />
          New Feedback
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-border/60 bg-card/50">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="search" className="text-sm font-medium text-foreground">Search</label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
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
              <label htmlFor="status" className="text-sm font-medium text-foreground">Status</label>
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
              <label htmlFor="type" className="text-sm font-medium text-foreground">Type</label>
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
        <Card className="border-border/60 bg-card/50">
          <CardContent className="py-12 text-center">
            <div className="mx-auto inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Loading your feedback...</p>
          </CardContent>
        </Card>
      ) : filteredFeedback.length === 0 ? (
        <Card className="border-border/60 bg-card/50">
          <CardContent className="py-12 text-center">
              <MessageSquare className="mx-auto mb-3 size-12 text-muted-foreground/50" />
              <p className="mb-2 text-lg font-medium text-foreground">
                {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
                  ? 'No feedback found matching your filters'
                  : 'No feedback submitted yet'}
              </p>
              <p className="mb-6 text-sm text-muted-foreground">
                {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'Be the first to share your ideas, report bugs, or request features'}
              </p>
              <Button onClick={onNewFeedback}>
                <MessageSquare className="w-4 h-4 mr-2" />
                Submit Your First Feedback
              </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredFeedback.map((item) => {
            const visual = statusVisual(item.status)
            return (
            <Card key={item.id} className="border-border/60 bg-card/50">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getTypeIcon(item.type)}
                      <CardTitle className="text-lg">{item.title}</CardTitle>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${visual.bg} ${visual.text} ${visual.border}`}>
                        <span className={`size-1.5 rounded-full ${visual.dot}`} />
                        <span>{FEEDBACK_STATUS_LABELS[item.status]}</span>
                      </span>
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {FEEDBACK_TYPE_LABELS[item.type]}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
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
                  {isAdmin && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingFeedback(item)
                          setAdminNotes(item.admin_notes || '')
                          setSelectedStatus(item.status)
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(item.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Description</label>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                      {item.description}
                    </p>
                  </div>

                  {item.admin_notes && (
                    <div className="border-t border-border/60 pt-4">
                      <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <MessageSquare className="w-4 h-4" />
                        Admin Response
                      </label>
                      <p className="mt-1 whitespace-pre-wrap rounded bg-muted/30 p-3 text-sm text-foreground">
                        {item.admin_notes}
                      </p>
                    </div>
                  )}

                  {isAdmin && editingFeedback?.id === item.id && (
                    <div className="space-y-4 border-t border-border/60 pt-4">
                      <div>
                        <Label htmlFor="status">Update Status</Label>
                        <Select
                          value={selectedStatus}
                          onValueChange={(value) => setSelectedStatus(value as FeedbackStatus)}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(FEEDBACK_STATUS_LABELS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          className="mt-2"
                          onClick={() => handleUpdateStatus(item.id, selectedStatus)}
                        >
                          Update Status
                        </Button>
                      </div>

                      <div>
                        <Label htmlFor="admin_notes">Admin Response</Label>
                        <p className="mb-1 text-xs text-muted-foreground">
                          This response will be visible to all team members (transparent system)
                        </p>
                        <Textarea
                          id="admin_notes"
                          value={adminNotes}
                          onChange={(e) => setAdminNotes(e.target.value)}
                          placeholder="Add your response or update on this feedback..."
                          className="mt-1"
                          rows={4}
                        />
                        <Button
                          size="sm"
                          className="mt-2"
                          onClick={() => handleUpdateNotes(item.id)}
                        >
                          Save Response
                        </Button>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingFeedback(null)
                          setAdminNotes('')
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )})}
        </div>
      )}
    </div>
  )
}

