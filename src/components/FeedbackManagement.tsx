// ============================================================================
// Feedback Management Component (Admin Only)
// ============================================================================
//
// Admin view to manage all feedback submissions
//

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
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
  Filter,
  Trash2,
  Edit,
  CheckCircle2,
  XCircle,
  Clock,
  Bug,
  Lightbulb,
  MessageSquare,
} from 'lucide-react'
import {
  getFeedback,
  updateFeedback,
  deleteFeedback,
  getFeedbackStats,
} from '@/services/feedbackService'
import type {
  Feedback,
  FeedbackStatus,
  FeedbackType,
} from '@/types/feedback'
import {
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUS_COLORS,
} from '@/types/feedback'

interface FeedbackManagementProps {
  onBack: () => void
}

export function FeedbackManagement({ onBack }: FeedbackManagementProps) {
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [editingFeedback, setEditingFeedback] = useState<Feedback | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<FeedbackStatus>('new')

  useEffect(() => {
    loadFeedback()
  }, [])

  const loadFeedback = async () => {
    setLoading(true)
    try {
      const allFeedback = await getFeedback()
      setFeedback(allFeedback)
    } catch (error) {
      console.error('Error loading feedback:', error)
    } finally {
      setLoading(false)
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
      alert('Failed to update admin notes')
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
            <h1 className="text-3xl font-bold text-gray-900">Feedback Management</h1>
            <p className="text-gray-500 mt-1">Review and manage user feedback</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="search">Search</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  id="search"
                  placeholder="Search feedback..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
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
              <Label htmlFor="type">Type</Label>
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
              <p className="mt-4 text-gray-500">Loading feedback...</p>
            </div>
          </CardContent>
        </Card>
      ) : filteredFeedback.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No feedback found</p>
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
                        {FEEDBACK_STATUS_LABELS[item.status]}
                      </span>
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {FEEDBACK_TYPE_LABELS[item.type]}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      Submitted {formatDate(item.submitted_at)}
                    </p>
                  </div>
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
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label className="text-gray-500">Description</Label>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap mt-1">
                      {item.description}
                    </p>
                  </div>

                  {item.admin_notes && (
                    <div>
                      <Label className="text-gray-500">Admin Notes</Label>
                      <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded mt-1 whitespace-pre-wrap">
                        {item.admin_notes}
                      </p>
                    </div>
                  )}

                  {editingFeedback?.id === item.id && (
                    <div className="border-t pt-4 space-y-4">
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
                        <Label htmlFor="admin_notes">Admin Notes</Label>
                        <Textarea
                          id="admin_notes"
                          value={adminNotes}
                          onChange={(e) => setAdminNotes(e.target.value)}
                          placeholder="Internal notes (not visible to submitter)"
                          className="mt-1"
                          rows={3}
                        />
                        <Button
                          size="sm"
                          className="mt-2"
                          onClick={() => handleUpdateNotes(item.id)}
                        >
                          Save Notes
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
          ))}
        </div>
      )}
    </div>
  )
}

