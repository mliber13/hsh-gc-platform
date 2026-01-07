// ============================================================================
// Selection Book Types
// ============================================================================

export type SelectionBookStatus = 'draft' | 'in_progress' | 'completed' | 'approved'

export type RoomType = 
  | 'kitchen'
  | 'bathroom'
  | 'master-bath'
  | 'bedroom'
  | 'master-bedroom'
  | 'living-room'
  | 'dining-room'
  | 'hallway'
  | 'basement'
  | 'laundry'
  | 'mudroom'
  | 'entry'
  | 'exterior'
  | 'custom'

export type ImageCategory = 
  | 'paint'
  | 'flooring'
  | 'lighting'
  | 'cabinetry'
  | 'countertop'
  | 'fixture'
  | 'hardware'
  | 'general'
  | string // Allow custom category names

export interface PaintSelection {
  color?: string
  brand?: string
  finish?: string
  code?: string
}

export interface FlooringSelection {
  type?: string
  material?: string
  color?: string
  brand?: string
  style?: string
  notes?: string
}

export interface LightingSelection {
  fixtures?: Array<{
    type: string
    location: string
    brand?: string
    finish?: string
  }>
  switches?: string
  dimmers?: string
  notes?: string
}

export interface CabinetrySelection {
  style?: string
  color?: string
  brand?: string
  hardware?: string
  notes?: string
}

export interface CountertopSelection {
  material?: string
  color?: string
  brand?: string
  edge?: string
  thickness?: string
  notes?: string
}

export interface FixtureSelection {
  faucets?: string
  sinks?: string
  toilets?: string
  showers?: string
  tubs?: string
  mirrors?: string
  notes?: string
}

export interface HardwareSelection {
  door_handles?: string
  cabinet_pulls?: string
  towel_bars?: string
  hooks?: string
  tp_holders?: string
  notes?: string
}

export interface CustomCategorySelection {
  name: string // The custom category name (e.g., "trim", "appliances", "2 lights")
  details?: Record<string, string> // Flexible key-value pairs for custom fields
  notes?: string
}

export interface RoomSelections {
  paint?: {
    walls?: PaintSelection
    ceiling?: PaintSelection
    trim?: PaintSelection
    accent_walls?: PaintSelection
  }
  flooring?: FlooringSelection
  lighting?: LightingSelection
  cabinetry?: CabinetrySelection
  countertops?: CountertopSelection
  fixtures?: FixtureSelection
  hardware?: HardwareSelection
  customCategories?: Record<string, CustomCategorySelection> // Key is the category name
  categoryOrder?: string[] // Order of categories (default + custom)
  notes?: string
}

export interface SelectionRoomImage {
  id: string
  selection_room_id: string
  image_url: string
  image_path: string
  file_name: string
  file_size?: number
  mime_type?: string
  category?: ImageCategory
  description?: string
  display_order: number
  created_at: string
  created_by?: string
}

export interface SelectionRoomSpecSheet {
  id: string
  selection_room_id: string
  file_url: string
  file_path: string
  file_name: string
  file_size?: number
  mime_type?: string
  category: string // Category name (paint, flooring, lighting, or custom category)
  description?: string
  display_order: number
  created_at: string
  created_by?: string
}

export interface SelectionRoom {
  id: string
  organization_id: string
  selection_book_id: string
  room_name: string
  room_type?: RoomType
  display_order: number
  selections: RoomSelections
  created_at: string
  updated_at: string
  images?: SelectionRoomImage[]
  specSheets?: SelectionRoomSpecSheet[]
}

export interface SelectionBook {
  id: string
  organization_id: string
  project_id: string
  title: string
  description?: string
  status: SelectionBookStatus
  created_at: string
  updated_at: string
  created_by?: string
  rooms?: SelectionRoom[]
}

