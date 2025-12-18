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
} from '@/services/selectionBookService'
import type {
  SelectionBook,
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

const ROOM_TYPES = [
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'bathroom', label: 'Bathroom' },
  { value: 'master-bath', label: 'Master Bath' },
  { value: 'bedroom', label: 'Bedroom' },
  { value: 'master-bedroom', label: 'Master Bedroom' },
  { value: 'living-room', label: 'Living Room' },
  { value: 'dining-room', label: 'Dining Room' },
  { value: 'hallway', label: 'Hallway' },
  { value: 'basement', label: 'Basement' },
  { value: 'laundry', label: 'Laundry' },
  { value: 'mudroom', label: 'Mudroom' },
  { value: 'entry', label: 'Entry' },
  { value: 'exterior', label: 'Exterior' },
  { value: 'custom', label: 'Custom' },
]

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
  const [book, setBook] = useState<SelectionBook | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('overview')
  const [selectedRoom, setSelectedRoom] = useState<SelectionRoom | null>(null)
  const [showAddRoom, setShowAddRoom] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomType, setNewRoomType] = useState<string>('')

  useEffect(() => {
    loadSelectionBook()
  }, [projectId])

  const loadSelectionBook = async () => {
    try {
      setLoading(true)
      const selectionBook = await getOrCreateSelectionBook(projectId)
      if (selectionBook) {
        const fullBook = await getSelectionBookWithRooms(projectId)
        setBook(fullBook)
      }
    } catch (error) {
      console.error('Error loading selection book:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddRoom = async () => {
    if (!book || !newRoomName.trim()) return

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

  if (!book) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Error loading selection book</p>
          <Button onClick={onBack} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
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
                    ? `${book.rooms?.length || 0} rooms`
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
        {viewMode === 'overview' ? (
          <OverviewView
            book={book}
            onViewRoom={handleViewRoom}
            onDeleteRoom={handleDeleteRoom}
            showAddRoom={showAddRoom}
            setShowAddRoom={setShowAddRoom}
            newRoomName={newRoomName}
            setNewRoomName={setNewRoomName}
            newRoomType={newRoomType}
            setNewRoomType={setNewRoomType}
            onAddRoom={handleAddRoom}
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
  book: SelectionBook
  onViewRoom: (room: SelectionRoom) => void
  onDeleteRoom: (roomId: string) => void
  showAddRoom: boolean
  setShowAddRoom: (show: boolean) => void
  newRoomName: string
  setNewRoomName: (name: string) => void
  newRoomType: string
  setNewRoomType: (type: string) => void
  onAddRoom: () => void
}

const OverviewView: React.FC<OverviewViewProps> = ({
  book,
  onViewRoom,
  onDeleteRoom,
  showAddRoom,
  setShowAddRoom,
  newRoomName,
  setNewRoomName,
  newRoomType,
  setNewRoomType,
  onAddRoom,
}) => {
  return (
    <div className="space-y-6">
      {/* Add Room Section */}
      {showAddRoom ? (
        <Card>
          <CardHeader>
            <CardTitle>Add New Room</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="roomName">Room Name</Label>
                <Input
                  id="roomName"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="e.g., Master Bedroom"
                />
              </div>
              <div>
                <Label htmlFor="roomType">Room Type (Optional)</Label>
                <Select value={newRoomType} onValueChange={setNewRoomType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select room type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {ROOM_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button onClick={onAddRoom} disabled={!newRoomName.trim()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Room
                </Button>
                <Button variant="outline" onClick={() => setShowAddRoom(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex justify-end">
          <Button onClick={() => setShowAddRoom(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Room
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
            <Button onClick={() => setShowAddRoom(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Room
            </Button>
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

      {/* Image Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Upload Controls */}
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="imageCategory">Category</Label>
                <Select
                  value={uploadCategory}
                  onValueChange={(value) => setUploadCategory(value as ImageCategory)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMAGE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="imageDescription">Description (Optional)</Label>
                <Input
                  id="imageDescription"
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  placeholder="e.g., Paint swatch - SW 7004"
                />
              </div>
              <div>
                <Label htmlFor="imageUpload" className="cursor-pointer">
                  <Button
                    asChild
                    variant="outline"
                    disabled={uploading}
                    className="w-full"
                  >
                    <span>
                      <Upload className="w-4 h-4 mr-2" />
                      {uploading ? 'Uploading...' : 'Upload Image'}
                    </span>
                  </Button>
                </Label>
                <input
                  id="imageUpload"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </div>
            </div>

            {/* Image Gallery */}
            {room.images && room.images.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-6">
                {room.images.map((img) => (
                  <div key={img.id} className="relative group">
                    <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                      <img
                        src={img.image_url}
                        alt={img.description || 'Room image'}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity rounded-lg flex items-center justify-center">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (confirm('Delete this image?')) {
                            onImageDelete(img.id)
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    {img.category && (
                      <div className="absolute top-2 left-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                        {IMAGE_CATEGORIES.find(c => c.value === img.category)?.label}
                      </div>
                    )}
                    {img.description && (
                      <p className="text-xs text-gray-600 mt-1 truncate">
                        {img.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No images uploaded yet</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Selections Forms */}
      <SelectionsForm
        selections={selections}
        onChange={setSelections}
        roomType={room.room_type}
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
}

const SelectionsForm: React.FC<SelectionsFormProps> = ({
  selections,
  onChange,
  roomType,
}) => {
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

  return (
    <div className="space-y-6">
      {/* Paint Selections */}
      <Card>
        <CardHeader>
          <CardTitle>Paint</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
          <CardTitle>Flooring</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
          <CardTitle>Lighting</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
        roomType === 'master-bath' ||
        roomType === 'custom') && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Cabinetry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
              <CardTitle>Countertops</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
        roomType === 'master-bath' ||
        roomType === 'custom') && (
        <Card>
          <CardHeader>
            <CardTitle>Fixtures</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
          <CardTitle>Hardware</CardTitle>
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
              roomType === 'master-bath' ||
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

