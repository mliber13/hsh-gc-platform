/**
 * Import Service for Estimate Data
 * Handles importing Excel/CSV estimate data into Supabase
 */

import { Trade } from '../types/project';
import { TradeCategory, UnitType } from '../types/constants';
import { ParsedEstimateData, ParsedEstimateRow } from '../utils/excelParser';
import * as supabaseService from './supabaseService';
import * as projectService from './projectService';
import { isOnlineMode, supabase } from '../lib/supabase';

export interface ImportResult {
  success: boolean;
  projectId?: string;
  tradesImported?: number;
  errors?: string[];
  warnings?: string[];
}

/**
 * Import estimate data from parsed CSV/Excel data
 */
export async function importEstimateData(
  parsedData: ParsedEstimateData,
  projectId?: string
): Promise<ImportResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    let targetProjectId = projectId;
    
    // Create project if not provided
    if (!targetProjectId) {
      const newProject = await createProjectFromImport(parsedData.projectName);
      if (!newProject) {
        errors.push('Failed to create new project');
        return { success: false, errors };
      }
      targetProjectId = newProject.id;
    }

    // Convert parsed rows to Trade objects
    const trades = convertParsedRowsToTrades(parsedData.rows);
    
    if (trades.length === 0) {
      errors.push('No valid trade items found in the imported data');
      return { success: false, errors };
    }

    // Import trades to Supabase or localStorage
    const importResult = await importTradesToDatabase(trades, targetProjectId);
    
    if (!importResult.success) {
      errors.push(...(importResult.errors || []));
      return { success: false, errors };
    }

    warnings.push(...(importResult.warnings || []));

    return {
      success: true,
      projectId: targetProjectId,
      tradesImported: trades.length,
      warnings
    };

  } catch (error) {
    console.error('Import error:', error);
    errors.push(error instanceof Error ? error.message : 'Unknown import error');
    return { success: false, errors };
  }
}

/**
 * Create a new project from imported data
 */
async function createProjectFromImport(projectName: string) {
  const projectData = {
    name: projectName,
    type: 'residential-new-build' as const,
    client: { name: 'Imported Client', email: '', phone: '' },
    address: { street: 'Imported Address', city: '', state: '', zip: '' },
    startDate: new Date(),
    endDate: undefined,
    description: 'Project imported from Excel/CSV estimate'
  };

  if (isOnlineMode()) {
    return await supabaseService.createProjectInDB(projectData);
  } else {
    return await projectService.createProject(projectData);
  }
}

/**
 * Convert parsed rows to Trade objects
 */
function convertParsedRowsToTrades(rows: ParsedEstimateRow[]): Trade[] {
  const trades: Trade[] = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    if (!row.name || row.isSubtotal) {
      continue; // Skip empty rows and subtotals
    }

    const trade: Trade = {
      id: `temp-${Date.now()}-${i}`, // Temporary ID, will be replaced by database
      estimateId: '', // Will be set when importing
      category: normalizeCategory(row.category) as TradeCategory,
      name: row.name,
      description: row.notes || '',
      quantity: row.quantity,
      unit: normalizeUnit(row.unit) as UnitType,
      materialCost: row.materialCost,
      laborCost: row.laborCost,
      subcontractorCost: row.subcontractorCost,
      totalCost: row.totalCost,
      isSubcontracted: row.subcontractorCost > 0,
      wasteFactor: 0.05, // Default 5% waste
      markupPercent: row.markupPercent || 10, // Default 10% markup
      sortOrder: i
    };

    trades.push(trade);
  }

  return trades;
}

/**
 * Normalize category string to valid TradeCategory
 */
function normalizeCategory(category: string): string {
  const normalized = category.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  // Map common variations to valid categories
  const categoryMap: Record<string, string> = {
    'site-prep': 'site-prep',
    'excavation-foundation': 'excavation-foundation',
    'rough-framing': 'rough-framing',
    'windows-doors': 'windows-doors',
    'exterior-finishes': 'exterior-finishes',
    'roofing': 'roofing',
    'insulation': 'insulation',
    'plumbing': 'plumbing',
    'electrical': 'electrical',
    'hvac': 'hvac',
    'drywall': 'drywall',
    'interior-finishes': 'interior-finishes',
    'kitchen': 'kitchen',
    'bath': 'bath',
    'appliances': 'appliances',
    'planning': 'planning'
  };
  
  return categoryMap[normalized] || 'other';
}

/**
 * Normalize unit string to valid UnitType
 */
function normalizeUnit(unit: string): string {
  const normalized = unit.toLowerCase().trim();
  
  // Map common variations to valid units
  const unitMap: Record<string, string> = {
    'ea': 'ea',
    'each': 'ea',
    'sqft': 'sqft',
    'sq ft': 'sqft',
    'square feet': 'sqft',
    'lf': 'lf',
    'linear feet': 'lf',
    'linear foot': 'lf',
    'cubic feet': 'cuft',
    'cuft': 'cuft',
    'cu ft': 'cuft',
    'cubic yard': 'cuyd',
    'cuyd': 'cuyd',
    'cu yd': 'cuyd',
    'lb': 'lb',
    'pound': 'lb',
    'pounds': 'lb',
    'ton': 'ton',
    'tons': 'ton',
    'hour': 'hour',
    'hr': 'hour',
    'hours': 'hour',
    'day': 'day',
    'days': 'day',
    'week': 'week',
    'weeks': 'week',
    'month': 'month',
    'months': 'month'
  };
  
  return unitMap[normalized] || 'ea';
}

/**
 * Import trades to the database (Supabase or localStorage)
 */
async function importTradesToDatabase(trades: Trade[], projectId: string): Promise<ImportResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    if (isOnlineMode()) {
      // Import to Supabase
      const result = await importTradesToSupabase(trades, projectId);
      return result;
    } else {
      // Import to localStorage
      const result = await importTradesToLocalStorage(trades, projectId);
      return result;
    }
  } catch (error) {
    console.error('Database import error:', error);
    errors.push(error instanceof Error ? error.message : 'Database import failed');
    return { success: false, errors };
  }
}

/**
 * Import trades to Supabase
 */
async function importTradesToSupabase(trades: Trade[], projectId: string): Promise<ImportResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    // Get or create estimate for the project
    let estimateId = '';
    
      // First, try to find existing estimate
      const { data: estimates, error: estimateError } = await supabase
        .from('estimates')
        .select('id')
        .eq('project_id', projectId)
        .single();

    if (estimateError && estimateError.code !== 'PGRST116') { // Not "not found" error
      errors.push(`Failed to find estimate: ${estimateError.message}`);
      return { success: false, errors };
    }

    if (estimates) {
      estimateId = estimates.id;
    } else {
      // Create new estimate
      const estimate = await supabaseService.createEstimateInDB(projectId);
      estimateId = estimate.id;
    }

    // Import each trade
    let successCount = 0;
    for (const trade of trades) {
      try {
        await supabaseService.createTradeInDB(estimateId, trade);
        successCount++;
      } catch (error) {
        console.error(`Failed to import trade "${trade.name}":`, error);
        errors.push(`Failed to import "${trade.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    if (successCount < trades.length) {
      warnings.push(`${trades.length - successCount} trades failed to import`);
    }

    return {
      success: successCount > 0,
      tradesImported: successCount,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };

  } catch (error) {
    console.error('Supabase import error:', error);
    errors.push(error instanceof Error ? error.message : 'Supabase import failed');
    return { success: false, errors };
  }
}

/**
 * Import trades to localStorage
 */
async function importTradesToLocalStorage(trades: Trade[], projectId: string): Promise<ImportResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    // Import using localStorage service
    const estimateService = await import('./estimateService');
    const { addTrade } = estimateService;
    
    let successCount = 0;
    for (const trade of trades) {
      try {
        await addTrade(projectId, trade);
        successCount++;
      } catch (error) {
        console.error(`Failed to import trade "${trade.name}":`, error);
        errors.push(`Failed to import "${trade.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    if (successCount < trades.length) {
      warnings.push(`${trades.length - successCount} trades failed to import`);
    }

    return {
      success: successCount > 0,
      tradesImported: successCount,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };

  } catch (error) {
    console.error('LocalStorage import error:', error);
    errors.push(error instanceof Error ? error.message : 'LocalStorage import failed');
    return { success: false, errors };
  }
}

/**
 * Validate imported data before processing
 */
export function validateImportData(parsedData: ParsedEstimateData): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check project name
  if (!parsedData.projectName || parsedData.projectName.trim() === '') {
    errors.push('Project name is required');
  }

  // Check for rows
  if (parsedData.rows.length === 0) {
    errors.push('No estimate items found in the file');
  }

  // Check for valid categories
  const categories = new Set(parsedData.rows.map(row => row.category).filter(cat => cat));
  if (categories.size === 0) {
    warnings.push('No categories found - all items will be placed in "other" category');
  }

  // Check for items with costs
  const itemsWithCosts = parsedData.rows.filter(row => 
    row.materialCost > 0 || row.laborCost > 0 || row.totalCost > 0
  );
  
  if (itemsWithCosts.length === 0) {
    warnings.push('No items with costs found - check if cost columns are mapped correctly');
  }

  // Check for items without names
  const itemsWithoutNames = parsedData.rows.filter(row => !row.name || row.name.trim() === '');
  if (itemsWithoutNames.length > 0) {
    warnings.push(`${itemsWithoutNames.length} items without names will be skipped`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
