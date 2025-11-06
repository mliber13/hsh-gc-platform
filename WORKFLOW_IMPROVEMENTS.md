# Workflow Improvements - Project Setup & Budget Entry

## Current State Analysis

### What We Have Now
- **Project Creation Form** collects:
  - Project name, type
  - Plan ID (with options)
  - Address
  - Start/end dates
  
- **Plans** have:
  - Square footage
  - Bedrooms, bathrooms
  - Stories, garage spaces
  - But this data isn't transferred to projects or used for estimates

### The Problem
1. **Missing Context**: When entering budget items, you don't have key project specs visible
2. **No Auto-Population**: Can't use sqft/bedrooms/baths to suggest quantities or costs
3. **Workflow Friction**: Have to manually calculate or remember project specs while estimating
4. **Layout Issues**: Form might feel incomplete or disconnected from estimate entry

---

## Proposed Solution: Enhanced Project Setup

### Phase 1: Expand Project Information Collection

#### Add to Project Creation Form:

**Section 1: Basic Info** (Current - keep as is)
- Project name
- Project type
- Plan ID
- Plan options

**Section 2: Project Specifications** (NEW)
- **Living Square Footage** (required)
  - Auto-populate from plan if selected
  - Allow override for custom plans
  - Display prominently in estimate view
  
- **Total Square Footage** (optional)
  - Includes garage, basement, etc.
  
- **Bedrooms** (auto from plan, editable)
- **Bathrooms** (auto from plan, editable)
- **Stories/Levels** (auto from plan, editable)
- **Garage Spaces** (auto from plan, editable)

**Section 3: Additional Context** (NEW - Optional but helpful)
- **Basement**: None / Unfinished / Finished / Partial
- **Lot Size** (acres or sqft)
- **Foundation Type**: Slab / Crawl / Basement / Other
- **Roof Type**: Shingle / Metal / Tile / Other
- **Exterior Material**: Vinyl / Brick / Stone / Fiber Cement / Other
- **Special Features**: Pool, Deck, Porch, etc. (multi-select)

**Section 4: Location** (Current - keep as is)
- Address, city, state, zip

**Section 5: Timeline** (Current - keep as is)
- Start date, end date

---

### Phase 2: Use This Data to Inform Estimates

#### Smart Budget Suggestions

When entering estimate items, use project specs to:

1. **Auto-Calculate Quantities**:
   - Drywall: `livingSqft * 3.5` (walls + ceiling)
   - Flooring: `livingSqft` (with waste factor)
   - Paint: `livingSqft * 2.5` (walls)
   - Insulation: Based on sqft and stories
   - HVAC: Based on sqft and stories
   - Electrical: Based on bedrooms/baths/sqft

2. **Suggest Unit Costs**:
   - Use historical data per sqft
   - Adjust based on project type
   - Show confidence level

3. **Display Context Panel**:
   - Show project specs prominently in EstimateBuilder
   - "This is a 2,500 sqft, 3BR/2BA, 2-story home"
   - Quick reference while entering items

4. **Validation Warnings**:
   - "Your drywall quantity seems low for 2,500 sqft"
   - "Average cost per sqft for this type is $X, you're at $Y"

---

### Phase 3: Improved Layout & Workflow

#### Option A: Multi-Step Form
1. **Step 1**: Basic Info (name, type, plan)
2. **Step 2**: Project Specs (sqft, bedrooms, etc.)
3. **Step 3**: Location & Timeline
4. **Step 4**: Review & Create

**Pros**: Less overwhelming, logical flow
**Cons**: More clicks, can't see full picture

#### Option B: Single Form with Sections (Recommended)
- Collapsible sections
- Progress indicator
- Auto-save as you go
- "Smart defaults" button to fill from plan

**Pros**: See everything, flexible
**Cons**: Can feel long

#### Option C: Two-Part Creation
1. **Quick Create**: Just name, type, plan → Go to estimate
2. **Enhance Later**: Add specs when ready (button in estimate view)

**Pros**: Fast start, don't block workflow
**Cons**: Might forget to add details

---

## Recommended Approach

### Immediate Changes (High Impact, Low Effort)

1. **Add Project Specs to Form**:
   - Living sqft (required, auto from plan)
   - Bedrooms, bathrooms (auto from plan)
   - Stories, garage (auto from plan)
   - Store in `project.metadata.specs` or new `project.specs` field

2. **Display Specs in EstimateBuilder**:
   - Header card showing key specs
   - "2,500 sqft | 3BR/2BA | 2-Story"
   - Always visible while estimating

3. **Add "Quick Calculate" Helper**:
   - Button next to quantity fields
   - "Calculate from sqft" → shows formula
   - User confirms or adjusts

### Medium-Term (Next Sprint)

4. **Smart Suggestions**:
   - When adding trade item, suggest quantity based on specs
   - "For 2,500 sqft, typical drywall is ~8,750 sqft"
   - User can accept or override

5. **Cost Per Sqft Tracking**:
   - Show running cost/sqft as items added
   - Compare to historical averages
   - Warning if way off

6. **Spec-Based Templates**:
   - "Apply standard items for 2,500 sqft home"
   - Pre-populates common items with quantities

### Long-Term (Phase 3)

7. **Historical Learning**:
   - "Similar projects (2,000-3,000 sqft, 3BR) average $X/sqft"
   - Suggest adjustments based on what worked before

---

## Data Model Changes

### Update Project Type

```typescript
export interface Project {
  // ... existing fields ...
  
  // Project specifications (NEW)
  specs?: {
    livingSquareFootage: number        // Required
    totalSquareFootage?: number
    bedrooms?: number
    bathrooms?: number
    stories?: number
    garageSpaces?: number
    basement?: 'none' | 'unfinished' | 'finished' | 'partial'
    lotSize?: number                   // in sqft or acres
    foundationType?: string
    roofType?: string
    exteriorMaterial?: string
    specialFeatures?: string[]         // Pool, deck, porch, etc.
  }
  
  // Keep metadata for plan tracking
  metadata?: {
    planId?: string
    planOptions?: string[]
    [key: string]: any
  }
}
```

### Update CreateProjectInput

```typescript
export interface CreateProjectInput {
  // ... existing fields ...
  
  specs?: {
    livingSquareFootage: number
    totalSquareFootage?: number
    bedrooms?: number
    bathrooms?: number
    stories?: number
    garageSpaces?: number
    basement?: 'none' | 'unfinished' | 'finished' | 'partial'
    lotSize?: number
    foundationType?: string
    roofType?: string
    exteriorMaterial?: string
    specialFeatures?: string[]
  }
}
```

---

## Implementation Plan

### Step 1: Update Data Model
- [ ] Add `specs` field to Project type
- [ ] Update CreateProjectInput type
- [ ] Update database schema (Supabase)

### Step 2: Enhance CreateProjectForm
- [ ] Add "Project Specifications" section
- [ ] Auto-populate from selected plan
- [ ] Allow manual override
- [ ] Make living sqft required

### Step 3: Display in EstimateBuilder
- [ ] Add specs display card in header
- [ ] Show key metrics prominently
- [ ] Make it collapsible but visible by default

### Step 4: Add Calculation Helpers
- [ ] Create `calculateFromSpecs()` utility functions
- [ ] Add "Quick Calculate" buttons to quantity fields
- [ ] Show formulas and let user confirm

### Step 5: Smart Suggestions (Future)
- [ ] Build suggestion engine
- [ ] Use historical data
- [ ] Show confidence levels

---

## Questions to Consider

1. **Required vs Optional**: Should living sqft be required, or can they skip and add later?
   - **Recommendation**: Required for new builds, optional for renovations

2. **Plan Integration**: If plan has specs, should we lock them or allow override?
   - **Recommendation**: Auto-fill but allow override (plans might be modified)

3. **Custom Plans**: How to handle specs for custom plans?
   - **Recommendation**: Manual entry required, no auto-fill

4. **Renovations**: How do specs work for remodels?
   - **Recommendation**: 
     - Existing sqft (what's there)
     - Added sqft (what's new)
     - Modified sqft (what's being changed)

5. **Workflow**: Should specs be editable after project creation?
   - **Recommendation**: Yes, but show warning if estimate items exist

---

## Success Metrics

After implementing:
- [ ] Can create project with specs in < 2 minutes
- [ ] Specs visible while estimating (no switching views)
- [ ] At least 3 budget items can be auto-calculated from specs
- [ ] Users report faster estimate entry
- [ ] Cost per sqft tracking helps catch errors

---

## Next Steps

1. **Review this plan** - Does this address your concerns?
2. **Prioritize features** - What's most important to you?
3. **Start with Step 1-2** - Get specs collection working first
4. **Iterate** - Add smart features as you use it

Let's discuss what resonates and what we should tackle first!

