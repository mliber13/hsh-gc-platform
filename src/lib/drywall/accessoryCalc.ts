// @ts-nocheck — parity port from FieldMeasurementStage.jsx calculateAccessories + merge
import { generateFieldId } from '@/lib/drywall/fieldMeasurementUtils'
import type { DrywallQuote, FieldAccessoryEntry } from '@/types/drywall'

export interface AccessoryCalcQuoteInput {
  ceilingFinish?: string
  ceilingFinishOther?: string
}

const DEFAULT_SETTINGS = {
  jointCompound: {
    allPurposeBaseRate: 4800,
    allPurposeLevel4Multiplier: 5,
    allPurposeLevel5Multiplier: 5,
    allPurposeStompMultiplier: 11,
    allPurposeSplatterMultiplier: 9,
    allPurposeDefaultMultiplier: 11,
    liteWeightMultiplier: 8,
    easySand90Rate: 5000,
  },
  fasteners: { screwRate: 5760 },
  adhesives: { titeBondRate: 5760 },
  tape: {
    paperTapeRate: 1400,
    meshTapeLargeJobRate: 15000,
    meshTapeSmallJobRate: 1000,
    meshTapeSmallJobThreshold: 6000,
  },
  cornerBead: {
    easySand90PerStick: 10,
    liteWeightPerStick: 15,
  },
}

function resolveCeilingFinish(quote: AccessoryCalcQuoteInput): string {
  const ceilingFinish = quote.ceilingFinish || ''
  const ceilingFinishOther = quote.ceilingFinishOther || ''
  return ceilingFinish === 'Other' ? ceilingFinishOther : ceilingFinish
}

/** Auto-calculated accessory rows from measured sqft + manual corner bead pcs. */
export function calculateFieldAccessories(
  sqft: number,
  cornerBeadQty = 0,
  quote: AccessoryCalcQuoteInput = {},
): FieldAccessoryEntry[] {
  if (sqft === 0) return []

  const settings = DEFAULT_SETTINGS
  const actualCeilingFinish = resolveCeilingFinish(quote)

  let allPurposeBoxes = 0
  if (actualCeilingFinish.includes('Splatter Knockdown')) {
    allPurposeBoxes = Math.ceil(
      (sqft / settings.jointCompound.allPurposeBaseRate) *
        settings.jointCompound.allPurposeSplatterMultiplier,
    )
  } else if (
    actualCeilingFinish.includes('Stomp') ||
    actualCeilingFinish.includes('Knockdown')
  ) {
    allPurposeBoxes = Math.ceil(
      (sqft / settings.jointCompound.allPurposeBaseRate) *
        settings.jointCompound.allPurposeStompMultiplier,
    )
  } else if (
    actualCeilingFinish.includes('Level 4') ||
    actualCeilingFinish.includes('Level 5')
  ) {
    allPurposeBoxes = Math.ceil(
      (sqft / settings.jointCompound.allPurposeBaseRate) *
        settings.jointCompound.allPurposeLevel4Multiplier,
    )
  } else {
    allPurposeBoxes = Math.ceil(
      (sqft / settings.jointCompound.allPurposeBaseRate) *
        settings.jointCompound.allPurposeDefaultMultiplier,
    )
  }

  const baseLiteWeightBoxes = Math.ceil(
    (sqft / settings.jointCompound.allPurposeBaseRate) *
      settings.jointCompound.liteWeightMultiplier,
  )
  const baseEasySand90Bags = Math.ceil(sqft / settings.jointCompound.easySand90Rate)
  const additionalEasySand90Bags = Math.ceil(
    cornerBeadQty / settings.cornerBead.easySand90PerStick,
  )
  const additionalLiteWeightBoxes = Math.ceil(
    cornerBeadQty / settings.cornerBead.liteWeightPerStick,
  )
  const liteWeightBoxes = baseLiteWeightBoxes + additionalLiteWeightBoxes
  const easySand90Bags = baseEasySand90Bags + additionalEasySand90Bags
  const titeBondFoamCans = Math.ceil(sqft / settings.adhesives.titeBondRate)
  const screwBoxes = Math.ceil(sqft / settings.fasteners.screwRate)
  const paperTapeRolls = Math.ceil(sqft / settings.tape.paperTapeRate)

  let meshTapeRolls: number
  if (sqft < settings.tape.meshTapeSmallJobThreshold) {
    meshTapeRolls = Math.ceil(sqft / settings.tape.meshTapeSmallJobRate)
  } else {
    meshTapeRolls = Math.ceil(sqft / settings.tape.meshTapeLargeJobRate)
  }

  return [
    {
      id: generateFieldId(),
      type: 'Joint Compound',
      subtype: 'All Purpose Joint Compound',
      quantity: allPurposeBoxes.toString(),
      unit: 'Box',
      autoCalculated: true,
    },
    {
      id: generateFieldId(),
      type: 'Joint Compound',
      subtype: 'Lite Weight Joint Compound',
      quantity: liteWeightBoxes.toString(),
      unit: 'Box',
      autoCalculated: true,
    },
    {
      id: generateFieldId(),
      type: 'Joint Compound',
      subtype: 'Easy Sand 90',
      quantity: easySand90Bags.toString(),
      unit: 'Bags',
      autoCalculated: true,
    },
    {
      id: generateFieldId(),
      type: 'Fasteners',
      subtype: 'Drywall Screws 1-1/4"',
      threadType: 'Coarse Thread',
      quantity: screwBoxes.toString(),
      unit: 'Box',
      autoCalculated: true,
    },
    {
      id: generateFieldId(),
      type: 'Adhesives',
      subtype: 'TiteBond Foam',
      quantity: titeBondFoamCans.toString(),
      unit: 'Tube',
      autoCalculated: true,
    },
    {
      id: generateFieldId(),
      type: 'Adhesives',
      subtype: 'Spray Adhesive',
      quantity: '1',
      unit: 'Can',
      autoCalculated: true,
    },
    {
      id: generateFieldId(),
      type: 'Tape',
      subtype: "500' Paper Tape",
      quantity: paperTapeRolls.toString(),
      unit: 'Roll',
      autoCalculated: true,
    },
    {
      id: generateFieldId(),
      type: 'Tape',
      subtype: "300' Mesh Tape",
      quantity: meshTapeRolls.toString(),
      unit: 'Roll',
      autoCalculated: true,
    },
  ]
}

export function totalManualCornerBeadQuantity(accessories: FieldAccessoryEntry[]): number {
  return accessories
    .filter((acc) => acc.type === 'Corner Bead' && !acc.autoCalculated)
    .reduce((sum, acc) => sum + (parseFloat(String(acc.quantity)) || 0), 0)
}

/** Merge auto rows into existing list; preserve manual edits (drywall useEffect). */
export function mergeAutoAccessories(
  existingAccessories: FieldAccessoryEntry[],
  autoAccessories: FieldAccessoryEntry[],
): FieldAccessoryEntry[] {
  const manualAccessories = existingAccessories.filter((acc) => !acc.autoCalculated)

  const updatedAutoAccessories = autoAccessories.map((autoAcc) => {
    const existing = existingAccessories.find(
      (e) =>
        e.autoCalculated &&
        e.type === autoAcc.type &&
        e.subtype === autoAcc.subtype &&
        (e.threadType || '') === (autoAcc.threadType || '') &&
        (e.length || '') === (autoAcc.length || ''),
    )

    if (existing) {
      const shouldPreserveQuantity = existing.manuallyEdited === true
      return {
        ...existing,
        quantity: shouldPreserveQuantity ? existing.quantity : autoAcc.quantity,
        unit: autoAcc.unit,
      }
    }
    return autoAcc
  })

  return [...updatedAutoAccessories, ...manualAccessories]
}

export function quoteInputFromDrywallQuote(quote: DrywallQuote | null | undefined): AccessoryCalcQuoteInput {
  if (!quote) return {}
  return {
    ceilingFinish: String(quote.ceilingFinish ?? ''),
    ceilingFinishOther: String(quote.ceilingFinishOther ?? ''),
  }
}
