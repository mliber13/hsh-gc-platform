// ============================================================================
// Selection Book Component
// ============================================================================
// 
// Room-by-room selection book for paint colors, flooring, lighting, etc.
// with image uploads for visual reference
//

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Textarea } from './ui/textarea'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Upload,
  X,
  Image as ImageIcon,
  Edit,
  Save,
  BookOpen,
  Printer,
  Download,
  ChevronRight,
} from 'lucide-react'
import hshLogo from '/HSH Contractor Logo - Color.png'
import {
  getOrCreateSelectionBook,
  getSelectionBookWithRooms,
  updateSelectionBook,
  createSelectionRoom,
  updateRoomSelections,
  deleteSelectionRoom,
  uploadSelectionImage,
  deleteSelectionImage,
  getSelectionImageSignedUrl,
} from '@/services/selectionBookService'
import type {
  SelectionBook as SelectionBookType,
  SelectionRoom,
  RoomSelections,
  ImageCategory,
} from '@/types/selectionBook'

interface SelectionBookProps {
  projectId: string
  project?: {
    name: string
    project_number?: string
    status: string
  }
  onBack?: () => void
}

type ViewMode = 'overview' | 'room'

// Room categories (types) - general categories
const ROOM_CATEGORIES = [
  { value: 'kitchen', label: 'Kitchen', defaultName: 'Kitchen' },
  { value: 'bathroom', label: 'Bathroom', defaultName: 'Bathroom' },
  { value: 'bedroom', label: 'Bedroom', defaultName: 'Bedroom' },
  { value: 'living-room', label: 'Living Room', defaultName: 'Living Room' },
  { value: 'dining-room', label: 'Dining Room', defaultName: 'Dining Room' },
  { value: 'hallway', label: 'Hallway', defaultName: 'Hallway' },
  { value: 'basement', label: 'Basement', defaultName: 'Basement' },
  { value: 'laundry', label: 'Laundry Room', defaultName: 'Laundry Room' },
  { value: 'mudroom', label: 'Mudroom', defaultName: 'Mudroom' },
  { value: 'entry', label: 'Entry/Foyer', defaultName: 'Entry' },
  { value: 'exterior', label: 'Exterior', defaultName: 'Exterior' },
  { value: 'custom', label: 'Custom', defaultName: 'Custom Room' },
]

// Helper to get default name for a category
const getDefaultRoomName = (category: string): string => {
  const cat = ROOM_CATEGORIES.find(c => c.value === category)
  return cat?.defaultName || 'Room'
}

const IMAGE_CATEGORIES: { value: ImageCategory; label: string }[] = [
  { value: 'paint', label: 'Paint' },
  { value: 'flooring', label: 'Flooring' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'cabinetry', label: 'Cabinetry' },
  { value: 'countertop', label: 'Countertop' },
  { value: 'fixture', label: 'Fixture' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'general', label: 'General' },
]

export const SelectionBook: React.FC<SelectionBookProps> = ({
  projectId,
  project,
  onBack,
}) => {
  const [book, setBook] = useState<SelectionBookType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('overview')
  const [selectedRoom, setSelectedRoom] = useState<SelectionRoom | null>(null)
  const [showAddRoom, setShowAddRoom] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomType, setNewRoomType] = useState<string>('')
  const [selectedQuickAddTypes, setSelectedQuickAddTypes] = useState<string[]>([])
  const [addingRoom, setAddingRoom] = useState(false)
  const [addingMultipleRooms, setAddingMultipleRooms] = useState(false)

  useEffect(() => {
    loadSelectionBook()
  }, [projectId])

  const loadSelectionBook = async () => {
    try {
      setLoading(true)
      setError(null)
      const selectionBook = await getOrCreateSelectionBook(projectId)
      if (selectionBook) {
        const fullBook = await getSelectionBookWithRooms(projectId)
        setBook(fullBook)
      } else {
        setError('Failed to load or create selection book. Please try again.')
      }
    } catch (error) {
      console.error('Error loading selection book:', error)
      setError('An error occurred while loading the selection book. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleAddRoom = async () => {
    if (!book || !newRoomName.trim()) return

    setAddingRoom(true)
    setError(null)
    try {
      const room = await createSelectionRoom(
        book.id,
        newRoomName.trim(),
        newRoomType || undefined
      )

      if (room) {
        await loadSelectionBook()
        setNewRoomName('')
        setNewRoomType('')
        setShowAddRoom(false)
      } else {
        setError('Failed to create room. Please check your permissions and try again.')
      }
    } catch (error) {
      console.error('Error adding room:', error)
      setError('An error occurred while adding the room. Please try again.')
    } finally {
      setAddingRoom(false)
    }
  }

  const handleQuickAddRooms = async () => {
    if (!book || selectedQuickAddTypes.length === 0) return

    setAddingMultipleRooms(true)
    setError(null)
    try {
      let successCount = 0
      let failCount = 0

      for (const category of selectedQuickAddTypes) {
        const defaultName = getDefaultRoomName(category)
        const room = await createSelectionRoom(
          book.id,
          defaultName,
          category
        )

        if (room) {
          successCount++
        } else {
          failCount++
        }
      }

      if (successCount > 0) {
        await loadSelectionBook()
        setSelectedQuickAddTypes([])
        setShowQuickAdd(false)
        
        if (failCount > 0) {
          setError(`Added ${successCount} room(s), but ${failCount} failed.`)
        }
      } else {
        setError('Failed to create rooms. Please check your permissions and try again.')
      }
    } catch (error) {
      console.error('Error adding rooms:', error)
      setError('An error occurred while adding rooms. Please try again.')
    } finally {
      setAddingMultipleRooms(false)
    }
  }

  const handleRoomTypeChange = (category: string) => {
    const value = category || ''
    setNewRoomType(value)
    // Auto-populate name if empty, but allow user to customize
    if (value && !newRoomName.trim()) {
      setNewRoomName(getDefaultRoomName(value))
    }
  }

  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm('Are you sure you want to delete this room? All images and selections will be lost.')) {
      return
    }

    const success = await deleteSelectionRoom(roomId)
    if (success) {
      await loadSelectionBook()
      if (selectedRoom?.id === roomId) {
        setSelectedRoom(null)
        setViewMode('overview')
      }
    }
  }

  const handleViewRoom = (room: SelectionRoom) => {
    setSelectedRoom(room)
    setViewMode('room')
  }

  const handleBackToOverview = () => {
    setViewMode('overview')
    setSelectedRoom(null)
    loadSelectionBook() // Reload to get latest data
  }

  const handlePrint = () => {
    window.print()
  }

  const handleExport = async () => {
    if (!book) return

    const exportData = {
      book: {
        title: book.title,
        description: book.description,
        status: book.status,
        created_at: book.created_at,
      },
      rooms: book.rooms?.map(room => ({
        room_name: room.room_name,
        room_type: room.room_type,
        selections: room.selections,
        images: room.images?.map(img => ({
          category: img.category,
          description: img.description,
          image_url: img.image_url,
        })),
      })),
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${book.title || 'Selection Book'}-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading selection book...</p>
        </div>
      </div>
    )
  }

  if (!book && !loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <p className="text-red-600 mb-4">{error || 'Error loading selection book'}</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={loadSelectionBook} variant="outline">
              Retry
            </Button>
            {onBack && (
              <Button onClick={onBack}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center space-x-3 sm:space-x-4">
              {onBack && viewMode === 'overview' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBack}
                  className="mr-2 text-gray-600 hover:text-gray-900"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Back to Project</span>
                  <span className="sm:hidden">Back</span>
                </Button>
              )}
              {viewMode === 'room' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBackToOverview}
                  className="mr-2 text-gray-600 hover:text-gray-900"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Rooms
                </Button>
              )}
              <img src={hshLogo} alt="HSH Contractor" className="h-16 sm:h-20 lg:h-24 w-auto" />
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-1">
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">
                    {viewMode === 'overview' ? 'Selection Book' : selectedRoom?.room_name}
                  </h1>
                  {project?.project_number && (
                    <span className="px-2 sm:px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 w-fit">
                      #{project.project_number}
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-gray-600">
                  {viewMode === 'overview'
                    ? `${book?.rooms?.length || 0} rooms`
                    : 'Room selections'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {viewMode === 'overview' && (
                <>
                  <Button
                    variant="outline"
                    onClick={handleExport}
                    className="hidden sm:flex"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handlePrint}
                    className="hidden sm:flex"
                  >
                    <Printer className="w-4 h-4 mr-2" />
                    Print
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setError(null)}
              className="mt-2"
            >
              Dismiss
            </Button>
          </div>
        )}
        {viewMode === 'overview' && book ? (
          <OverviewView
            book={book}
            onViewRoom={handleViewRoom}
            onDeleteRoom={handleDeleteRoom}
            showAddRoom={showAddRoom}
            setShowAddRoom={setShowAddRoom}
            showQuickAdd={showQuickAdd}
            setShowQuickAdd={setShowQuickAdd}
            newRoomName={newRoomName}
            setNewRoomName={setNewRoomName}
            newRoomType={newRoomType}
            setNewRoomType={handleRoomTypeChange}
            onAddRoom={handleAddRoom}
            addingRoom={addingRoom}
            selectedQuickAddTypes={selectedQuickAddTypes}
            setSelectedQuickAddTypes={setSelectedQuickAddTypes}
            onQuickAddRooms={handleQuickAddRooms}
            addingMultipleRooms={addingMultipleRooms}
          />
        ) : selectedRoom ? (
          <RoomView
            room={selectedRoom}
            project={project}
            onSave={async (selections) => {
              await updateRoomSelections(selectedRoom.id, selections)
              await loadSelectionBook()
              const updatedBook = await getSelectionBookWithRooms(projectId)
              if (updatedBook) {
                const updatedRoom = updatedBook.rooms?.find(r => r.id === selectedRoom.id)
                if (updatedRoom) {
                  setSelectedRoom(updatedRoom)
                }
              }
            }}
            onImageUpload={async (file, category, description) => {
              const image = await uploadSelectionImage(
                selectedRoom.id,
                file,
                category,
                description
              )
              if (image) {
                await loadSelectionBook()
                const updatedBook = await getSelectionBookWithRooms(projectId)
                if (updatedBook) {
                  const updatedRoom = updatedBook.rooms?.find(r => r.id === selectedRoom.id)
                  if (updatedRoom) {
                    setSelectedRoom(updatedRoom)
                  }
                }
              }
            }}
            onImageDelete={async (imageId) => {
              const success = await deleteSelectionImage(imageId)
              if (success) {
                await loadSelectionBook()
                const updatedBook = await getSelectionBookWithRooms(projectId)
                if (updatedBook) {
                  const updatedRoom = updatedBook.rooms?.find(r => r.id === selectedRoom.id)
                  if (updatedRoom) {
                    setSelectedRoom(updatedRoom)
                  }
                }
              }
            }}
          />
        ) : null}
      </main>
    </div>
  )
}

// ============================================================================
// Overview View Component
// ============================================================================

interface OverviewViewProps {
  book: SelectionBookType
  onViewRoom: (room: SelectionRoom) => void
  onDeleteRoom: (roomId: string) => void
  showAddRoom: boolean
  setShowAddRoom: (show: boolean) => void
  showQuickAdd: boolean
  setShowQuickAdd: (show: boolean) => void
  newRoomName: string
  setNewRoomName: (name: string) => void
  newRoomType: string
  setNewRoomType: (type: string) => void
  onAddRoom: () => void
  addingRoom: boolean
  selectedQuickAddTypes: string[]
  setSelectedQuickAddTypes: (types: string[]) => void
  onQuickAddRooms: () => void
  addingMultipleRooms: boolean
}

const OverviewView: React.FC<OverviewViewProps> = ({
  book,
  onViewRoom,
  onDeleteRoom,
  showAddRoom,
  setShowAddRoom,
  showQuickAdd,
  setShowQuickAdd,
  newRoomName,
  setNewRoomName,
  newRoomType,
  setNewRoomType,
  onAddRoom,
  addingRoom,
  selectedQuickAddTypes,
  setSelectedQuickAddTypes,
  onQuickAddRooms,
  addingMultipleRooms,
}) => {
  const toggleQuickAddType = (type: string) => {
    if (selectedQuickAddTypes.includes(type)) {
      setSelectedQuickAddTypes(selectedQuickAddTypes.filter(t => t !== type))
    } else {
      setSelectedQuickAddTypes([...selectedQuickAddTypes, type])
    }
  }

  return (
    <div className="space-y-6">
      {/* Quick Add Section */}
      {showQuickAdd ? (
        <Card>
          <CardHeader>
            <CardTitle>Quick Add Multiple Rooms</CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Select multiple room categories to add them all at once with default names
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label>Select Room Categories</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2">
                  {ROOM_CATEGORIES.map((category) => (
                    <button
                      key={category.value}
                      type="button"
                      onClick={() => toggleQuickAddType(category.value)}
                      className={`p-3 rounded-lg border-2 text-left transition-colors ${
                        selectedQuickAddTypes.includes(category.value)
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                          selectedQuickAddTypes.includes(category.value)
                            ? 'border-blue-500 bg-blue-500'
                            : 'border-gray-300'
                        }`}>
                          {selectedQuickAddTypes.includes(category.value) && (
                            <span className="text-white text-xs">✓</span>
                          )}
                        </div>
                        <span className="text-sm font-medium">{category.label}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 ml-6">
                        Will create: "{category.defaultName}"
                      </p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={onQuickAddRooms} 
                  disabled={selectedQuickAddTypes.length === 0 || addingMultipleRooms}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {addingMultipleRooms 
                    ? `Adding ${selectedQuickAddTypes.length} room(s)...` 
                    : `Add ${selectedQuickAddTypes.length} Room(s)`}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowQuickAdd(false)
                    setSelectedQuickAddTypes([])
                  }} 
                  disabled={addingMultipleRooms}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : showAddRoom ? (
        <Card>
          <CardHeader>
            <CardTitle>Add New Room</CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Room Name is the specific identifier (e.g., "Master Bedroom"). 
              Room Category helps organize and show relevant selection fields.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="roomName">Room Name *</Label>
                <Input
                  id="roomName"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="e.g., Master Bedroom, Guest Bathroom"
                />
                <p className="text-xs text-gray-500 mt-1">
                  The specific name for this room
                </p>
              </div>
              <div>
                <Label htmlFor="roomType">Room Category (Optional)</Label>
                <Select value={newRoomType || undefined} onValueChange={setNewRoomType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROOM_CATEGORIES.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  Category helps show relevant selection fields (e.g., cabinetry for kitchens)
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={onAddRoom} disabled={!newRoomName.trim() || addingRoom}>
                  <Plus className="w-4 h-4 mr-2" />
                  {addingRoom ? 'Adding...' : 'Add Room'}
                </Button>
                <Button variant="outline" onClick={() => setShowAddRoom(false)} disabled={addingRoom}>
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setShowQuickAdd(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Quick Add Rooms
          </Button>
          <Button onClick={() => setShowAddRoom(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Single Room
          </Button>
        </div>
      )}

      {/* Rooms Grid */}
      {book.rooms && book.rooms.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {book.rooms.map((room) => (
            <Card
              key={room.id}
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => onViewRoom(room)}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {room.room_name}
                    </h3>
                    {room.room_type && (
                      <p className="text-sm text-gray-500 capitalize">
                        {room.room_type.replace('-', ' ')}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteRoom(room.id)
                    }}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                {room.images && room.images.length > 0 && (
                  <div className="mb-4">
                    <div className="grid grid-cols-2 gap-2">
                      {room.images.slice(0, 4).map((img) => (
                        <div
                          key={img.id}
                          className="aspect-square rounded-lg overflow-hidden bg-gray-100"
                        >
                          <img
                            src={img.image_url}
                            alt={img.description || 'Room image'}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                    {room.images.length > 4 && (
                      <p className="text-xs text-gray-500 mt-2">
                        +{room.images.length - 4} more images
                      </p>
                    )}
                  </div>
                )}
                <div className="flex items-center text-sm text-gray-600">
                  <span>View room →</span>
                  <ChevronRight className="w-4 h-4 ml-1" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="text-center py-12">
          <CardContent>
            <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No rooms yet
            </h3>
            <p className="text-gray-500 mb-6">
              Add your first room to start building your selection book.
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => setShowQuickAdd(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Quick Add Rooms
              </Button>
              <Button onClick={() => setShowAddRoom(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Single Room
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============================================================================
// Room View Component
// ============================================================================

interface RoomViewProps {
  room: SelectionRoom
  project?: {
    name: string
    project_number?: string
    status: string
  }
  onSave: (selections: RoomSelections) => Promise<void>
  onImageUpload: (
    file: File,
    category?: ImageCategory,
    description?: string
  ) => Promise<void>
  onImageDelete: (imageId: string) => Promise<void>
}

const RoomView: React.FC<RoomViewProps> = ({
  room,
  project,
  onSave,
  onImageUpload,
  onImageDelete,
}) => {
  const [selections, setSelections] = useState<RoomSelections>(room.selections || {})
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadCategory, setUploadCategory] = useState<ImageCategory>('general')
  const [uploadDescription, setUploadDescription] = useState('')
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})

  // Generate signed URLs for images when component mounts or room changes
  useEffect(() => {
    const loadImageUrls = async () => {
      if (!room.images || room.images.length === 0) {
        setImageUrls({})
        return
      }

      const urls: Record<string, string> = {}
      for (const img of room.images) {
        // If image_url is already a valid URL, use it
        if (img.image_url && (img.image_url.startsWith('http://') || img.image_url.startsWith('https://'))) {
          urls[img.id] = img.image_url
        } else if (img.image_path) {
          // Generate signed URL from image_path
          const signedUrl = await getSelectionImageSignedUrl(img.image_path)
          if (signedUrl) {
            urls[img.id] = signedUrl
          }
        }
      }
      setImageUrls(urls)
    }

    loadImageUrls()
  }, [room.images, room.id]) // Also depend on room.id to force refresh when room changes

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(selections)
    } finally {
      setSaving(false)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      alert('Image size must be less than 10MB')
      return
    }

    setUploading(true)
    try {
      await onImageUpload(file, uploadCategory, uploadDescription || undefined)
      setUploadDescription('')
      // Reset file input
      e.target.value = ''
    } catch (error) {
      console.error('Error uploading image:', error)
      alert('Failed to upload image. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Room Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">{room.room_name}</CardTitle>
              {room.room_type && (
                <p className="text-sm text-gray-500 mt-1 capitalize">
                  {room.room_type.replace('-', ' ')}
                </p>
              )}
            </div>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Selections Forms */}
      <SelectionsForm
        selections={selections}
        onChange={setSelections}
        roomType={room.room_type}
        room={room}
        onImageUpload={onImageUpload}
        onImageDelete={onImageDelete}
        imageUrls={imageUrls}
      />
    </div>
  )
}

// ============================================================================
// Selections Form Component
// ============================================================================

interface SelectionsFormProps {
  selections: RoomSelections
  onChange: (selections: RoomSelections) => void
  roomType?: string
  room: SelectionRoom
  onImageUpload: (
    file: File,
    category?: ImageCategory,
    description?: string
  ) => Promise<void>
  onImageDelete: (imageId: string) => Promise<void>
  imageUrls: Record<string, string>
}

const SelectionsForm: React.FC<SelectionsFormProps> = ({
  selections,
  onChange,
  roomType,
  room,
  onImageUpload,
  onImageDelete,
  imageUrls,
}) => {
  const [uploadingCategory, setUploadingCategory] = useState<ImageCategory | null>(null)
  const [expandedCategory, setExpandedCategory] = useState<ImageCategory | null>(null)

  const updateSelection = (path: string[], value: any) => {
    const newSelections = { ...selections }
    let current: any = newSelections

    for (let i = 0; i < path.length - 1; i++) {
      if (!current[path[i]]) {
        current[path[i]] = {}
      }
      current = current[path[i]]
    }

    current[path[path.length - 1]] = value
    onChange(newSelections)
  }

  const handleImageUpload = async (category: ImageCategory, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      alert('Image size must be less than 10MB')
      return
    }

    setUploadingCategory(category)
    try {
      await onImageUpload(file, category)
      // Reset file input
      e.target.value = ''
    } catch (error) {
      console.error('Error uploading image:', error)
      alert('Failed to upload image. Please try again.')
    } finally {
      setUploadingCategory(null)
    }
  }

  const getImagesForCategory = (category: ImageCategory) => {
    return room.images?.filter(img => img.category === category) || []
  }

  const getPrimaryImage = (category: ImageCategory) => {
    const images = getImagesForCategory(category)
    return images.length > 0 ? images[0] : null
  }

  const getCategorySummary = (category: ImageCategory) => {
    switch (category) {
      case 'paint':
        const wallColor = selections.paint?.walls?.color
        return wallColor || 'No color selected'
      case 'flooring':
        return selections.flooring?.type || selections.flooring?.material || 'No selection'
      case 'lighting':
        return selections.lighting?.switches || selections.lighting?.dimmers || 'No selection'
      case 'cabinetry':
        return selections.cabinetry?.style || selections.cabinetry?.color || 'No selection'
      case 'countertop':
        return selections.countertops?.material || selections.countertops?.color || 'No selection'
      case 'fixture':
        return selections.fixtures?.faucets || selections.fixtures?.sinks || 'No selection'
      case 'hardware':
        return selections.hardware?.door_handles || selections.hardware?.cabinet_pulls || 'No selection'
      default:
        return 'No details'
    }
  }

  // Render a compact category card
  const renderCategoryCard = (
    category: ImageCategory,
    title: string
  ) => {
    const primaryImage = getPrimaryImage(category)
    const imageUrl = primaryImage ? (imageUrls[primaryImage.id] || primaryImage.image_url) : null
    const summary = getCategorySummary(category)
    const isExpanded = expandedCategory === category
    const allImages = getImagesForCategory(category)

    return (
      <Card key={category} className="overflow-hidden">
        <div className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">
          {/* Image Thumbnail */}
          <div className="flex-shrink-0">
            <Label htmlFor={`${category}-upload`} className="cursor-pointer">
              <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 border-2 border-dashed border-gray-300 hover:border-blue-400 transition-colors flex items-center justify-center relative group">
                {imageUrl ? (
                  <>
                    <img
                      src={imageUrl}
                      alt={title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-opacity flex items-center justify-center">
                      <Upload className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <ImageIcon className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                    <span className="text-xs text-gray-400">Add Image</span>
                  </div>
                )}
              </div>
            </Label>
            <input
              id={`${category}-upload`}
              type="file"
              accept="image/*"
              onChange={(e) => handleImageUpload(category, e)}
              className="hidden"
              disabled={uploadingCategory === category}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-gray-900 mb-1">{title}</h3>
                <p className="text-xs text-gray-500 mb-1 truncate">{summary}</p>
                {primaryImage?.description && (
                  <p className="text-xs text-gray-400 truncate">{primaryImage.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {allImages.length > 1 && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                    +{allImages.length - 1} more
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedCategory(isExpanded ? null : category)}
                  className="text-xs h-7"
                >
                  {isExpanded ? 'Hide' : 'Details'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="border-t bg-gray-50 p-4 space-y-4">
            {/* All Images Grid */}
            {allImages.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {allImages.map((img) => {
                  const imgUrl = imageUrls[img.id] || img.image_url
                  return (
                    <div key={img.id} className="relative group">
                      <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                        {imgUrl ? (
                          <img
                            src={imgUrl}
                            alt={img.description || title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <ImageIcon className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (confirm('Delete this image?')) {
                            onImageDelete(img.id)
                          }
                        }}
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Category-specific form fields */}
            {category === 'paint' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs font-medium">Walls</Label>
                  <div className="space-y-2 mt-1">
                    <Input
                      placeholder="Color"
                      value={selections.paint?.walls?.color || ''}
                      onChange={(e) => updateSelection(['paint', 'walls', 'color'], e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder="Brand"
                      value={selections.paint?.walls?.brand || ''}
                      onChange={(e) => updateSelection(['paint', 'walls', 'brand'], e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder="Finish"
                      value={selections.paint?.walls?.finish || ''}
                      onChange={(e) => updateSelection(['paint', 'walls', 'finish'], e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium">Ceiling</Label>
                  <div className="space-y-2 mt-1">
                    <Input
                      placeholder="Color"
                      value={selections.paint?.ceiling?.color || ''}
                      onChange={(e) => updateSelection(['paint', 'ceiling', 'color'], e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder="Brand"
                      value={selections.paint?.ceiling?.brand || ''}
                      onChange={(e) => updateSelection(['paint', 'ceiling', 'brand'], e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder="Finish"
                      value={selections.paint?.ceiling?.finish || ''}
                      onChange={(e) => updateSelection(['paint', 'ceiling', 'finish'], e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium">Trim</Label>
                  <div className="space-y-2 mt-1">
                    <Input
                      placeholder="Color"
                      value={selections.paint?.trim?.color || ''}
                      onChange={(e) => updateSelection(['paint', 'trim', 'color'], e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder="Brand"
                      value={selections.paint?.trim?.brand || ''}
                      onChange={(e) => updateSelection(['paint', 'trim', 'brand'], e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder="Finish"
                      value={selections.paint?.trim?.finish || ''}
                      onChange={(e) => updateSelection(['paint', 'trim', 'finish'], e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {category === 'flooring' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  placeholder="Type (e.g., Hardwood, Tile)"
                  value={selections.flooring?.type || ''}
                  onChange={(e) => updateSelection(['flooring', 'type'], e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Material (e.g., Oak, Porcelain)"
                  value={selections.flooring?.material || ''}
                  onChange={(e) => updateSelection(['flooring', 'material'], e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Color"
                  value={selections.flooring?.color || ''}
                  onChange={(e) => updateSelection(['flooring', 'color'], e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Brand"
                  value={selections.flooring?.brand || ''}
                  onChange={(e) => updateSelection(['flooring', 'brand'], e.target.value)}
                  className="h-8 text-sm"
                />
                <Textarea
                  placeholder="Notes"
                  value={selections.flooring?.notes || ''}
                  onChange={(e) => updateSelection(['flooring', 'notes'], e.target.value)}
                  className="text-sm md:col-span-2"
                  rows={2}
                />
              </div>
            )}

            {category === 'lighting' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    placeholder="Switches"
                    value={selections.lighting?.switches || ''}
                    onChange={(e) => updateSelection(['lighting', 'switches'], e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Input
                    placeholder="Dimmers"
                    value={selections.lighting?.dimmers || ''}
                    onChange={(e) => updateSelection(['lighting', 'dimmers'], e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <Textarea
                  placeholder="Notes"
                  value={selections.lighting?.notes || ''}
                  onChange={(e) => updateSelection(['lighting', 'notes'], e.target.value)}
                  className="text-sm"
                  rows={2}
                />
              </div>
            )}

            {category === 'cabinetry' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  placeholder="Style"
                  value={selections.cabinetry?.style || ''}
                  onChange={(e) => updateSelection(['cabinetry', 'style'], e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Color"
                  value={selections.cabinetry?.color || ''}
                  onChange={(e) => updateSelection(['cabinetry', 'color'], e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Brand"
                  value={selections.cabinetry?.brand || ''}
                  onChange={(e) => updateSelection(['cabinetry', 'brand'], e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Hardware"
                  value={selections.cabinetry?.hardware || ''}
                  onChange={(e) => updateSelection(['cabinetry', 'hardware'], e.target.value)}
                  className="h-8 text-sm"
                />
                <Textarea
                  placeholder="Notes"
                  value={selections.cabinetry?.notes || ''}
                  onChange={(e) => updateSelection(['cabinetry', 'notes'], e.target.value)}
                  className="text-sm md:col-span-2"
                  rows={2}
                />
              </div>
            )}

            {category === 'countertop' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  placeholder="Material"
                  value={selections.countertops?.material || ''}
                  onChange={(e) => updateSelection(['countertops', 'material'], e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Color"
                  value={selections.countertops?.color || ''}
                  onChange={(e) => updateSelection(['countertops', 'color'], e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Brand"
                  value={selections.countertops?.brand || ''}
                  onChange={(e) => updateSelection(['countertops', 'brand'], e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Edge"
                  value={selections.countertops?.edge || ''}
                  onChange={(e) => updateSelection(['countertops', 'edge'], e.target.value)}
                  className="h-8 text-sm"
                />
                <Textarea
                  placeholder="Notes"
                  value={selections.countertops?.notes || ''}
                  onChange={(e) => updateSelection(['countertops', 'notes'], e.target.value)}
                  className="text-sm md:col-span-2"
                  rows={2}
                />
              </div>
            )}

            {category === 'fixture' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  placeholder="Faucets"
                  value={selections.fixtures?.faucets || ''}
                  onChange={(e) => updateSelection(['fixtures', 'faucets'], e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Sinks"
                  value={selections.fixtures?.sinks || ''}
                  onChange={(e) => updateSelection(['fixtures', 'sinks'], e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Toilets"
                  value={selections.fixtures?.toilets || ''}
                  onChange={(e) => updateSelection(['fixtures', 'toilets'], e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Showers/Tubs"
                  value={selections.fixtures?.showers || ''}
                  onChange={(e) => updateSelection(['fixtures', 'showers'], e.target.value)}
                  className="h-8 text-sm"
                />
                <Textarea
                  placeholder="Notes"
                  value={selections.fixtures?.notes || ''}
                  onChange={(e) => updateSelection(['fixtures', 'notes'], e.target.value)}
                  className="text-sm md:col-span-2"
                  rows={2}
                />
              </div>
            )}

            {category === 'hardware' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  placeholder="Door Handles"
                  value={selections.hardware?.door_handles || ''}
                  onChange={(e) => updateSelection(['hardware', 'door_handles'], e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Cabinet Pulls"
                  value={selections.hardware?.cabinet_pulls || ''}
                  onChange={(e) => updateSelection(['hardware', 'cabinet_pulls'], e.target.value)}
                  className="h-8 text-sm"
                />
                {(roomType === 'bathroom' || roomType === 'custom') && (
                  <>
                    <Input
                      placeholder="Towel Bars"
                      value={selections.hardware?.towel_bars || ''}
                      onChange={(e) => updateSelection(['hardware', 'towel_bars'], e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder="Hooks & TP Holders"
                      value={selections.hardware?.hooks || ''}
                      onChange={(e) => updateSelection(['hardware', 'hooks'], e.target.value)}
                      className="h-8 text-sm"
                    />
                  </>
                )}
                <Textarea
                  placeholder="Notes"
                  value={selections.hardware?.notes || ''}
                  onChange={(e) => updateSelection(['hardware', 'notes'], e.target.value)}
                  className="text-sm md:col-span-2"
                  rows={2}
                />
              </div>
            )}
          </div>
        )}
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* Paint */}
      {renderCategoryCard('paint', 'Paint')}

      {/* Flooring */}
      {renderCategoryCard('flooring', 'Flooring')}

      {/* Lighting */}
      {renderCategoryCard('lighting', 'Lighting')}

      {/* Cabinetry & Countertops (for kitchens and bathrooms) */}
      {(roomType === 'kitchen' ||
        roomType === 'bathroom' ||
        roomType === 'custom') && (
        <>
          {renderCategoryCard('cabinetry', 'Cabinetry')}
          {renderCategoryCard('countertop', 'Countertops')}
        </>
      )}

      {/* Fixtures (for bathrooms) */}
      {(roomType === 'bathroom' ||
        roomType === 'custom') && (
        renderCategoryCard('fixture', 'Fixtures')
      )}

      {/* Hardware */}
      {renderCategoryCard('hardware', 'Hardware')}

      {/* General Notes */}
      <Card>
        <CardHeader>
          <CardTitle>General Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Additional notes about this room..."
            value={selections.notes || ''}
            onChange={(e) => updateSelection(['notes'], e.target.value)}
            rows={4}
          />
        </CardContent>
      </Card>
    </div>
  )
}

