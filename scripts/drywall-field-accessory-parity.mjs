/**
 * Spot-check field accessory auto-calc vs drywall formulas.
 * Usage: node scripts/drywall-field-accessory-parity.mjs
 */

const SETTINGS = {
  jointCompound: {
    allPurposeBaseRate: 4800,
    allPurposeLevel4Multiplier: 5,
    allPurposeDefaultMultiplier: 11,
    liteWeightMultiplier: 8,
    easySand90Rate: 5000,
  },
  fasteners: { screwRate: 5760 },
  tape: { paperTapeRate: 1400, meshTapeLargeJobRate: 15000, meshTapeSmallJobThreshold: 6000 },
  cornerBead: { easySand90PerStick: 10, liteWeightPerStick: 15 },
}

function calc(sqft, cornerBeadQty, ceilingFinish) {
  const s = SETTINGS.jointCompound
  let allPurpose
  if (ceilingFinish.includes('Level 4') || ceilingFinish.includes('Level 5')) {
    allPurpose = Math.ceil((sqft / s.allPurposeBaseRate) * s.allPurposeLevel4Multiplier)
  } else {
    allPurpose = Math.ceil((sqft / s.allPurposeBaseRate) * s.allPurposeDefaultMultiplier)
  }
  const lite =
    Math.ceil((sqft / s.allPurposeBaseRate) * s.liteWeightMultiplier) +
    Math.ceil(cornerBeadQty / SETTINGS.cornerBead.liteWeightPerStick)
  const easy =
    Math.ceil(sqft / s.easySand90Rate) +
    Math.ceil(cornerBeadQty / SETTINGS.cornerBead.easySand90PerStick)
  const screws = Math.ceil(sqft / SETTINGS.fasteners.screwRate)
  const paper = Math.ceil(sqft / SETTINGS.tape.paperTapeRate)
  const mesh =
    sqft < SETTINGS.tape.meshTapeSmallJobThreshold
      ? Math.ceil(sqft / 1000)
      : Math.ceil(sqft / SETTINGS.tape.meshTapeLargeJobRate)
  return { allPurpose, lite, easy, screws, paper, mesh }
}

// Goodwill Multi: 48,140 base @ 10% waste
const goodwillSqft = Math.round(48140 * 1.1)
const level4 = calc(goodwillSqft, 0, 'Level 4')
console.log('Goodwill Multi sqft+waste:', goodwillSqft)
console.log('Level 4 finish — All Purpose boxes:', level4.allPurpose)
console.log('Level 4 finish — Lite Weight boxes:', level4.lite)
console.log('Level 4 finish — Easy Sand 90 bags:', level4.easy)
console.log('Level 4 finish — Screws (boxes):', level4.screws)
console.log('Level 4 finish — Paper tape rolls:', level4.paper)

const cornerBeadTest = calc(10000, 120, 'Level 4')
console.log('\n10,000 sqft + 120 corner bead pcs:')
console.log('  Lite Weight:', cornerBeadTest.lite, '(expect base 17 + 8 = 25)')
console.log('  Easy Sand 90:', cornerBeadTest.easy, '(expect base 2 + 12 = 14)')
