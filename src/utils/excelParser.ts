/**
 * Excel/CSV Parser for Estimate Data
 * Handles the HSH Contractor Estimate Book format
 */

export interface ParsedEstimateRow {
  category: string;
  name: string;
  quantity: number;
  unit: string;
  materialCost: number;
  laborCost: number;
  subcontractorCost: number;
  totalCost: number;
  markupPercent: number;
  notes?: string;
  isSubtotal?: boolean; // For category subtotals
}

export interface ParsedEstimateData {
  projectName: string;
  rows: ParsedEstimateRow[];
}

/**
 * Parse CSV content into estimate data
 */
export function parseCSVContent(csvContent: string): ParsedEstimateData {
  const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }

  // Find the header row (look for "Category & Items")
  let headerIndex = -1;
  let headers: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.toLowerCase().includes('category') && line.toLowerCase().includes('items')) {
      headerIndex = i;
      headers = line.split(',').map(h => h.trim().replace(/"/g, ''));
      break;
    }
  }

  if (headerIndex === -1) {
    throw new Error('Could not find header row with "Category & Items"');
  }

  // Extract project name from earlier lines if available
  let projectName = 'Imported Project';
  for (let i = 0; i < headerIndex; i++) {
    const line = lines[i];
    if (line.toLowerCase().includes('project name')) {
      const match = line.match(/project name[:\s]*([^,]+)/i);
      if (match) {
        projectName = match[1].trim().replace(/"/g, '');
      }
    }
  }

  // Parse data rows
  const rows: ParsedEstimateRow[] = [];
  let currentCategory = '';

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const values = parseCSVLine(line);

    // Skip empty rows or rows with all empty values
    if (values.every(v => v.trim() === '' || v === '0' || v === '$0.00')) {
      continue;
    }

    // Check if this is a category header (no quantity/unit data)
    if (isCategoryHeader(values, headers)) {
      currentCategory = values[0]?.trim() || '';
      continue;
    }

    // Check if this is a subtotal row
    const isSubtotal = values.some(v => v.toLowerCase().includes('subtotal') || v.toLowerCase().includes('total'));
    if (isSubtotal) {
      continue; // Skip subtotal rows for now
    }

    // Parse the row data
    const row = parseEstimateRow(values, headers, currentCategory);
    if (row && row.name.trim()) {
      rows.push(row);
    }
  }

  return {
    projectName,
    rows
  };
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

/**
 * Check if a row is a category header
 */
function isCategoryHeader(values: string[], headers: string[]): boolean {
  if (values.length < 2) return false;
  
  const firstValue = values[0]?.trim().toLowerCase();
  const secondValue = values[1]?.trim();
  
  // Category headers typically don't have quantities or units
  return (
    Boolean(firstValue) && 
    secondValue === '' && 
    !firstValue.includes('subtotal') &&
    !firstValue.includes('total')
  );
}

/**
 * Parse a single estimate row into our data structure
 */
function parseEstimateRow(values: string[], headers: string[], category: string): ParsedEstimateRow | null {
  if (values.length === 0) return null;

  const itemName = values[0]?.trim();
  if (!itemName || itemName.toLowerCase().includes('subtotal') || itemName.toLowerCase().includes('total')) {
    return null;
  }

  // Find column indices
  const qtyIndex = findColumnIndex(headers, ['qty', 'quantity']);
  const unitIndex = findColumnIndex(headers, ['unit']);
  const materialUnitCostIndex = findColumnIndex(headers, ['unit cost', 'material unit cost']);
  const materialCostIndex = findColumnIndex(headers, ['cost', 'material cost']);
  const laborUnitCostIndex = findColumnIndex(headers, ['labor unit cost', 'labor cost']);
  const laborCostIndex = findColumnIndex(headers, ['labor cost']);
  const totalIndex = findColumnIndex(headers, ['total estimated', 'total']);
  const markupIndex = findColumnIndex(headers, ['markup', 'markup amount']);
  const notesIndex = findColumnIndex(headers, ['notes', 'description']);

  // Parse numeric values
  const quantity = parseNumericValue(values[qtyIndex] || '0');
  const unit = values[unitIndex]?.trim() || 'ea';
  
  // Material costs
  const materialUnitCost = parseNumericValue(values[materialUnitCostIndex] || '0');
  const materialCost = parseNumericValue(values[materialCostIndex] || '0');
  
  // Labor costs  
  const laborUnitCost = parseNumericValue(values[laborUnitCostIndex] || '0');
  const laborCost = parseNumericValue(values[laborCostIndex] || '0');
  
  // Total and markup
  const totalCost = parseNumericValue(values[totalIndex] || '0');
  const markupPercent = parseMarkupPercent(values[markupIndex] || '0');
  
  const notes = values[notesIndex]?.trim();

  // Calculate subcontractor cost (assume 0 for now, can be updated later)
  const subcontractorCost = 0;

  return {
    category: category || 'other',
    name: itemName,
    quantity: quantity || 1,
    unit,
    materialCost: materialCost || (materialUnitCost * quantity),
    laborCost: laborCost || (laborUnitCost * quantity),
    subcontractorCost,
    totalCost: totalCost || (materialCost + laborCost + subcontractorCost),
    markupPercent,
    notes
  };
}

/**
 * Find column index by matching header names
 */
function findColumnIndex(headers: string[], searchTerms: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].toLowerCase();
    for (const term of searchTerms) {
      if (header.includes(term.toLowerCase())) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Parse numeric value from string (handles currency, commas, etc.)
 */
function parseNumericValue(value: string): number {
  if (!value) return 0;
  
  // Remove currency symbols, commas, and whitespace
  const cleaned = value.replace(/[$,\s]/g, '');
  
  // Handle percentage
  if (cleaned.includes('%')) {
    return parseFloat(cleaned.replace('%', '')) || 0;
  }
  
  return parseFloat(cleaned) || 0;
}

/**
 * Parse markup percentage
 */
function parseMarkupPercent(value: string): number {
  const numeric = parseNumericValue(value);
  // If it's already a percentage (like 11.1), use as-is
  if (numeric > 1) {
    return numeric;
  }
  // If it's a decimal (like 0.111), convert to percentage
  return numeric * 100;
}

/**
 * Handle Excel file upload and convert to CSV
 */
export function handleExcelFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      reject(new Error('Please upload a CSV file. You can export your Excel file as CSV first.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      resolve(content);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
