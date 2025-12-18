// ============================================================================
// Selection Book Service
// ============================================================================
// 
// Handles all operations for Selection Books, Rooms, and Images
//

import { supabase } from '@/lib/supabase'
import type {
  SelectionBook,
  SelectionRoom,
  SelectionRoomImage,
  RoomSelections,
  ImageCategory,
} from '@/types/selectionBook'

// ============================================================================
// SELECTION BOOK OPERATIONS
// ============================================================================

/**
 * Get or create a selection book for a project
 */
export async function getOrCreateSelectionBook(
  projectId: string,
  organizationId: string = 'default-org'
): Promise<SelectionBook | null> {
  try {
    // Try to get existing book
    const { data: existing, error: fetchError } = await supabase
      .from('selection_books')
      .select('*')
      .eq('project_id', projectId)
      .single()

    if (existing && !fetchError) {
      return existing as SelectionBook
    }

    // Create new book if it doesn't exist
    const { data: newBook, error: createError } = await supabase
      .from('selection_books')
      .insert({
        organization_id: organizationId,
        project_id: projectId,
        title: 'Selection Book',
        status: 'draft',
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating selection book:', createError)
      return null
    }

    return newBook as SelectionBook
  } catch (error) {
    console.error('Error in getOrCreateSelectionBook:', error)
    return null
  }
}

/**
 * Get selection book with all rooms and images
 */
export async function getSelectionBookWithRooms(
  projectId: string
): Promise<SelectionBook | null> {
  try {
    const { data: book, error: bookError } = await supabase
      .from('selection_books')
      .select('*')
      .eq('project_id', projectId)
      .single()

    if (bookError || !book) {
      return null
    }

    // Get all rooms for this book
    const { data: rooms, error: roomsError } = await supabase
      .from('selection_rooms')
      .select('*')
      .eq('selection_book_id', book.id)
      .order('display_order', { ascending: true })

    if (roomsError) {
      console.error('Error fetching rooms:', roomsError)
    }

    // Get images for each room
    if (rooms && rooms.length > 0) {
      const roomIds = rooms.map(r => r.id)
      const { data: images, error: imagesError } = await supabase
        .from('selection_room_images')
        .select('*')
        .in('selection_room_id', roomIds)
        .order('display_order', { ascending: true })

      if (imagesError) {
        console.error('Error fetching images:', imagesError)
      }

      // Attach images to rooms
      if (images) {
        rooms.forEach(room => {
          room.images = images.filter(img => img.selection_room_id === room.id)
        })
      }
    }

    return {
      ...book,
      rooms: rooms || [],
    } as SelectionBook
  } catch (error) {
    console.error('Error in getSelectionBookWithRooms:', error)
    return null
  }
}

/**
 * Update selection book
 */
export async function updateSelectionBook(
  bookId: string,
  updates: Partial<SelectionBook>
): Promise<SelectionBook | null> {
  try {
    const { data, error } = await supabase
      .from('selection_books')
      .update(updates)
      .eq('id', bookId)
      .select()
      .single()

    if (error) {
      console.error('Error updating selection book:', error)
      return null
    }

    return data as SelectionBook
  } catch (error) {
    console.error('Error in updateSelectionBook:', error)
    return null
  }
}

// ============================================================================
// SELECTION ROOM OPERATIONS
// ============================================================================

/**
 * Create a new selection room
 */
export async function createSelectionRoom(
  bookId: string,
  roomName: string,
  roomType?: string,
  organizationId: string = 'default-org'
): Promise<SelectionRoom | null> {
  try {
    // Get current max display_order
    const { data: existingRooms } = await supabase
      .from('selection_rooms')
      .select('display_order')
      .eq('selection_book_id', bookId)
      .order('display_order', { ascending: false })
      .limit(1)

    const nextOrder = existingRooms && existingRooms.length > 0
      ? (existingRooms[0].display_order || 0) + 1
      : 0

    const { data, error } = await supabase
      .from('selection_rooms')
      .insert({
        organization_id: organizationId,
        selection_book_id: bookId,
        room_name: roomName,
        room_type: roomType,
        display_order: nextOrder,
        selections: {},
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating selection room:', error)
      return null
    }

    return data as SelectionRoom
  } catch (error) {
    console.error('Error in createSelectionRoom:', error)
    return null
  }
}

/**
 * Update selection room
 */
export async function updateSelectionRoom(
  roomId: string,
  updates: Partial<SelectionRoom>
): Promise<SelectionRoom | null> {
  try {
    const { data, error } = await supabase
      .from('selection_rooms')
      .update(updates)
      .eq('id', roomId)
      .select()
      .single()

    if (error) {
      console.error('Error updating selection room:', error)
      return null
    }

    return data as SelectionRoom
  } catch (error) {
    console.error('Error in updateSelectionRoom:', error)
    return null
  }
}

/**
 * Update room selections
 */
export async function updateRoomSelections(
  roomId: string,
  selections: RoomSelections
): Promise<SelectionRoom | null> {
  try {
    const { data, error } = await supabase
      .from('selection_rooms')
      .update({ selections })
      .eq('id', roomId)
      .select()
      .single()

    if (error) {
      console.error('Error updating room selections:', error)
      return null
    }

    return data as SelectionRoom
  } catch (error) {
    console.error('Error in updateRoomSelections:', error)
    return null
  }
}

/**
 * Delete selection room
 */
export async function deleteSelectionRoom(roomId: string): Promise<boolean> {
  try {
    // Delete all images first
    await supabase
      .from('selection_room_images')
      .delete()
      .eq('selection_room_id', roomId)

    // Delete room
    const { error } = await supabase
      .from('selection_rooms')
      .delete()
      .eq('id', roomId)

    if (error) {
      console.error('Error deleting selection room:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in deleteSelectionRoom:', error)
    return false
  }
}

/**
 * Reorder rooms
 */
export async function reorderRooms(
  roomIds: string[]
): Promise<boolean> {
  try {
    // Update display_order for each room
    const updates = roomIds.map((id, index) =>
      supabase
        .from('selection_rooms')
        .update({ display_order: index })
        .eq('id', id)
    )

    await Promise.all(updates)
    return true
  } catch (error) {
    console.error('Error in reorderRooms:', error)
    return false
  }
}

// ============================================================================
// IMAGE OPERATIONS
// ============================================================================

/**
 * Upload image for a selection room
 */
export async function uploadSelectionImage(
  roomId: string,
  file: File,
  category?: ImageCategory,
  description?: string,
  organizationId: string = 'default-org'
): Promise<SelectionRoomImage | null> {
  try {
    // Get user profile for organization_id
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('User not authenticated')
      return null
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    const orgId = profile?.organization_id || organizationId

    // Get room to find book and project
    const { data: room } = await supabase
      .from('selection_rooms')
      .select('selection_book_id')
      .eq('id', roomId)
      .single()

    if (!room) {
      console.error('Room not found')
      return null
    }

    const { data: book } = await supabase
      .from('selection_books')
      .select('project_id')
      .eq('id', room.selection_book_id)
      .single()

    if (!book) {
      console.error('Book not found')
      return null
    }

    // Create unique filename
    const timestamp = Date.now()
    const fileExt = file.name.split('.').pop()
    const fileName = `${roomId}-${timestamp}.${fileExt}`
    const filePath = `${orgId}/${book.project_id}/${roomId}/${fileName}`

    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('selection-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('Error uploading image:', uploadError)
      return null
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('selection-images')
      .getPublicUrl(filePath)

    // Get current max display_order
    const { data: existingImages } = await supabase
      .from('selection_room_images')
      .select('display_order')
      .eq('selection_room_id', roomId)
      .order('display_order', { ascending: false })
      .limit(1)

    const nextOrder = existingImages && existingImages.length > 0
      ? (existingImages[0].display_order || 0) + 1
      : 0

    // Save image record
    const { data: imageRecord, error: recordError } = await supabase
      .from('selection_room_images')
      .insert({
        organization_id: orgId,
        selection_room_id: roomId,
        image_url: publicUrl,
        image_path: filePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        category: category,
        description: description,
        display_order: nextOrder,
      })
      .select()
      .single()

    if (recordError) {
      console.error('Error saving image record:', recordError)
      // Try to delete uploaded file
      await supabase.storage
        .from('selection-images')
        .remove([filePath])
      return null
    }

    return imageRecord as SelectionRoomImage
  } catch (error) {
    console.error('Error in uploadSelectionImage:', error)
    return null
  }
}

/**
 * Delete selection image
 */
export async function deleteSelectionImage(
  imageId: string
): Promise<boolean> {
  try {
    // Get image record to find file path
    const { data: image, error: fetchError } = await supabase
      .from('selection_room_images')
      .select('image_path')
      .eq('id', imageId)
      .single()

    if (fetchError || !image) {
      console.error('Error fetching image:', fetchError)
      return false
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('selection-images')
      .remove([image.image_path])

    if (storageError) {
      console.error('Error deleting image from storage:', storageError)
    }

    // Delete record
    const { error: deleteError } = await supabase
      .from('selection_room_images')
      .delete()
      .eq('id', imageId)

    if (deleteError) {
      console.error('Error deleting image record:', deleteError)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in deleteSelectionImage:', error)
    return false
  }
}

/**
 * Update image metadata
 */
export async function updateSelectionImage(
  imageId: string,
  updates: Partial<SelectionRoomImage>
): Promise<SelectionRoomImage | null> {
  try {
    const { data, error } = await supabase
      .from('selection_room_images')
      .update(updates)
      .eq('id', imageId)
      .select()
      .single()

    if (error) {
      console.error('Error updating image:', error)
      return null
    }

    return data as SelectionRoomImage
  } catch (error) {
    console.error('Error in updateSelectionImage:', error)
    return null
  }
}

