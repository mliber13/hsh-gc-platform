// ============================================================================
// Item Template Service
// ============================================================================
//
// Business logic for managing default item templates and rates
//

import { v4 as uuidv4 } from 'uuid'
import { ItemTemplate, ItemTemplateInput } from '@/types'
import { isOnlineMode } from '@/lib/supabase'
import * as supabaseService from './supabaseService'

const STORAGE_KEY = 'hsh_gc_item_templates'

// ----------------------------------------------------------------------------
// Storage Operations
// ----------------------------------------------------------------------------

/**
 * Get all item templates
 */
export async function getAllItemTemplates(): Promise<ItemTemplate[]> {
  if (isOnlineMode()) {
    const items = await supabaseService.fetchItemTemplates()
    // If no items in Supabase, initialize with defaults
    if (items.length === 0) {
      const defaults = getDefaultItemTemplates()
      // Save defaults to Supabase
      for (const template of defaults) {
        await supabaseService.createItemTemplateInDB(template)
      }
      return defaults
    }
    return items
  } else {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (!data) {
        // Initialize with default templates
        const defaults = getDefaultItemTemplates()
        saveAllItemTemplates(defaults)
        return defaults
      }
      return JSON.parse(data, dateReviver) as ItemTemplate[]
    } catch (error) {
      console.error('Error reading item templates:', error)
      return []
    }
  }
}

/**
 * Get item templates by category
 */
export async function getItemTemplatesByCategory(category: string): Promise<ItemTemplate[]> {
  const all = await getAllItemTemplates()
  return all.filter(item => item.category === category)
}

/**
 * Get item template by ID
 */
export async function getItemTemplateById(id: string): Promise<ItemTemplate | null> {
  const all = await getAllItemTemplates()
  return all.find(item => item.id === id) || null
}

/**
 * Create new item template
 */
export async function createItemTemplate(input: ItemTemplateInput): Promise<ItemTemplate> {
  if (isOnlineMode()) {
    const created = await supabaseService.createItemTemplateInDB(input)
    if (!created) throw new Error('Failed to create item template')
    return created
  } else {
    const template: ItemTemplate = {
      id: uuidv4(),
      ...input,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const all = await getAllItemTemplates()
    all.push(template)
    saveAllItemTemplates(all)

    return template
  }
}

/**
 * Update existing item template
 */
export async function updateItemTemplate(id: string, updates: Partial<ItemTemplateInput>): Promise<ItemTemplate | null> {
  if (isOnlineMode()) {
    return await supabaseService.updateItemTemplateInDB(id, updates)
  } else {
    const all = await getAllItemTemplates()
    const index = all.findIndex(item => item.id === id)

    if (index === -1) return null

    all[index] = {
      ...all[index],
      ...updates,
      updatedAt: new Date(),
    }

    saveAllItemTemplates(all)
    return all[index]
  }
}

/**
 * Delete item template
 */
export async function deleteItemTemplate(id: string): Promise<boolean> {
  if (isOnlineMode()) {
    return await supabaseService.deleteItemTemplateFromDB(id)
  } else {
    const all = await getAllItemTemplates()
    const filtered = all.filter(item => item.id !== id)
    
    if (filtered.length === all.length) return false
    
    saveAllItemTemplates(filtered)
    return true
  }
}

/**
 * Save all item templates
 */
function saveAllItemTemplates(templates: ItemTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
  } catch (error) {
    console.error('Error saving item templates:', error)
    throw new Error('Failed to save item templates')
  }
}

/**
 * Date reviver for JSON.parse
 */
function dateReviver(key: string, value: any): any {
  if (typeof value === 'string') {
    const dateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
    if (dateRegex.test(value)) {
      return new Date(value)
    }
  }
  return value
}

// ----------------------------------------------------------------------------
// Default Item Templates
// ----------------------------------------------------------------------------

function getDefaultItemTemplates(): ItemTemplate[] {
  const now = new Date()

  return [
    // Rough Framing
    {
      id: uuidv4(),
      category: 'rough-framing',
      name: 'Wood Framing',
      defaultUnit: 'sqft',
      defaultMaterialRate: 11.44,
      defaultLaborRate: 5.50,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    // Windows & Doors
    {
      id: uuidv4(),
      category: 'windows-doors',
      name: 'Interior Doors',
      defaultUnit: 'each',
      defaultMaterialRate: 350,
      defaultLaborRate: 100,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'windows-doors',
      name: 'Exterior Doors',
      defaultUnit: 'each',
      defaultMaterialRate: 1400,
      defaultLaborRate: 150,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'windows-doors',
      name: 'Garage Doors',
      defaultUnit: 'each',
      defaultMaterialRate: 1500,
      defaultLaborRate: 600,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'windows-doors',
      name: 'Sliding Doors/French Door',
      defaultUnit: 'each',
      defaultMaterialRate: 1800,
      defaultLaborRate: 150,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'windows-doors',
      name: 'Windows',
      defaultUnit: 'each',
      defaultMaterialRate: 1000,
      defaultLaborRate: 125,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'windows-doors',
      name: 'Front Door',
      defaultUnit: 'each',
      defaultMaterialRate: 2400,
      defaultLaborRate: 150,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    // Exterior Finishes
    {
      id: uuidv4(),
      category: 'exterior-finishes',
      name: 'Siding',
      defaultUnit: 'sqft',
      defaultMaterialRate: 5.00,
      defaultLaborRate: 1.25,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'exterior-finishes',
      name: 'Soffit/Fascia',
      defaultUnit: 'linear_ft',
      defaultMaterialRate: 10.00,
      defaultLaborRate: 3.00,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'exterior-finishes',
      name: 'Exterior Paint',
      defaultUnit: 'sqft',
      defaultMaterialRate: 3.00,
      defaultLaborRate: 3.00,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    // Electrical
    {
      id: uuidv4(),
      category: 'electrical',
      name: 'Rough',
      defaultUnit: 'sqft',
      defaultMaterialRate: 5.00,
      defaultLaborRate: 10.00,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'electrical',
      name: 'Finishes',
      defaultUnit: 'sqft',
      defaultMaterialRate: 1.00,
      defaultLaborRate: 2.00,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'electrical',
      name: 'Closet Hardware',
      defaultUnit: 'each',
      defaultMaterialRate: 500,
      defaultLaborRate: 250,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'electrical',
      name: 'Closet Shelving',
      defaultUnit: 'each',
      defaultMaterialRate: 500,
      defaultLaborRate: 250,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    // Interior Finishes
    {
      id: uuidv4(),
      category: 'interior-finishes',
      name: 'Flooring',
      defaultUnit: 'sqft',
      defaultMaterialRate: 2.00,
      defaultLaborRate: 2.00,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'interior-finishes',
      name: 'Interior Paint',
      defaultUnit: 'sqft',
      defaultMaterialRate: 2.00,
      defaultLaborRate: 2.00,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    // Kitchen
    {
      id: uuidv4(),
      category: 'kitchen',
      name: 'Backsplash',
      defaultUnit: 'sqft',
      defaultMaterialRate: 5.00,
      defaultLaborRate: 5.00,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'kitchen',
      name: 'Cabinets',
      defaultUnit: 'each',
      defaultMaterialRate: 300,
      defaultLaborRate: 75,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'kitchen',
      name: 'Countertops',
      defaultUnit: 'sqft',
      defaultMaterialRate: 50,
      defaultLaborRate: 25,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'kitchen',
      name: 'Kitchen Faucet',
      defaultUnit: 'each',
      defaultMaterialRate: 200,
      defaultLaborRate: 0,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'kitchen',
      name: 'Accessories',
      defaultUnit: 'lot',
      defaultMaterialRate: 750,
      defaultLaborRate: 250,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    // Appliances
    {
      id: uuidv4(),
      category: 'appliances',
      name: 'Cooktop',
      defaultUnit: 'each',
      defaultMaterialRate: 600,
      defaultLaborRate: 75,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'appliances',
      name: 'Dishwasher',
      defaultUnit: 'each',
      defaultMaterialRate: 250,
      defaultLaborRate: 75,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'appliances',
      name: 'Microwave Oven',
      defaultUnit: 'each',
      defaultMaterialRate: 250,
      defaultLaborRate: 25,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'appliances',
      name: 'Oven',
      defaultUnit: 'each',
      defaultMaterialRate: 600,
      defaultLaborRate: 75,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'appliances',
      name: 'Range Hood',
      defaultUnit: 'each',
      defaultMaterialRate: 600,
      defaultLaborRate: 75,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'appliances',
      name: 'Refrigerator',
      defaultUnit: 'each',
      defaultMaterialRate: 600,
      defaultLaborRate: 75,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'appliances',
      name: 'Washer+Dryer',
      defaultUnit: 'each',
      defaultMaterialRate: 1200,
      defaultLaborRate: 150,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    // Bath
    {
      id: uuidv4(),
      category: 'bath',
      name: 'Accessories',
      defaultUnit: 'lot',
      defaultMaterialRate: 500,
      defaultLaborRate: 250,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'bath',
      name: 'Cabinets',
      defaultUnit: 'each',
      defaultMaterialRate: 300,
      defaultLaborRate: 75,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'bath',
      name: 'Cabinets-Hardware',
      defaultUnit: 'lot',
      defaultMaterialRate: 250,
      defaultLaborRate: 50,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'bath',
      name: 'Countertops',
      defaultUnit: 'sqft',
      defaultMaterialRate: 50,
      defaultLaborRate: 25,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'bath',
      name: 'Mirrors',
      defaultUnit: 'each',
      defaultMaterialRate: 150,
      defaultLaborRate: 50,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'bath',
      name: 'Tub/Shower Enclosure',
      defaultUnit: 'each',
      defaultMaterialRate: 1600,
      defaultLaborRate: 0,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'bath',
      name: 'Toilet',
      defaultUnit: 'each',
      defaultMaterialRate: 250,
      defaultLaborRate: 0,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'bath',
      name: 'Bath Faucet',
      defaultUnit: 'each',
      defaultMaterialRate: 150,
      defaultLaborRate: 0,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    // Roofing
    {
      id: uuidv4(),
      category: 'roofing',
      name: 'Full Scope',
      defaultUnit: 'sqft',
      defaultMaterialRate: 2.00,
      defaultLaborRate: 1.00,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    // HVAC
    {
      id: uuidv4(),
      category: 'hvac',
      name: 'Full Scope',
      defaultUnit: 'sqft',
      defaultMaterialRate: 10.00,
      defaultLaborRate: 2.00,
      isSubcontracted: false,
      createdAt: now,
      updatedAt: now,
    },
    // Insulation, Plumbing, Drywall - Lump sum categories
    {
      id: uuidv4(),
      category: 'insulation',
      name: 'Full Scope',
      defaultUnit: 'lot',
      defaultMaterialRate: 0,
      defaultLaborRate: 0,
      defaultSubcontractorRate: 0,
      defaultSubcontractorCost: 0,
      isSubcontracted: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'plumbing',
      name: 'Full Scope',
      defaultUnit: 'lot',
      defaultMaterialRate: 0,
      defaultLaborRate: 0,
      defaultSubcontractorRate: 0,
      defaultSubcontractorCost: 0,
      isSubcontracted: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      category: 'drywall',
      name: 'Full Scope',
      defaultUnit: 'lot',
      defaultMaterialRate: 0,
      defaultLaborRate: 0,
      defaultSubcontractorRate: 0,
      defaultSubcontractorCost: 0,
      isSubcontracted: true,
      createdAt: now,
      updatedAt: now,
    },
  ]
}

/**
 * Reset to default templates
 */
export function resetToDefaults(): ItemTemplate[] {
  const defaults = getDefaultItemTemplates()
  saveAllItemTemplates(defaults)
  return defaults
}

