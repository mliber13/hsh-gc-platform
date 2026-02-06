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
  ChevronDown,
  ChevronUp,
  FileText,
  ArrowUp,
  ArrowDown,
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
  uploadSelectionSpecSheet,
  deleteSelectionSpecSheet,
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

  const handleViewRoom = async (room: SelectionRoom) => {
    // Reload the room data to ensure we have all images and latest data
    const updatedBook = await getSelectionBookWithRooms(projectId)
    if (updatedBook) {
      const updatedRoom = updatedBook.rooms?.find(r => r.id === room.id)
      if (updatedRoom) {
        setSelectedRoom(updatedRoom)
      } else {
        // Fallback to the room passed in if not found
        setSelectedRoom(room)
      }
    } else {
      // Fallback to the room passed in if book reload fails
      setSelectedRoom(room)
    }
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
              const result = await uploadSelectionImage(
                selectedRoom.id,
                file,
                category,
                description
              )
              if (result.image) {
                await loadSelectionBook()
                const updatedBook = await getSelectionBookWithRooms(projectId)
                if (updatedBook) {
                  const updatedRoom = updatedBook.rooms?.find(r => r.id === selectedRoom.id)
                  if (updatedRoom) {
                    setSelectedRoom(updatedRoom)
                  }
                }
              } else if (result.error) {
                throw new Error(result.error)
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
            onSpecSheetUpload={async (file, category, description) => {
              const result = await uploadSelectionSpecSheet(
                selectedRoom.id,
                file,
                category,
                description
              )
              if (result.specSheet) {
                await loadSelectionBook()
                const updatedBook = await getSelectionBookWithRooms(projectId)
                if (updatedBook) {
                  const updatedRoom = updatedBook.rooms?.find(r => r.id === selectedRoom.id)
                  if (updatedRoom) {
                    setSelectedRoom(updatedRoom)
                  }
                }
              } else if (result.error) {
                throw new Error(result.error)
              }
            }}
            onSpecSheetDelete={async (specSheetId) => {
              const success = await deleteSelectionSpecSheet(specSheetId)
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
  onSpecSheetUpload: (
    file: File,
    category: string,
    description?: string
  ) => Promise<void>
  onSpecSheetDelete: (specSheetId: string) => Promise<void>
}

const RoomView: React.FC<RoomViewProps> = ({
  room,
  project,
  onSave,
  onImageUpload,
  onImageDelete,
  onSpecSheetUpload,
  onSpecSheetDelete,
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
  }, [room]) // Depend on entire room object to catch all changes

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
      const msg = error instanceof Error ? error.message : 'Failed to upload image. Please try again.'
      alert(msg)
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
        onSpecSheetUpload={onSpecSheetUpload}
        onSpecSheetDelete={onSpecSheetDelete}
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
  onSpecSheetUpload: (
    file: File,
    category: string,
    description?: string
  ) => Promise<void>
  onSpecSheetDelete: (specSheetId: string) => Promise<void>
  imageUrls: Record<string, string>
}

const SelectionsForm: React.FC<SelectionsFormProps> = ({
  selections,
  onChange,
  roomType,
  room,
  onImageUpload,
  onImageDelete,
  onSpecSheetUpload,
  onSpecSheetDelete,
  imageUrls,
}) => {
  const [uploadingCategory, setUploadingCategory] = useState<ImageCategory | null>(null)
  const [expandedCategory, setExpandedCategory] = useState<ImageCategory | null>(null)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

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
      const msg = error instanceof Error ? error.message : 'Failed to upload image. Please try again.'
      alert(msg)
    } finally {
      setUploadingCategory(null)
      e.target.value = '' // Reset so same file can be selected again
    }
  }

  const getImagesForCategory = (category: ImageCategory) => {
    return room.images?.filter(img => img.category === category) || []
  }

  const getPrimaryImage = (category: ImageCategory) => {
    const images = getImagesForCategory(category)
    return images.length > 0 ? images[0] : null
  }

  const getSpecSheetsForCategory = (category: string) => {
    return room.specSheets?.filter(sheet => sheet.category === category) || []
  }

  const handleSpecSheetUpload = async (category: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type (PDF or image)
    const isValidType = file.type === 'application/pdf' || file.type.startsWith('image/')
    if (!isValidType) {
      alert('Please select a PDF or image file')
      return
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB')
      return
    }

    setUploadingCategory(category as ImageCategory)
    try {
      await onSpecSheetUpload(file, category)
      // Reset file input
      e.target.value = ''
    } catch (error) {
      console.error('Error uploading spec sheet:', error)
      const msg = error instanceof Error ? error.message : 'Failed to upload. Please try again.'
      alert(msg)
    } finally {
      setUploadingCategory(null)
      e.target.value = '' // Reset so same file can be selected again
    }
  }

  const getCategorySummary = (category: ImageCategory) => {
    // Check if it's a custom category
    if (selections.customCategories && selections.customCategories[category]) {
      const customCat = selections.customCategories[category]
      // Try to get first detail value or notes
      if (customCat.details && Object.keys(customCat.details).length > 0) {
        return Object.values(customCat.details)[0] || customCat.notes || 'No details'
      }
      return customCat.notes || 'No details'
    }
    
    // Standard categories
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

  const handleAddCustomCategory = () => {
    if (!newCategoryName.trim()) return
    
    const categoryName = newCategoryName.trim()
    const newSelections = { ...selections }
    
    if (!newSelections.customCategories) {
      newSelections.customCategories = {}
    }
    
    // Check if category already exists
    if (newSelections.customCategories[categoryName]) {
      alert('This category already exists')
      return
    }
    
    newSelections.customCategories[categoryName] = {
      name: categoryName,
      details: {},
      notes: '',
    }
    
    // Add to category order
    if (!newSelections.categoryOrder) {
      newSelections.categoryOrder = []
    }
    newSelections.categoryOrder.push(categoryName)
    
    onChange(newSelections)
    setNewCategoryName('')
    setShowAddCategory(false)
  }

  const handleDeleteCustomCategory = (categoryName: string) => {
    if (!confirm(`Delete category "${categoryName}"? This will also remove all associated images and spec sheets.`)) {
      return
    }
    
    const newSelections = { ...selections }
    if (newSelections.customCategories) {
      delete newSelections.customCategories[categoryName]
      if (Object.keys(newSelections.customCategories).length === 0) {
        delete newSelections.customCategories
      }
    }
    
    // Remove from category order
    if (newSelections.categoryOrder) {
      newSelections.categoryOrder = newSelections.categoryOrder.filter(cat => cat !== categoryName)
      if (newSelections.categoryOrder.length === 0) {
        delete newSelections.categoryOrder
      }
    }
    
    onChange(newSelections)
    
    // Also delete images associated with this category
    const imagesToDelete = room.images?.filter(img => img.category === categoryName) || []
    imagesToDelete.forEach(img => onImageDelete(img.id))
    
    // Also delete spec sheets associated with this category
    const specSheetsToDelete = room.specSheets?.filter(sheet => sheet.category === categoryName) || []
    specSheetsToDelete.forEach(sheet => onSpecSheetDelete(sheet.id))
  }

  const handleDeleteDefaultCategory = (category: ImageCategory) => {
    if (!confirm(`Delete category "${category}"? This will clear all selections and remove all associated images and spec sheets.`)) {
      return
    }
    
    const newSelections = { ...selections }
    
    // Clear the category data
    switch (category) {
      case 'paint':
        delete newSelections.paint
        break
      case 'flooring':
        delete newSelections.flooring
        break
      case 'lighting':
        delete newSelections.lighting
        break
      case 'cabinetry':
        delete newSelections.cabinetry
        break
      case 'countertop':
        delete newSelections.countertops
        break
      case 'fixture':
        delete newSelections.fixtures
        break
      case 'hardware':
        delete newSelections.hardware
        break
    }
    
    // Remove from category order
    if (newSelections.categoryOrder) {
      newSelections.categoryOrder = newSelections.categoryOrder.filter(cat => cat !== category)
      if (newSelections.categoryOrder.length === 0) {
        delete newSelections.categoryOrder
      }
    }
    
    onChange(newSelections)
    
    // Also delete images associated with this category
    const imagesToDelete = room.images?.filter(img => img.category === category) || []
    imagesToDelete.forEach(img => onImageDelete(img.id))
    
    // Also delete spec sheets associated with this category
    const specSheetsToDelete = room.specSheets?.filter(sheet => sheet.category === category) || []
    specSheetsToDelete.forEach(sheet => onSpecSheetDelete(sheet.id))
  }

  const handleMoveCategory = (category: string, direction: 'up' | 'down') => {
    const newSelections = { ...selections }
    if (!newSelections.categoryOrder) {
      // Initialize with categories that have data or images
      const defaultCategories: string[] = []
      const hasImagesForCategory = (cat: string): boolean => {
        return (room.images?.some(img => img.category === cat) || 
                room.specSheets?.some(sheet => sheet.category === cat)) || false
      }
      
      if (selections.paint || hasImagesForCategory('paint')) defaultCategories.push('paint')
      if (selections.flooring || hasImagesForCategory('flooring')) defaultCategories.push('flooring')
      if (selections.lighting || hasImagesForCategory('lighting')) defaultCategories.push('lighting')
      if (selections.cabinetry || hasImagesForCategory('cabinetry')) defaultCategories.push('cabinetry')
      if (selections.countertops || hasImagesForCategory('countertop')) defaultCategories.push('countertop')
      if (selections.fixtures || hasImagesForCategory('fixture')) defaultCategories.push('fixture')
      if (selections.hardware || hasImagesForCategory('hardware')) defaultCategories.push('hardware')
      
      // Add custom categories from selections
      if (selections.customCategories) {
        defaultCategories.push(...Object.keys(selections.customCategories))
      }
      
      // Add custom categories from images/spec sheets
      const defaultCategoryValues = ['paint', 'flooring', 'lighting', 'cabinetry', 'countertop', 'fixture', 'hardware', 'general']
      const customFromImages = new Set<string>()
      room.images?.forEach(img => {
        if (img.category && !defaultCategoryValues.includes(img.category) && !selections.customCategories?.[img.category]) {
          customFromImages.add(img.category)
        }
      })
      room.specSheets?.forEach(sheet => {
        if (sheet.category && !defaultCategoryValues.includes(sheet.category) && !selections.customCategories?.[sheet.category]) {
          customFromImages.add(sheet.category)
        }
      })
      defaultCategories.push(...Array.from(customFromImages))
      
      newSelections.categoryOrder = defaultCategories
    }
    
    const order = [...newSelections.categoryOrder]
    const index = order.indexOf(category)
    if (index === -1) return
    
    if (direction === 'up' && index > 0) {
      [order[index], order[index - 1]] = [order[index - 1], order[index]]
    } else if (direction === 'down' && index < order.length - 1) {
      [order[index], order[index + 1]] = [order[index + 1], order[index]]
    } else {
      return // Can't move further
    }
    
    newSelections.categoryOrder = order
    onChange(newSelections)
  }

  // Get ordered list of categories to display
  const getOrderedCategories = (): Array<{ type: 'default' | 'custom'; value: string; label: string }> => {
    const defaultCategories: Array<{ type: 'default' | 'custom'; value: string; label: string }> = []
    
    // Helper to check if a category has images
    const hasImagesForCategory = (category: string): boolean => {
      return (room.images?.some(img => img.category === category) || 
              room.specSheets?.some(sheet => sheet.category === category)) || false
    }
    
    // Add default categories that have data OR images
    if (selections.paint || hasImagesForCategory('paint')) {
      defaultCategories.push({ type: 'default', value: 'paint', label: 'Paint' })
    }
    if (selections.flooring || hasImagesForCategory('flooring')) {
      defaultCategories.push({ type: 'default', value: 'flooring', label: 'Flooring' })
    }
    if (selections.lighting || hasImagesForCategory('lighting')) {
      defaultCategories.push({ type: 'default', value: 'lighting', label: 'Lighting' })
    }
    if (selections.cabinetry || hasImagesForCategory('cabinetry')) {
      defaultCategories.push({ type: 'default', value: 'cabinetry', label: 'Cabinetry' })
    }
    if (selections.countertops || hasImagesForCategory('countertop')) {
      defaultCategories.push({ type: 'default', value: 'countertop', label: 'Countertops' })
    }
    if (selections.fixtures || hasImagesForCategory('fixture')) {
      defaultCategories.push({ type: 'default', value: 'fixture', label: 'Fixtures' })
    }
    if (selections.hardware || hasImagesForCategory('hardware')) {
      defaultCategories.push({ type: 'default', value: 'hardware', label: 'Hardware' })
    }
    
    // Add custom categories (from selections or from images)
    const customCategoryNames = new Set<string>()
    
    // Add custom categories from selections
    if (selections.customCategories) {
      Object.keys(selections.customCategories).forEach(catName => {
        customCategoryNames.add(catName)
      })
    }
    
    // Add custom categories from images/spec sheets (categories that aren't default categories)
    const defaultCategoryValues = ['paint', 'flooring', 'lighting', 'cabinetry', 'countertop', 'fixture', 'hardware', 'general']
    room.images?.forEach(img => {
      if (img.category && !defaultCategoryValues.includes(img.category)) {
        customCategoryNames.add(img.category)
      }
    })
    room.specSheets?.forEach(sheet => {
      if (sheet.category && !defaultCategoryValues.includes(sheet.category)) {
        customCategoryNames.add(sheet.category)
      }
    })
    
    // Add all custom categories
    customCategoryNames.forEach(catName => {
      defaultCategories.push({ type: 'custom', value: catName, label: catName })
    })
    
    // If there's a custom order, use it; otherwise use default order
    if (selections.categoryOrder && selections.categoryOrder.length > 0) {
      const ordered: Array<{ type: 'default' | 'custom'; value: string; label: string }> = []
      const categoryMap = new Map(defaultCategories.map(cat => [cat.value, cat]))
      
      // Add categories in the specified order
      selections.categoryOrder.forEach(catValue => {
        const cat = categoryMap.get(catValue)
        if (cat) {
          ordered.push(cat)
          categoryMap.delete(catValue)
        }
      })
      
      // Add any remaining categories that weren't in the order
      categoryMap.forEach(cat => ordered.push(cat))
      
      return ordered
    }
    
    return defaultCategories
  }

  const updateCustomCategory = (categoryName: string, field: 'notes' | 'details', value: any) => {
    const newSelections = { ...selections }
    if (!newSelections.customCategories) {
      newSelections.customCategories = {}
    }
    if (!newSelections.customCategories[categoryName]) {
      newSelections.customCategories[categoryName] = {
        name: categoryName,
        details: {},
        notes: '',
      }
    }
    
    if (field === 'notes') {
      newSelections.customCategories[categoryName].notes = value
    } else {
      newSelections.customCategories[categoryName].details = value
    }
    
    onChange(newSelections)
  }

  const updateCustomCategoryDetail = (categoryName: string, key: string, value: string) => {
    const newSelections = { ...selections }
    if (!newSelections.customCategories) {
      newSelections.customCategories = {}
    }
    if (!newSelections.customCategories[categoryName]) {
      newSelections.customCategories[categoryName] = {
        name: categoryName,
        details: {},
        notes: '',
      }
    }
    
    if (!newSelections.customCategories[categoryName].details) {
      newSelections.customCategories[categoryName].details = {}
    }
    
    if (value.trim() === '') {
      // Remove empty detail
      const { [key]: _, ...rest } = newSelections.customCategories[categoryName].details!
      newSelections.customCategories[categoryName].details = rest
    } else {
      newSelections.customCategories[categoryName].details![key] = value
    }
    
    onChange(newSelections)
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
    const specSheets = getSpecSheetsForCategory(category as string)

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
              <div className="flex-1 min-w-0 pr-2">
                <h3 className="font-semibold text-sm text-gray-900 mb-1">{title}</h3>
                <p className="text-xs text-gray-500 mb-1 truncate">{summary}</p>
                {primaryImage?.description && (
                  <p className="text-xs text-gray-400 truncate">{primaryImage.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {allImages.length > 1 && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded hidden sm:inline">
                    +{allImages.length - 1}
                  </span>
                )}
                {/* Spec Sheet Icon */}
                {specSheets.length > 0 && (
                  <div className="flex items-center gap-0.5" title={`${specSheets.length} spec sheet${specSheets.length > 1 ? 's' : ''}`}>
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-xs text-blue-600 hidden sm:inline">{specSheets.length}</span>
                  </div>
                )}
                {/* Spec Sheet Upload Button */}
                <Label htmlFor={`${category}-spec-upload`} className="cursor-pointer">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-1.5 sm:px-2"
                    asChild
                  >
                    <span>
                      <FileText className="w-3 h-3 sm:mr-1" />
                      <span className="hidden sm:inline">Add Spec</span>
                    </span>
                  </Button>
                </Label>
                <input
                  id={`${category}-spec-upload`}
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => handleSpecSheetUpload(category as string, e)}
                  className="hidden"
                  disabled={uploadingCategory === category}
                />
                {/* Reorder Buttons */}
                <div className="flex flex-col gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMoveCategory(category, 'up')}
                    className="h-3 w-6 p-0"
                    title="Move up"
                    disabled={(() => {
                      const ordered = getOrderedCategories()
                      const index = ordered.findIndex(cat => cat.value === category)
                      return index <= 0
                    })()}
                  >
                    <ArrowUp className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMoveCategory(category, 'down')}
                    className="h-3 w-6 p-0"
                    title="Move down"
                    disabled={(() => {
                      const ordered = getOrderedCategories()
                      const index = ordered.findIndex(cat => cat.value === category)
                      return index >= ordered.length - 1
                    })()}
                  >
                    <ArrowDown className="w-3 h-3" />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedCategory(isExpanded ? null : category)}
                  className="text-xs h-7 px-1.5 sm:px-2"
                >
                  <span className="hidden sm:inline">{isExpanded ? 'Hide' : 'Details'}</span>
                  <span className="sm:hidden">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </span>
                </Button>
                {/* Delete Button for Default Categories */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteDefaultCategory(category)}
                  className="text-xs h-7 px-1.5 sm:px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                  title="Delete category"
                >
                  <Trash2 className="w-4 h-4" />
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

            {/* Spec Sheets Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-medium">Spec Sheets</Label>
                <Label htmlFor={`${category}-spec-upload-expanded`} className="cursor-pointer">
                  <Button variant="outline" size="sm" className="text-xs h-7" asChild>
                    <span>
                      <Plus className="w-3 h-3 mr-1" />
                      Add Spec Sheet
                    </span>
                  </Button>
                </Label>
                <input
                  id={`${category}-spec-upload-expanded`}
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => handleSpecSheetUpload(category as string, e)}
                  className="hidden"
                  disabled={uploadingCategory === category}
                />
              </div>
              {specSheets.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {specSheets.map((sheet) => (
                    <div
                      key={sheet.id}
                      className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-blue-400 transition-colors group"
                    >
                      <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <a
                        href={sheet.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline truncate max-w-[200px]"
                        title={sheet.file_name}
                      >
                        {sheet.file_name}
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm('Delete this spec sheet?')) {
                            onSpecSheetDelete(sheet.id)
                          }
                        }}
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">No spec sheets uploaded</p>
              )}
            </div>

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

            {/* Custom Category Form */}
            {selections.customCategories && selections.customCategories[category] && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(selections.customCategories[category].details || {}).map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs font-medium capitalize">{key.replace(/_/g, ' ')}</Label>
                      <Input
                        value={value || ''}
                        onChange={(e) => updateCustomCategoryDetail(category, key, e.target.value)}
                        className="h-8 text-sm"
                        placeholder={`Enter ${key.replace(/_/g, ' ')}...`}
                      />
                    </div>
                  ))}
                  {/* Add new detail field */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-500">Add Detail Field</Label>
                    <Input
                      placeholder="Field name (e.g., Brand, Model)"
                      className="h-8 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const fieldName = e.currentTarget.value.trim().toLowerCase().replace(/\s+/g, '_')
                          if (fieldName && !selections.customCategories?.[category]?.details?.[fieldName]) {
                            updateCustomCategoryDetail(category, fieldName, '')
                            e.currentTarget.value = ''
                          }
                        }
                      }}
                    />
                  </div>
                </div>
                <Textarea
                  placeholder="Notes"
                  value={selections.customCategories[category].notes || ''}
                  onChange={(e) => updateCustomCategory(category, 'notes', e.target.value)}
                  className="text-sm"
                  rows={2}
                />
              </div>
            )}
          </div>
        )}
      </Card>
    )
  }

  // Get ordered categories
  const orderedCategories = getOrderedCategories()
  
  // Filter categories based on room type
  const visibleCategories = orderedCategories.filter(cat => {
    if (cat.type === 'custom') return true
    // Show cabinetry and countertops only for kitchens, bathrooms, and custom rooms
    if ((cat.value === 'cabinetry' || cat.value === 'countertop') && 
        roomType !== 'kitchen' && roomType !== 'bathroom' && roomType !== 'custom') {
      return false
    }
    // Show fixtures only for bathrooms and custom rooms
    if (cat.value === 'fixture' && roomType !== 'bathroom' && roomType !== 'custom') {
      return false
    }
    return true
  })

  return (
    <div className="space-y-3">
      {/* Render categories in order */}
      {visibleCategories.map(cat => {
        if (cat.type === 'custom') {
          // Custom category rendering (keep existing custom category rendering)
          const categoryName = cat.value
          const customCat = selections.customCategories?.[categoryName]
          if (!customCat) return null
          
          return (
            <Card key={categoryName} className="overflow-hidden">
              <div className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">
                {/* Image Thumbnail */}
                <div className="flex-shrink-0">
                  <Label htmlFor={`custom-${categoryName}-upload`} className="cursor-pointer">
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 border-2 border-dashed border-gray-300 hover:border-blue-400 transition-colors flex items-center justify-center relative group">
                      {(() => {
                        const customImages = getImagesForCategory(categoryName)
                        const primaryImage = customImages.length > 0 ? customImages[0] : null
                        const imageUrl = primaryImage ? (imageUrls[primaryImage.id] || primaryImage.image_url) : null
                        return imageUrl ? (
                          <>
                            <img
                              src={imageUrl}
                              alt={categoryName}
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
                        )
                      })()}
                    </div>
                  </Label>
                  <input
                    id={`custom-${categoryName}-upload`}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(categoryName, e)}
                    className="hidden"
                    disabled={uploadingCategory === categoryName}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 pr-2">
                      <h3 className="font-semibold text-sm text-gray-900 mb-1 capitalize">{categoryName}</h3>
                      <p className="text-xs text-gray-500 mb-1 truncate">{getCategorySummary(categoryName)}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {(() => {
                        const customImages = getImagesForCategory(categoryName)
                        const customSpecSheets = getSpecSheetsForCategory(categoryName)
                        return (
                          <>
                            {customImages.length > 1 && (
                              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded hidden sm:inline">
                                +{customImages.length - 1}
                              </span>
                            )}
                            {/* Spec Sheet Icon */}
                            {customSpecSheets.length > 0 && (
                              <div className="flex items-center gap-0.5" title={`${customSpecSheets.length} spec sheet${customSpecSheets.length > 1 ? 's' : ''}`}>
                                <FileText className="w-3.5 h-3.5 text-blue-600" />
                                <span className="text-xs text-blue-600 hidden sm:inline">{customSpecSheets.length}</span>
                              </div>
                            )}
                            {/* Spec Sheet Upload Button */}
                            <Label htmlFor={`custom-${categoryName}-spec-upload`} className="cursor-pointer">
                              <Button variant="ghost" size="sm" className="text-xs h-7 px-1.5 sm:px-2" asChild>
                                <span>
                                  <FileText className="w-3 h-3 sm:mr-1" />
                                  <span className="hidden sm:inline">Add Spec</span>
                                </span>
                              </Button>
                            </Label>
                            <input
                              id={`custom-${categoryName}-spec-upload`}
                              type="file"
                              accept=".pdf,image/*"
                              onChange={(e) => handleSpecSheetUpload(categoryName, e)}
                              className="hidden"
                              disabled={uploadingCategory === categoryName}
                            />
                          </>
                        )
                      })()}
                      {/* Reorder Buttons */}
                      <div className="flex flex-col gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMoveCategory(categoryName, 'up')}
                          className="h-3 w-6 p-0"
                          title="Move up"
                          disabled={(() => {
                            const ordered = getOrderedCategories()
                            const index = ordered.findIndex(cat => cat.value === categoryName)
                            return index <= 0
                          })()}
                        >
                          <ArrowUp className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMoveCategory(categoryName, 'down')}
                          className="h-3 w-6 p-0"
                          title="Move down"
                          disabled={(() => {
                            const ordered = getOrderedCategories()
                            const index = ordered.findIndex(cat => cat.value === categoryName)
                            return index >= ordered.length - 1
                          })()}
                        >
                          <ArrowDown className="w-3 h-3" />
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedCategory(expandedCategory === categoryName ? null : categoryName)}
                        className="text-xs h-7 px-1.5 sm:px-2"
                      >
                        <span className="hidden sm:inline">{expandedCategory === categoryName ? 'Hide' : 'Details'}</span>
                        <span className="sm:hidden">
                          {expandedCategory === categoryName ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteCustomCategory(categoryName)}
                        className="text-xs h-7 px-1.5 sm:px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Delete category"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedCategory === categoryName && (
                <div className="border-t bg-gray-50 p-4 space-y-4">
                  {/* All Images Grid */}
                  {(() => {
                    const customImages = getImagesForCategory(categoryName)
                    return customImages.length > 0 && (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {customImages.map((img) => {
                          const imgUrl = imageUrls[img.id] || img.image_url
                          return (
                            <div key={img.id} className="relative group">
                              <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                                {imgUrl ? (
                                  <img
                                    src={imgUrl}
                                    alt={img.description || categoryName}
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
                    )
                  })()}

                  {/* Spec Sheets Section for Custom Category */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs font-medium">Spec Sheets</Label>
                      <Label htmlFor={`custom-${categoryName}-spec-upload-expanded`} className="cursor-pointer">
                        <Button variant="outline" size="sm" className="text-xs h-7" asChild>
                          <span>
                            <Plus className="w-3 h-3 mr-1" />
                            Add Spec Sheet
                          </span>
                        </Button>
                      </Label>
                      <input
                        id={`custom-${categoryName}-spec-upload-expanded`}
                        type="file"
                        accept=".pdf,image/*"
                        onChange={(e) => handleSpecSheetUpload(categoryName, e)}
                        className="hidden"
                        disabled={uploadingCategory === categoryName}
                      />
                    </div>
                    {(() => {
                      const customSpecSheets = getSpecSheetsForCategory(categoryName)
                      return customSpecSheets.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {customSpecSheets.map((sheet) => (
                            <div
                              key={sheet.id}
                              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-blue-400 transition-colors group"
                            >
                              <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                              <a
                                href={sheet.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline truncate max-w-[200px]"
                                title={sheet.file_name}
                              >
                                {sheet.file_name}
                              </a>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (confirm('Delete this spec sheet?')) {
                                    onSpecSheetDelete(sheet.id)
                                  }
                                }}
                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">No spec sheets uploaded</p>
                      )
                    })()}
                  </div>

                  {/* Custom Category Form Fields */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(customCat.details || {}).map(([key, value]) => (
                        <div key={key} className="space-y-1">
                          <Label className="text-xs font-medium capitalize">{key.replace(/_/g, ' ')}</Label>
                          <Input
                            value={value || ''}
                            onChange={(e) => updateCustomCategoryDetail(categoryName, key, e.target.value)}
                            className="h-8 text-sm"
                            placeholder={`Enter ${key.replace(/_/g, ' ')}...`}
                          />
                        </div>
                      ))}
                      {/* Add new detail field */}
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-gray-500">Add Detail Field</Label>
                        <Input
                          placeholder="Field name (e.g., Brand, Model)"
                          className="h-8 text-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const fieldName = e.currentTarget.value.trim().toLowerCase().replace(/\s+/g, '_')
                              if (fieldName && !customCat.details?.[fieldName]) {
                                updateCustomCategoryDetail(categoryName, fieldName, '')
                                e.currentTarget.value = ''
                              }
                            }
                          }}
                        />
                      </div>
                    </div>
                    <Textarea
                      placeholder="Notes"
                      value={customCat.notes || ''}
                      onChange={(e) => updateCustomCategory(categoryName, 'notes', e.target.value)}
                      className="text-sm"
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </Card>
          )
        } else {
          // Default category rendering
          return renderCategoryCard(cat.value as ImageCategory, cat.label)
        }
      })}

      {/* Add Custom Category */}
      {showAddCategory ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add Custom Category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="categoryName">Category Name</Label>
              <Input
                id="categoryName"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g., Trim, Appliances, 2 Lights, Garage Doors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newCategoryName.trim()) {
                    handleAddCustomCategory()
                  }
                }}
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter a name for your custom category (e.g., "Trim", "Appliances", "2 Lights")
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddCustomCategory} disabled={!newCategoryName.trim()}>
                <Plus className="w-4 h-4 mr-2" />
                Add Category
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddCategory(false)
                  setNewCategoryName('')
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button
          variant="outline"
          onClick={() => setShowAddCategory(true)}
          className="w-full"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Custom Category
        </Button>
      )}

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

