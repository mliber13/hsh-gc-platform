# Type Definitions

This directory contains all TypeScript type definitions for the HSH GC Platform.

## Files

### `project.ts`
Core data model types for the entire platform.

**Key Types:**
- `Project` - Main project entity with estimate, actuals, and schedule
- `Estimate` - Bid/estimate with trades and cost breakdown
- `Trade` - Individual line items in an estimate (framing, electrical, etc.)
- `ProjectActuals` - Actual costs tracked during execution
- `LaborEntry`, `MaterialEntry`, `SubcontractorEntry` - Cost tracking
- `DailyLog` - Daily field reports with weather, progress, issues
- `ChangeOrder` - Scope changes with cost and schedule impact
- `ProjectSchedule`, `ScheduleItem` - Project timeline
- `HistoricalRate` - Historical cost data for future estimates
- `VarianceAnalysis` - Estimated vs. actual comparison
- `TimeClockEntry` - Location-based time tracking

### `forms.ts`
Input types for creating and updating entities.

**Key Types:**
- `CreateProjectInput`, `UpdateProjectInput` - Project creation/editing
- `TradeInput`, `TakeoffInput` - Estimate builder forms
- `LaborEntryInput`, `MaterialEntryInput` - Cost entry forms
- `DailyLogInput` - Daily log entry
- `ChangeOrderInput` - Change order requests
- `EstimateTemplate`, `ScheduleTemplate` - Reusable templates
- Filter and sort types for data queries

### `api.ts`
API response and request types.

**Key Types:**
- `ApiResponse<T>` - Standard API response wrapper
- `PaginatedResponse<T>` - Paginated data responses
- `ProjectResponse`, `ProjectListResponse` - Project queries
- `DashboardData` - Dashboard analytics
- `VarianceReport` - Cost variance analysis
- `HistoricalRatesReport` - Historical data reports
- `ProfitabilityReport` - Financial analysis
- `EstimateRecommendations` - AI-powered estimate suggestions
- `ExportResponse` - PDF/Excel export handling

### `constants.ts`
Constants, enums, and helper functions.

**Exports:**
- `TRADE_CATEGORIES` - All construction trades with labels and icons
- `UNIT_TYPES` - Measurement units (sqft, linear ft, etc.)
- `PROJECT_TYPES` - Project type definitions
- `PROJECT_STATUS` - Project status with colors and descriptions
- `DEFAULT_VALUES` - System defaults (overhead %, profit %, etc.)
- Helper functions: `formatCurrency()`, `calculateVariance()`, etc.
- Validation rules

### `index.ts`
Re-exports all types for convenient importing.

## Usage

Import types in your components and services:

```typescript
// Import specific types
import { Project, Trade, LaborEntry } from '@/types'

// Import form types
import { CreateProjectInput, TradeInput } from '@/types'

// Import constants and helpers
import { TRADE_CATEGORIES, formatCurrency, calculateVariance } from '@/types'

// Import API types
import { ApiResponse, DashboardData } from '@/types'
```

## Type Organization

### Core Entity Pattern
Each major entity follows this pattern:
1. **Main Type** (`Project`, `Estimate`, etc.) - Complete entity with all fields
2. **Input Type** (`CreateProjectInput`) - Required fields for creation
3. **Update Type** (`UpdateProjectInput`) - Partial fields for updates
4. **Response Type** (`ProjectResponse`) - API response with additional data

### Enums & Discriminated Unions
We use string literal unions for type safety:
```typescript
type ProjectStatus = 'estimating' | 'bidding' | 'awarded' | 'in-progress' | 'complete'
```

This provides autocomplete and prevents invalid values.

## Key Design Decisions

### 1. Estimate-to-Execution Link
- `Trade.id` links estimate line items to actual costs
- `tradeId` field in `LaborEntry`, `MaterialEntry` connects actuals to estimates
- Enables variance analysis and historical learning

### 2. Historical Intelligence
- `HistoricalRate` aggregates data across projects
- `confidenceLevel` indicates data reliability
- Powers smart estimate suggestions

### 3. Location-Based Time Tracking
- `TimeClockEntry` includes GPS coordinates
- `geofenceRadius` validates clock-in location
- Integrated into time clock interface per user preference

### 4. Schedule Templates Without Sub-Tasks
- `ScheduleTemplate.items` contains high-level items only
- No nested sub-schedule tasks per user preference
- Keeps schedules clean and manageable

### 5. Flexible Cost Structure
- Each trade tracks labor, material, and subcontractor costs separately
- Supports both self-performed and subcontracted work
- Waste factors for material tracking

## Adding New Types

When adding new types:

1. **Add to appropriate file** - `project.ts` for entities, `forms.ts` for inputs, etc.
2. **Export from `index.ts`** - Make it available to the rest of the app
3. **Add constants** - If there are enum values, add to `constants.ts`
4. **Update this README** - Document the new type and its purpose

## Type Safety Tips

1. **Use discriminated unions** for status/type fields
2. **Make IDs required** in main types, optional in input types
3. **Use `Partial<T>`** for update operations
4. **Date types** - Use `Date` objects, not strings
5. **Optional chaining** - Use `field?.subfield` for optional properties

## Examples

### Creating a Project
```typescript
const input: CreateProjectInput = {
  name: "Smith Residence",
  client: {
    name: "John Smith",
    email: "john@example.com"
  },
  type: "residential",
  startDate: new Date("2024-03-01")
}
```

### Adding a Trade to Estimate
```typescript
const trade: TradeInput = {
  category: "framing",
  name: "Frame exterior walls",
  quantity: 2400,
  unit: "sqft",
  laborCost: 4800,
  materialCost: 3600,
  subcontractorCost: 0,
  isSubcontracted: false,
  wasteFactor: 10
}
```

### Recording Labor
```typescript
const labor: LaborEntryInput = {
  projectId: "proj-123",
  tradeId: "trade-456", // Links to estimate
  date: new Date(),
  crew: [
    { name: "John Doe", role: "Foreman", hours: 8, rate: 45 }
  ],
  trade: "framing",
  description: "Framed north wall",
  quantityCompleted: 300,
  unit: "sqft"
}
```

---

**Note**: These types represent the complete data model for the entire platform. Start with `Project` and `Estimate` types when building the first features.


