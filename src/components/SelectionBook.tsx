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

  return (
    <div className="space-y-6">
      {/* Paint Selections */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Paint</CardTitle>
            <Label htmlFor="paint-upload" className="cursor-pointer">
              <Button
                asChild
                variant="outline"
                size="sm"
                disabled={uploadingCategory === 'paint'}
              >
                <span>
                  <Upload className="w-4 h-4 mr-2" />
                  {uploadingCategory === 'paint' ? 'Uploading...' : 'Upload Paint Image'}
                </span>
              </Button>
            </Label>
            <input
              id="paint-upload"
              type="file"
              accept="image/*"
              onChange={(e) => handleImageUpload('paint', e)}
              className="hidden"
              disabled={uploadingCategory === 'paint'}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Paint Images */}
          {getImagesForCategory('paint').length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {getImagesForCategory('paint').map((img) => {
                const imageUrl = imageUrls[img.id] || img.image_url
                return (
                  <div key={img.id} className="relative group">
                    <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={img.description || 'Paint image'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <ImageIcon className="w-6 h-6" />
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
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                    {img.description && (
                      <p className="text-xs text-gray-600 mt-1 truncate">{img.description}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Walls</Label>
              <div className="space-y-2 mt-2">
                <Input
                  placeholder="Color"
                  value={selections.paint?.walls?.color || ''}
                  onChange={(e) =>
                    updateSelection(['paint', 'walls', 'color'], e.target.value)
                  }
                />
                <Input
                  placeholder="Brand"
                  value={selections.paint?.walls?.brand || ''}
                  onChange={(e) =>
                    updateSelection(['paint', 'walls', 'brand'], e.target.value)
                  }
                />
                <Input
                  placeholder="Finish (e.g., Eggshell)"
                  value={selections.paint?.walls?.finish || ''}
                  onChange={(e) =>
                    updateSelection(['paint', 'walls', 'finish'], e.target.value)
                  }
                />
              </div>
            </div>
            <div>
              <Label>Ceiling</Label>
              <div className="space-y-2 mt-2">
                <Input
                  placeholder="Color"
                  value={selections.paint?.ceiling?.color || ''}
                  onChange={(e) =>
                    updateSelection(['paint', 'ceiling', 'color'], e.target.value)
                  }
                />
                <Input
                  placeholder="Brand"
                  value={selections.paint?.ceiling?.brand || ''}
                  onChange={(e) =>
                    updateSelection(['paint', 'ceiling', 'brand'], e.target.value)
                  }
                />
                <Input
                  placeholder="Finish (e.g., Flat)"
                  value={selections.paint?.ceiling?.finish || ''}
                  onChange={(e) =>
                    updateSelection(['paint', 'ceiling', 'finish'], e.target.value)
                  }
                />
              </div>
            </div>
            <div>
              <Label>Trim</Label>
              <div className="space-y-2 mt-2">
                <Input
                  placeholder="Color"
                  value={selections.paint?.trim?.color || ''}
                  onChange={(e) =>
                    updateSelection(['paint', 'trim', 'color'], e.target.value)
                  }
                />
                <Input
                  placeholder="Brand"
                  value={selections.paint?.trim?.brand || ''}
                  onChange={(e) =>
                    updateSelection(['paint', 'trim', 'brand'], e.target.value)
                  }
                />
                <Input
                  placeholder="Finish (e.g., Satin)"
                  value={selections.paint?.trim?.finish || ''}
                  onChange={(e) =>
                    updateSelection(['paint', 'trim', 'finish'], e.target.value)
                  }
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Flooring Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Flooring</CardTitle>
            <Label htmlFor="flooring-upload" className="cursor-pointer">
              <Button
                asChild
                variant="outline"
                size="sm"
                disabled={uploadingCategory === 'flooring'}
              >
                <span>
                  <Upload className="w-4 h-4 mr-2" />
                  {uploadingCategory === 'flooring' ? 'Uploading...' : 'Upload Flooring Image'}
                </span>
              </Button>
            </Label>
            <input
              id="flooring-upload"
              type="file"
              accept="image/*"
              onChange={(e) => handleImageUpload('flooring', e)}
              className="hidden"
              disabled={uploadingCategory === 'flooring'}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Flooring Images */}
          {getImagesForCategory('flooring').length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {getImagesForCategory('flooring').map((img) => {
                const imageUrl = imageUrls[img.id] || img.image_url
                return (
                  <div key={img.id} className="relative group">
                    <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={img.description || 'Flooring image'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <ImageIcon className="w-6 h-6" />
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
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                    {img.description && (
                      <p className="text-xs text-gray-600 mt-1 truncate">{img.description}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Type</Label>
              <Input
                placeholder="e.g., Hardwood, Tile, Carpet"
                value={selections.flooring?.type || ''}
                onChange={(e) =>
                  updateSelection(['flooring', 'type'], e.target.value)
                }
              />
            </div>
            <div>
              <Label>Material</Label>
              <Input
                placeholder="e.g., Oak, Porcelain, Wool"
                value={selections.flooring?.material || ''}
                onChange={(e) =>
                  updateSelection(['flooring', 'material'], e.target.value)
                }
              />
            </div>
            <div>
              <Label>Color</Label>
              <Input
                placeholder="Color name or code"
                value={selections.flooring?.color || ''}
                onChange={(e) =>
                  updateSelection(['flooring', 'color'], e.target.value)
                }
              />
            </div>
            <div>
              <Label>Brand</Label>
              <Input
                placeholder="Brand name"
                value={selections.flooring?.brand || ''}
                onChange={(e) =>
                  updateSelection(['flooring', 'brand'], e.target.value)
                }
              />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              placeholder="Additional flooring notes..."
              value={selections.flooring?.notes || ''}
              onChange={(e) =>
                updateSelection(['flooring', 'notes'], e.target.value)
              }
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Lighting Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lighting</CardTitle>
            <Label htmlFor="lighting-upload" className="cursor-pointer">
              <Button
                asChild
                variant="outline"
                size="sm"
                disabled={uploadingCategory === 'lighting'}
              >
                <span>
                  <Upload className="w-4 h-4 mr-2" />
                  {uploadingCategory === 'lighting' ? 'Uploading...' : 'Upload Lighting Image'}
                </span>
              </Button>
            </Label>
            <input
              id="lighting-upload"
              type="file"
              accept="image/*"
              onChange={(e) => handleImageUpload('lighting', e)}
              className="hidden"
              disabled={uploadingCategory === 'lighting'}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Lighting Images */}
          {getImagesForCategory('lighting').length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {getImagesForCategory('lighting').map((img) => {
                const imageUrl = imageUrls[img.id] || img.image_url
                return (
                  <div key={img.id} className="relative group">
                    <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={img.description || 'Lighting image'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <ImageIcon className="w-6 h-6" />
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
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                    {img.description && (
                      <p className="text-xs text-gray-600 mt-1 truncate">{img.description}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Switches</Label>
              <Input
                placeholder="Switch type/brand"
                value={selections.lighting?.switches || ''}
                onChange={(e) =>
                  updateSelection(['lighting', 'switches'], e.target.value)
                }
              />
            </div>
            <div>
              <Label>Dimmers</Label>
              <Input
                placeholder="Dimmer type/brand"
                value={selections.lighting?.dimmers || ''}
                onChange={(e) =>
                  updateSelection(['lighting', 'dimmers'], e.target.value)
                }
              />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              placeholder="Lighting fixture details, locations, etc."
              value={selections.lighting?.notes || ''}
              onChange={(e) =>
                updateSelection(['lighting', 'notes'], e.target.value)
              }
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Cabinetry & Countertops (for kitchens and bathrooms) */}
      {(roomType === 'kitchen' ||
        roomType === 'bathroom' ||
        roomType === 'custom') && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Cabinetry</CardTitle>
                <Label htmlFor="cabinetry-upload" className="cursor-pointer">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    disabled={uploadingCategory === 'cabinetry'}
                  >
                    <span>
                      <Upload className="w-4 h-4 mr-2" />
                      {uploadingCategory === 'cabinetry' ? 'Uploading...' : 'Upload Image'}
                    </span>
                  </Button>
                </Label>
                <input
                  id="cabinetry-upload"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload('cabinetry', e)}
                  className="hidden"
                  disabled={uploadingCategory === 'cabinetry'}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Cabinetry Images */}
              {getImagesForCategory('cabinetry').length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  {getImagesForCategory('cabinetry').map((img) => {
                    const imageUrl = imageUrls[img.id] || img.image_url
                    return (
                      <div key={img.id} className="relative group">
                        <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={img.description || 'Cabinetry image'}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                              <ImageIcon className="w-6 h-6" />
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
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                        {img.description && (
                          <p className="text-xs text-gray-600 mt-1 truncate">{img.description}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Style</Label>
                  <Input
                    placeholder="Cabinet style"
                    value={selections.cabinetry?.style || ''}
                    onChange={(e) =>
                      updateSelection(['cabinetry', 'style'], e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label>Color</Label>
                  <Input
                    placeholder="Cabinet color"
                    value={selections.cabinetry?.color || ''}
                    onChange={(e) =>
                      updateSelection(['cabinetry', 'color'], e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label>Brand</Label>
                  <Input
                    placeholder="e.g., Sam Mueller"
                    value={selections.cabinetry?.brand || ''}
                    onChange={(e) =>
                      updateSelection(['cabinetry', 'brand'], e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label>Hardware</Label>
                  <Input
                    placeholder="Pulls/knobs finish"
                    value={selections.cabinetry?.hardware || ''}
                    onChange={(e) =>
                      updateSelection(['cabinetry', 'hardware'], e.target.value)
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  placeholder="Additional cabinetry notes..."
                  value={selections.cabinetry?.notes || ''}
                  onChange={(e) =>
                    updateSelection(['cabinetry', 'notes'], e.target.value)
                  }
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Countertops</CardTitle>
                <Label htmlFor="countertop-upload" className="cursor-pointer">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    disabled={uploadingCategory === 'countertop'}
                  >
                    <span>
                      <Upload className="w-4 h-4 mr-2" />
                      {uploadingCategory === 'countertop' ? 'Uploading...' : 'Upload Image'}
                    </span>
                  </Button>
                </Label>
                <input
                  id="countertop-upload"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload('countertop', e)}
                  className="hidden"
                  disabled={uploadingCategory === 'countertop'}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Countertop Images */}
              {getImagesForCategory('countertop').length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  {getImagesForCategory('countertop').map((img) => {
                    const imageUrl = imageUrls[img.id] || img.image_url
                    return (
                      <div key={img.id} className="relative group">
                        <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={img.description || 'Countertop image'}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                              <ImageIcon className="w-6 h-6" />
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
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                        {img.description && (
                          <p className="text-xs text-gray-600 mt-1 truncate">{img.description}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Material</Label>
                  <Input
                    placeholder="e.g., Quartz, Granite, Marble"
                    value={selections.countertops?.material || ''}
                    onChange={(e) =>
                      updateSelection(['countertops', 'material'], e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label>Color</Label>
                  <Input
                    placeholder="Countertop color"
                    value={selections.countertops?.color || ''}
                    onChange={(e) =>
                      updateSelection(['countertops', 'color'], e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label>Brand</Label>
                  <Input
                    placeholder="Brand name"
                    value={selections.countertops?.brand || ''}
                    onChange={(e) =>
                      updateSelection(['countertops', 'brand'], e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label>Edge</Label>
                  <Input
                    placeholder="Edge profile"
                    value={selections.countertops?.edge || ''}
                    onChange={(e) =>
                      updateSelection(['countertops', 'edge'], e.target.value)
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  placeholder="Additional countertop notes..."
                  value={selections.countertops?.notes || ''}
                  onChange={(e) =>
                    updateSelection(['countertops', 'notes'], e.target.value)
                  }
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Fixtures (for bathrooms) */}
      {(roomType === 'bathroom' ||
        roomType === 'custom') && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Fixtures</CardTitle>
              <Label htmlFor="fixture-upload" className="cursor-pointer">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  disabled={uploadingCategory === 'fixture'}
                >
                  <span>
                    <Upload className="w-4 h-4 mr-2" />
                    {uploadingCategory === 'fixture' ? 'Uploading...' : 'Upload Image'}
                  </span>
                </Button>
              </Label>
              <input
                id="fixture-upload"
                type="file"
                accept="image/*"
                onChange={(e) => handleImageUpload('fixture', e)}
                className="hidden"
                disabled={uploadingCategory === 'fixture'}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Fixture Images */}
            {getImagesForCategory('fixture').length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                {getImagesForCategory('fixture').map((img) => {
                  const imageUrl = imageUrls[img.id] || img.image_url
                  return (
                    <div key={img.id} className="relative group">
                      <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={img.description || 'Fixture image'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <ImageIcon className="w-6 h-6" />
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
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                      {img.description && (
                        <p className="text-xs text-gray-600 mt-1 truncate">{img.description}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Faucets</Label>
                <Input
                  placeholder="Faucet model/finish"
                  value={selections.fixtures?.faucets || ''}
                  onChange={(e) =>
                    updateSelection(['fixtures', 'faucets'], e.target.value)
                  }
                />
              </div>
              <div>
                <Label>Sinks</Label>
                <Input
                  placeholder="Sink type/brand"
                  value={selections.fixtures?.sinks || ''}
                  onChange={(e) =>
                    updateSelection(['fixtures', 'sinks'], e.target.value)
                  }
                />
              </div>
              <div>
                <Label>Toilets</Label>
                <Input
                  placeholder="Toilet brand/model"
                  value={selections.fixtures?.toilets || ''}
                  onChange={(e) =>
                    updateSelection(['fixtures', 'toilets'], e.target.value)
                  }
                />
              </div>
              <div>
                <Label>Showers/Tubs</Label>
                <Input
                  placeholder="Shower/tub details"
                  value={selections.fixtures?.showers || ''}
                  onChange={(e) =>
                    updateSelection(['fixtures', 'showers'], e.target.value)
                  }
                />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                placeholder="Additional fixture notes..."
                value={selections.fixtures?.notes || ''}
                onChange={(e) =>
                  updateSelection(['fixtures', 'notes'], e.target.value)
                }
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hardware */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Hardware</CardTitle>
            <Label htmlFor="hardware-upload" className="cursor-pointer">
              <Button
                asChild
                variant="outline"
                size="sm"
                disabled={uploadingCategory === 'hardware'}
              >
                <span>
                  <Upload className="w-4 h-4 mr-2" />
                  {uploadingCategory === 'hardware' ? 'Uploading...' : 'Upload Image'}
                </span>
              </Button>
            </Label>
            <input
              id="hardware-upload"
              type="file"
              accept="image/*"
              onChange={(e) => handleImageUpload('hardware', e)}
              className="hidden"
              disabled={uploadingCategory === 'hardware'}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Door Handles</Label>
              <Input
                placeholder="Door handle style/finish"
                value={selections.hardware?.door_handles || ''}
                onChange={(e) =>
                  updateSelection(['hardware', 'door_handles'], e.target.value)
                }
              />
            </div>
            <div>
              <Label>Cabinet Pulls</Label>
              <Input
                placeholder="Cabinet pull style/finish"
                value={selections.hardware?.cabinet_pulls || ''}
                onChange={(e) =>
                  updateSelection(['hardware', 'cabinet_pulls'], e.target.value)
                }
              />
            </div>
            {(roomType === 'bathroom' ||
              roomType === 'custom') && (
              <>
                <div>
                  <Label>Towel Bars</Label>
                  <Input
                    placeholder="Towel bar style/finish"
                    value={selections.hardware?.towel_bars || ''}
                    onChange={(e) =>
                      updateSelection(['hardware', 'towel_bars'], e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label>Hooks & TP Holders</Label>
                  <Input
                    placeholder="Accessories style/finish"
                    value={selections.hardware?.hooks || ''}
                    onChange={(e) =>
                      updateSelection(['hardware', 'hooks'], e.target.value)
                    }
                  />
                </div>
              </>
            )}
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              placeholder="Additional hardware notes..."
              value={selections.hardware?.notes || ''}
              onChange={(e) =>
                updateSelection(['hardware', 'notes'], e.target.value)
              }
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

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

