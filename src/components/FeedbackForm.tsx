// ============================================================================
// Feedback Form Component
// ============================================================================
//
// Simple form for users to submit feedback, bug reports, or feature requests
//

import React, { useState } from 'react'
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
import { X, Send, Bug, Lightbulb, MessageSquare } from 'lucide-react'
import { submitFeedback } from '@/services/feedbackService'
import type { FeedbackType } from '@/types/feedback'
import { FEEDBACK_TYPE_LABELS } from '@/types/feedback'

interface FeedbackFormProps {
  onClose: () => void
  onSuccess?: () => void
}

export function FeedbackForm({ onClose, onSuccess }: FeedbackFormProps) {
  const [type, setType] = useState<FeedbackType>('general-feedback')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!title.trim() || !description.trim()) {
      setError('Please fill in all fields')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const feedback = await submitFeedback({
        type,
        title: title.trim(),
        description: description.trim(),
      })

      if (feedback) {
        // Reset form
        setTitle('')
        setDescription('')
        setType('general-feedback')
        
        if (onSuccess) {
          onSuccess()
        } else {
          alert('✅ Thank you for your feedback! We\'ll review it soon.')
          onClose()
        }
      } else {
        setError('Failed to submit feedback. Please try again.')
      }
    } catch (err) {
      console.error('Error submitting feedback:', err)
      setError('An error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const getTypeIcon = (feedbackType: FeedbackType) => {
    switch (feedbackType) {
      case 'bug':
        return <Bug className="w-4 h-4" />
      case 'feature-request':
        return <Lightbulb className="w-4 h-4" />
      default:
        return <MessageSquare className="w-4 h-4" />
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>Submit Feedback</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="type">Type *</Label>
              <Select value={type} onValueChange={(value) => setType(value as FeedbackType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FEEDBACK_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      <div className="flex items-center gap-2">
                        {getTypeIcon(value as FeedbackType)}
                        {label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief summary of your feedback"
                className="mt-1"
                required
                maxLength={200}
              />
            </div>

            <div>
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Please provide as much detail as possible..."
                className="mt-1"
                rows={6}
                required
                maxLength={2000}
              />
              <p className="text-xs text-gray-500 mt-1">
                {description.length}/2000 characters
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                <Send className="w-4 h-4 mr-2" />
                {submitting ? 'Submitting...' : 'Submit Feedback'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
