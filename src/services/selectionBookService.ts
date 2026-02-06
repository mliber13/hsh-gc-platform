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
  SelectionRoomSpecSheet,
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
  organizationId?: string
): Promise<SelectionBook | null> {
  try {
    // Get user profile for organization_id if not provided
    let orgId = organizationId
    if (!orgId) {
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

      if (!profile?.organization_id) {
        console.error('User profile not found or missing organization_id')
        return null
      }

      orgId = profile.organization_id
    }

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
        organization_id: orgId,
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
 * Get the count of rooms in a selection book
 */
export async function getSelectionBookRoomsCount(
  projectId: string
): Promise<number> {
  try {
    // First get the selection book
    const { data: book, error: bookError } = await supabase
      .from('selection_books')
      .select('id')
      .eq('project_id', projectId)
      .single()

    if (bookError || !book) {
      return 0
    }

    // Count rooms
    const { count, error: countError } = await supabase
      .from('selection_rooms')
      .select('*', { count: 'exact', head: true })
      .eq('selection_book_id', book.id)

    if (countError) {
      console.error('Error counting rooms:', countError)
      return 0
    }

    return count || 0
  } catch (error) {
    console.error('Error in getSelectionBookRoomsCount:', error)
    return 0
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

      // Get spec sheets for each room
      const { data: specSheets, error: specSheetsError } = await supabase
        .from('selection_room_spec_sheets')
        .select('*')
        .in('selection_room_id', roomIds)
        .order('display_order', { ascending: true })

      if (specSheetsError) {
        console.error('Error fetching spec sheets:', specSheetsError)
      }

      // Attach images and spec sheets to rooms and generate signed URLs for each
      if (images || specSheets) {
        for (const room of rooms) {
          const roomImages = images?.filter(img => img.selection_room_id === room.id) || []
          
          // Generate signed URLs for each image
          const imagesWithUrls = await Promise.all(
            roomImages.map(async (img) => {
              // If image_url is already a signed URL or public URL, use it
              // Otherwise, generate a new signed URL from image_path
              if (img.image_url && (img.image_url.startsWith('http') || img.image_url.startsWith('https'))) {
                return img
              }
              
              // Generate signed URL from image_path
              if (img.image_path) {
                const { data: signedUrlData } = await supabase.storage
                  .from('selection-images')
                  .createSignedUrl(img.image_path, 31536000) // 1 year
                
                if (signedUrlData?.signedUrl) {
                  return {
                    ...img,
                    image_url: signedUrlData.signedUrl
                  }
                }
              }
              
              return img
            })
          )
          
          room.images = imagesWithUrls

          // Generate signed URLs for spec sheets
          const roomSpecSheets = specSheets?.filter(sheet => sheet.selection_room_id === room.id) || []
          const specSheetsWithUrls = await Promise.all(
            roomSpecSheets.map(async (sheet) => {
              // If file_url is already a signed URL or public URL, use it
              // Otherwise, generate a new signed URL from file_path
              if (sheet.file_url && (sheet.file_url.startsWith('http') || sheet.file_url.startsWith('https'))) {
                return sheet
              }
              
              // Generate signed URL from file_path
              if (sheet.file_path) {
                const { data: signedUrlData } = await supabase.storage
                  .from('selection-images')
                  .createSignedUrl(sheet.file_path, 31536000) // 1 year
                
                if (signedUrlData?.signedUrl) {
                  return {
                    ...sheet,
                    file_url: signedUrlData.signedUrl
                  }
                }
              }
              
              return sheet
            })
          )
          
          room.specSheets = specSheetsWithUrls
        }
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
  organizationId?: string
): Promise<SelectionRoom | null> {
  try {
    // Get user profile for organization_id if not provided
    let orgId = organizationId
    if (!orgId) {
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

      if (!profile?.organization_id) {
        console.error('User profile not found or missing organization_id')
        return null
      }

      orgId = profile.organization_id
    }

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
        organization_id: orgId,
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

export type UploadImageResult = { image: SelectionRoomImage } | { image: null; error: string }

/**
 * Upload image for a selection room
 */
export async function uploadSelectionImage(
  roomId: string,
  file: File,
  category?: ImageCategory,
  description?: string,
  organizationId?: string
): Promise<UploadImageResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('User not authenticated')
      return { image: null, error: 'You must be signed in to upload.' }
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('Error fetching user profile:', profileError)
      return { image: null, error: 'Could not load your account. Please refresh and try again.' }
    }

    if (!profile?.organization_id) {
      console.error('User profile missing organization_id')
      return { image: null, error: 'Account setup is incomplete. Please contact support.' }
    }

    const orgId = organizationId || profile.organization_id

    const { data: room, error: roomError } = await supabase
      .from('selection_rooms')
      .select('selection_book_id, organization_id')
      .eq('id', roomId)
      .single()

    if (roomError || !room) {
      console.error('Room not found:', roomError)
      return { image: null, error: 'This room could not be found. Please refresh the page and try again.' }
    }

    if (room.organization_id !== orgId) {
      console.error('Room organization_id does not match user organization_id')
      return { image: null, error: "You don't have permission to add images to this room." }
    }

    const { data: book } = await supabase
      .from('selection_books')
      .select('project_id')
      .eq('id', room.selection_book_id)
      .single()

    if (!book) {
      console.error('Book not found')
      return { image: null, error: 'Selection book not found. Please refresh and try again.' }
    }

    const timestamp = Date.now()
    const fileExt = file.name.split('.').pop()
    const fileName = `${roomId}-${timestamp}.${fileExt}`
    const filePath = `${orgId}/${book.project_id}/${roomId}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('selection-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('Error uploading image:', uploadError)
      const msg = uploadError.message || 'Upload failed'
      if (msg.toLowerCase().includes('size') || msg.toLowerCase().includes('limit')) {
        return { image: null, error: 'File is too large. Use an image under 10 MB.' }
      }
      if (msg.toLowerCase().includes('type') || msg.toLowerCase().includes('mime')) {
        return { image: null, error: 'This file type is not allowed. Use JPG, PNG, GIF, or WebP.' }
      }
      return { image: null, error: `Upload failed: ${msg}` }
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('selection-images')
      .createSignedUrl(filePath, 31536000)

    if (signedUrlError) {
      console.error('Error creating signed URL:', signedUrlError)
      try {
        await supabase.storage.from('selection-images').remove([filePath])
      } catch (_) {}
      return { image: null, error: 'Upload succeeded but the link could not be created. Please try again.' }
    }

    const signedUrl = signedUrlData?.signedUrl || null
    if (!signedUrl) {
      try {
        await supabase.storage.from('selection-images').remove([filePath])
      } catch (_) {}
      return { image: null, error: 'Upload succeeded but the link could not be created. Please try again.' }
    }

    const { data: existingImages } = await supabase
      .from('selection_room_images')
      .select('display_order')
      .eq('selection_room_id', roomId)
      .order('display_order', { ascending: false })
      .limit(1)

    const nextOrder = existingImages && existingImages.length > 0
      ? (existingImages[0].display_order || 0) + 1
      : 0

    const { data: imageRecord, error: recordError } = await supabase
      .from('selection_room_images')
      .insert({
        organization_id: orgId,
        selection_room_id: roomId,
        image_url: signedUrl,
        image_path: filePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        category: category || 'general',
        description: description || null,
        display_order: nextOrder,
      })
      .select()
      .single()

    if (recordError) {
      console.error('Error saving image record:', recordError)
      try {
        await supabase.storage.from('selection-images').remove([filePath])
      } catch (_) {}
      return { image: null, error: `Could not save image: ${recordError.message}` }
    }

    return { image: imageRecord as SelectionRoomImage }
  } catch (error) {
    console.error('Error in uploadSelectionImage:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { image: null, error: `Upload failed: ${message}` }
  }
}

/**
 * Get signed URL for a selection image
 */
export async function getSelectionImageSignedUrl(
  imagePath: string,
  expiresIn: number = 31536000 // 1 year default
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from('selection-images')
      .createSignedUrl(imagePath, expiresIn)

    if (error) {
      console.error('Error creating signed URL:', error)
      return null
    }

    return data?.signedUrl || null
  } catch (error) {
    console.error('Error in getSelectionImageSignedUrl:', error)
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

// ============================================================================
// SPEC SHEET OPERATIONS
// ============================================================================

export type UploadSpecSheetResult = { specSheet: SelectionRoomSpecSheet } | { specSheet: null; error: string }

/**
 * Upload spec sheet for a selection room category
 */
export async function uploadSelectionSpecSheet(
  roomId: string,
  file: File,
  category: string,
  description?: string,
  organizationId?: string
): Promise<UploadSpecSheetResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('User not authenticated')
      return { specSheet: null, error: 'You must be signed in to upload.' }
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('Error fetching user profile:', profileError)
      return { specSheet: null, error: 'Could not load your account. Please refresh and try again.' }
    }

    if (!profile?.organization_id) {
      return { specSheet: null, error: 'Account setup is incomplete. Please contact support.' }
    }

    const orgId = organizationId || profile.organization_id

    const { data: room, error: roomError } = await supabase
      .from('selection_rooms')
      .select('selection_book_id, organization_id')
      .eq('id', roomId)
      .single()

    if (roomError || !room) {
      console.error('Room not found:', roomError)
      return { specSheet: null, error: 'This room could not be found. Please refresh the page and try again.' }
    }

    if (room.organization_id !== orgId) {
      return { specSheet: null, error: "You don't have permission to add files to this room." }
    }

    const { data: book } = await supabase
      .from('selection_books')
      .select('project_id')
      .eq('id', room.selection_book_id)
      .single()

    if (!book) {
      return { specSheet: null, error: 'Selection book not found. Please refresh and try again.' }
    }

    const timestamp = Date.now()
    const fileExt = file.name.split('.').pop()
    const fileName = `${roomId}-spec-${timestamp}.${fileExt}`
    const filePath = `${orgId}/${book.project_id}/${roomId}/specs/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('selection-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('Error uploading spec sheet:', uploadError)
      const msg = uploadError.message || 'Upload failed'
      if (msg.toLowerCase().includes('size') || msg.toLowerCase().includes('limit')) {
        return { specSheet: null, error: 'File is too large. Use a file under 10 MB.' }
      }
      if (msg.toLowerCase().includes('type') || msg.toLowerCase().includes('mime')) {
        return { specSheet: null, error: 'This file type is not allowed. Use PDF or an image (JPG, PNG, etc.).' }
      }
      return { specSheet: null, error: `Upload failed: ${msg}` }
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('selection-images')
      .createSignedUrl(filePath, 31536000)

    if (signedUrlError) {
      console.error('Error creating signed URL:', signedUrlError)
      try {
        await supabase.storage.from('selection-images').remove([filePath])
      } catch (_) {}
      return { specSheet: null, error: 'Upload succeeded but the link could not be created. Please try again.' }
    }

    const signedUrl = signedUrlData?.signedUrl || null
    if (!signedUrl) {
      try {
        await supabase.storage.from('selection-images').remove([filePath])
      } catch (_) {}
      return { specSheet: null, error: 'Upload succeeded but the link could not be created. Please try again.' }
    }

    const { data: existingSpecSheets } = await supabase
      .from('selection_room_spec_sheets')
      .select('display_order')
      .eq('selection_room_id', roomId)
      .eq('category', category)
      .order('display_order', { ascending: false })
      .limit(1)

    const nextOrder = existingSpecSheets && existingSpecSheets.length > 0
      ? (existingSpecSheets[0].display_order || 0) + 1
      : 0

    const { data: specSheetRecord, error: recordError } = await supabase
      .from('selection_room_spec_sheets')
      .insert({
        organization_id: orgId,
        selection_room_id: roomId,
        file_url: signedUrl,
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        category: category,
        description: description || null,
        display_order: nextOrder,
      })
      .select()
      .single()

    if (recordError) {
      console.error('Error saving spec sheet record:', recordError)
      try {
        await supabase.storage.from('selection-images').remove([filePath])
      } catch (_) {}
      return { specSheet: null, error: `Could not save file: ${recordError.message}` }
    }

    return { specSheet: specSheetRecord as SelectionRoomSpecSheet }
  } catch (error) {
    console.error('Error in uploadSelectionSpecSheet:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { specSheet: null, error: `Upload failed: ${message}` }
  }
}

/**
 * Get signed URL for a spec sheet
 */
export async function getSelectionSpecSheetSignedUrl(
  filePath: string,
  expiresIn: number = 31536000 // 1 year default
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from('selection-images')
      .createSignedUrl(filePath, expiresIn)

    if (error) {
      console.error('Error creating signed URL:', error)
      return null
    }

    return data?.signedUrl || null
  } catch (error) {
    console.error('Error in getSelectionSpecSheetSignedUrl:', error)
    return null
  }
}

/**
 * Delete selection spec sheet
 */
export async function deleteSelectionSpecSheet(
  specSheetId: string
): Promise<boolean> {
  try {
    // Get spec sheet record to find file path
    const { data: specSheet, error: fetchError } = await supabase
      .from('selection_room_spec_sheets')
      .select('file_path')
      .eq('id', specSheetId)
      .single()

    if (fetchError || !specSheet) {
      console.error('Error fetching spec sheet:', fetchError)
      return false
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('selection-images')
      .remove([specSheet.file_path])

    if (storageError) {
      console.error('Error deleting spec sheet from storage:', storageError)
    }

    // Delete record
    const { error: deleteError } = await supabase
      .from('selection_room_spec_sheets')
      .delete()
      .eq('id', specSheetId)

    if (deleteError) {
      console.error('Error deleting spec sheet record:', deleteError)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in deleteSelectionSpecSheet:', error)
    return false
  }
}

