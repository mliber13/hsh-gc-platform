# Services

This directory contains all business logic and data persistence services for the HSH GC Platform.

## Files

### `storage.ts`
**localStorage-based data persistence layer**

Provides CRUD operations for all entities using localStorage. Will be replaced with cloud database (Supabase/Firebase) in Phase 3+.

**Key Features:**
- Generic `StorageService<T>` class for type-safe storage operations
- Individual storage instances for each entity type
- Helper functions for complex queries
- Data export/import functionality
- Backup/restore capabilities
- Storage statistics

**Usage:**
```typescript
import { projectStorage, getCompleteProject } from '@/services'

// Get all projects
const projects = projectStorage.getAll()

// Get project by ID
const project = projectStorage.getById('project-123')

// Create new project
const newProject = projectStorage.create(projectData)

// Update project
projectStorage.update('project-123', { name: 'Updated Name' })

// Delete project
projectStorage.delete('project-123')

// Filter projects
const activeProjects = projectStorage.filter(p => p.status === 'in-progress')

// Get complete project with all related data
const fullProject = getCompleteProject('project-123')
```

**Available Storage Instances:**
- `projectStorage` - Projects
- `estimateStorage` - Estimates
- `tradeStorage` - Trade line items
- `takeoffStorage` - Takeoff measurements
- `laborStorage` - Labor entries
- `materialStorage` - Material entries
- `subcontractorStorage` - Subcontractor entries
- `dailyLogStorage` - Daily logs
- `changeOrderStorage` - Change orders
- `timeClockStorage` - Time clock entries
- `historicalRateStorage` - Historical rates
- `estimateTemplateStorage` - Estimate templates
- `scheduleTemplateStorage` - Schedule templates

---

### `projectService.ts`
**Project lifecycle management**

High-level business logic for project operations.

**Key Functions:**

**CRUD Operations:**
```typescript
import { createProject, updateProject, deleteProject } from '@/services'

// Create project
const project = createProject({
  name: "Smith Residence",
  client: { name: "John Smith" },
  type: "residential"
})

// Update project
updateProject(projectId, { name: "Updated Name" })

// Delete project (and all related data)
deleteProject(projectId)
```

**Status Management:**
```typescript
import { changeProjectStatus, awardProject, startProject } from '@/services'

// Change status
changeProjectStatus(projectId, 'in-progress')

// Convenience methods
awardProject(projectId)  // Move to awarded
startProject(projectId)  // Move to in-progress
completeProject(projectId)  // Mark complete
archiveProject(projectId)  // Archive
```

**Queries:**
```typescript
import { getActiveProjects, searchProjects } from '@/services'

// Get active projects
const active = getActiveProjectsList()

// Get projects by status
const bidding = getProjectsByStatusList('bidding')

// Search
const results = searchProjectsList('smith')
```

**Analytics:**
```typescript
import { getProjectSummary, getDashboardStats } from '@/services'

// Get project summary
const summary = getProjectSummary(projectId)
// Returns: estimated cost, actual cost, variance, progress, etc.

// Get dashboard statistics
const stats = getDashboardStats()
// Returns: total projects, active count, value, breakdown by status
```

---

### `estimateService.ts`
**Estimate and trade management**

Business logic for building estimates and managing trades.

**Estimate Operations:**
```typescript
import { recalculateEstimate, updateEstimateMargins } from '@/services'

// Update margins (overhead, profit, contingency)
updateEstimateMargins(estimateId, {
  overhead: 1500,  // $1,500 overhead
  profit: 2500,    // $2,500 profit
  contingency: 1000  // $1,000 contingency
})

// Recalculate estimate totals
recalculateEstimate(estimateId)

// Get complete estimate with all trades
const estimate = getCompleteEstimate(estimateId)
```

**Trade Operations:**
```typescript
import { addTrade, updateTrade, deleteTrade } from '@/services'

// Add trade
const trade = addTrade(estimateId, {
  category: 'framing',
  name: 'Frame exterior walls',
  quantity: 2400,
  unit: 'sqft',
  laborCost: 4800,
  materialCost: 3600,
  subcontractorCost: 0,
  isSubcontracted: false,
  wasteFactor: 10
})

// Update trade
updateTrade(tradeId, { quantity: 2500 })

// Delete trade
deleteTrade(tradeId)

// Bulk add trades
bulkAddTrades(estimateId, [trade1, trade2, trade3])

// Reorder trades
reorderTrades(estimateId, [tradeId1, tradeId2, tradeId3])
```

**Takeoff Operations:**
```typescript
import { addTakeoffItem, updateTakeoffItem } from '@/services'

// Add takeoff item
const takeoff = addTakeoffItem(estimateId, {
  name: "North wall",
  category: "Wall",
  length: 40,
  height: 10,
  area: 400,
  unit: 'sqft'
})
```

**Cost Calculations:**
```typescript
import { 
  calculateLaborCost, 
  calculateMaterialCostWithWaste,
  calculateCostPerUnit 
} from '@/services'

// Labor cost from hours
const laborCost = calculateLaborCost(40, 45)  // 40 hours @ $45/hr = $1,800

// Material cost with waste
const materialCost = calculateMaterialCostWithWaste(
  100,  // quantity
  25,   // $25/unit
  10    // 10% waste
)  // = $2,750

// Cost per unit (rate)
const rate = calculateCostPerUnit(4800, 2400)  // $2/sqft
```

**Estimate Analysis:**
```typescript
import { analyzeEstimate } from '@/services'

const analysis = analyzeEstimate(estimateId)
// Returns:
// - isComplete: boolean
// - warnings: string[]
// - suggestions: string[]
// - tradeCount: number
```

---

### `calculationService.ts`
**Centralized calculation functions**

All mathematical operations for estimates, variance, productivity, and analytics.

**Estimate Calculations:**
```typescript
import { 
  calculateTradeTotalCost,
  calculateMaterialWithWaste,
  calculateEstimateTotals 
} from '@/services'

// Trade total cost
const total = calculateTradeTotalCost(4800, 3600, 0)  // labor + material + sub

// Material with waste (detailed breakdown)
const material = calculateMaterialWithWaste(100, 25, 10)
// Returns: { baseAmount, wasteAmount, totalAmount, adjustedQuantity }

// Estimate totals with margins
const totals = calculateEstimateTotals(
  50000,  // subtotal
  10,     // 10% overhead
  15,     // 15% profit
  5       // 5% contingency
)
// Returns: { subtotal, overhead, profit, contingency, total, margin, marginPercent }
```

**Variance Calculations:**
```typescript
import { calculateVariance, calculateProjectVariance } from '@/services'

// Basic variance
const variance = calculateVariance(50000, 52000)
// Returns: { variance, variancePercent, isOverBudget, isUnderBudget }

// Project variance with projection
const projectVariance = calculateProjectVariance(
  50000,  // estimated
  26000,  // actual (so far)
  50      // 50% complete
)
// Returns: { variance, projectedFinalCost, projectedVariance, costToComplete }
```

**Progress & Schedule:**
```typescript
import { calculateProgressSummary, calculateSchedulePerformance } from '@/services'

// Progress summary
const progress = calculateProgressSummary(50000, 26000, 50)
// Returns: { percentComplete, estimatedCost, actualCost, costToComplete, projectedFinalCost }

// Schedule performance
const schedule = calculateSchedulePerformance(
  startDate,
  estimatedEndDate,
  null,  // not complete yet
  55     // 55% complete
)
// Returns: { totalDays, daysElapsed, expectedPercentComplete, isAhead, isBehind }
```

**Profitability:**
```typescript
import { calculateMargin, calculatePriceForMargin } from '@/services'

// Calculate margin
const margin = calculateMargin(50000, 35000)
// Returns: { grossProfit: 15000, grossMargin: 30%, markup: 42.86% }

// Required price for target margin
const price = calculatePriceForMargin(35000, 30)  // Cost $35k, want 30% margin
// Returns: $50,000
```

**Productivity:**
```typescript
import { calculateProductivityRate, calculateActualCostPerUnit } from '@/services'

// Productivity rate
const productivity = calculateProductivityRate(400, 40, 'sqft')
// Returns: { unitsPerHour: 10, hoursPerUnit: 0.1, unit: 'sqft' }

// Actual cost per unit
const costPerUnit = calculateActualCostPerUnit(4800, 2400, 'sqft')
// Returns: { costPerUnit: 2, unit: 'sqft' }
```

**Statistical Functions:**
```typescript
import { 
  calculateAverage, 
  calculateStandardDeviation,
  determineConfidenceLevel 
} from '@/services'

// Average
const avg = calculateAverage([10, 15, 20, 25])  // 17.5

// Standard deviation
const stdDev = calculateStandardDeviation([10, 15, 20, 25])  // ~5.59

// Confidence level based on sample size
const confidence = determineConfidenceLevel(6)  // 'high'
```

---

## Architecture

### Storage Layer
```
Components → Services → Storage → localStorage
```

1. **Components** call service functions (high-level operations)
2. **Services** contain business logic and orchestration
3. **Storage** handles CRUD operations
4. **localStorage** persists data (will be replaced with cloud DB later)

### Data Flow Example

**Creating a project:**
```typescript
// Component calls service
const project = createProject(input)

// Service orchestrates:
//   1. Generate IDs
//   2. Create initial estimate
//   3. Set timestamps
//   4. Call storage layer

// Storage saves to localStorage
projectStorage.create(project)
estimateStorage.create(estimate)
```

**Updating a trade:**
```typescript
// Component calls service
updateTrade(tradeId, { quantity: 2500 })

// Service:
//   1. Updates trade
//   2. Recalculates trade total
//   3. Recalculates estimate totals
//   4. Updates project

// Storage updates localStorage
tradeStorage.update(tradeId, updates)
estimateStorage.update(estimateId, totals)
projectStorage.update(projectId, { updatedAt })
```

---

## Best Practices

### 1. Always Use Services, Not Storage Directly
```typescript
// ❌ DON'T: Use storage directly in components
import { projectStorage } from '@/services'
projectStorage.create(project)

// ✅ DO: Use service functions
import { createProject } from '@/services'
createProject(input)
```

**Why?** Services handle business logic, validation, and related updates. Direct storage access bypasses this.

### 2. Transactions Are Manual
Since we're using localStorage (not a real database), there are no automatic transactions. Services handle related updates manually:

```typescript
// Service ensures all related updates happen together
export function deleteTrade(tradeId: string): boolean {
  const trade = tradeStorage.getById(tradeId)
  tradeStorage.delete(tradeId)  // Delete trade
  recalculateEstimate(trade.estimateId)  // Update estimate
  // Both happen or neither (manual transaction)
}
```

### 3. Always Recalculate Totals
When trades change, always recalculate estimate totals:

```typescript
addTrade(estimateId, input)  // Automatically recalculates
updateTrade(tradeId, updates)  // Automatically recalculates
deleteTrade(tradeId)  // Automatically recalculates
```

### 4. Use Calculation Functions
Don't calculate manually in components. Use calculation services:

```typescript
// ❌ DON'T
const total = laborCost + materialCost + subCost

// ✅ DO
import { calculateTradeTotalCost } from '@/services'
const total = calculateTradeTotalCost(laborCost, materialCost, subCost)
```

### 5. Handle Null Returns
Storage queries can return `null`:

```typescript
const project = getProject(projectId)
if (!project) {
  // Handle not found
  return
}
// Use project
```

---

## Migration to Cloud Database

When moving to Supabase/Firebase in Phase 3:

1. **Keep service layer unchanged** - Components won't need updates
2. **Replace storage.ts** - Implement new storage service with same interface
3. **Add real transactions** - Use database transactions for atomicity
4. **Add real-time sync** - Subscribe to changes across devices
5. **Add authentication** - Integrate user auth

Example migration:
```typescript
// storage.ts -> supabaseStorage.ts
class SupabaseStorageService<T> {
  async getAll(): Promise<T[]> {
    const { data } = await supabase.from(this.table).select('*')
    return data
  }
  // Same interface, different implementation
}
```

---

## Testing

Test services by mocking the storage layer:

```typescript
// Mock storage
jest.mock('@/services/storage', () => ({
  projectStorage: {
    getById: jest.fn(),
    create: jest.fn(),
  }
}))

// Test service
import { createProject } from '@/services'
const project = createProject(input)
expect(projectStorage.create).toHaveBeenCalledWith(expect.objectContaining({
  name: input.name
}))
```

---

## Performance Considerations

### localStorage Limits
- **Limit**: ~5-10MB per domain
- **Current usage**: Check with `getStorageStats()`
- **Backup**: Use `downloadBackup()` regularly

### Optimization Tips
1. **Lazy load** - Only load data when needed
2. **Filter at storage** - Don't load everything then filter
3. **Cache expensive calculations** - Store results when possible
4. **Debounce saves** - Don't save on every keystroke

---

## Future Enhancements

### Phase 3: Intelligence Layer
- Historical rate calculations
- Variance analysis
- Machine learning predictions
- Smart estimate suggestions

### Phase 4: Advanced Features
- Real-time collaboration
- Offline support with sync
- Audit logging
- Version control for estimates




