/**
 * Q.C.1 spot-check: v3 accessory quantities vs v2 accessoryCalc for 1,000 sqft Level 4.
 * Usage: node scripts/quote-v3-accessory-spotcheck.mjs
 */

const SETTINGS = {
  jointCompound: {
    allPurposeBaseRate: 4800,
    allPurposeLevel4Multiplier: 5,
    liteWeightMultiplier: 8,
    easySand90Rate: 5000,
    firetapeReducedMultiplier: 2,
  },
  fasteners: { screwRate: 5760 },
  tape: {
    paperTapeRate: 1400,
    meshTapeLargeJobRate: 15000,
    meshTapeSmallJobRate: 1000,
    meshTapeSmallJobThreshold: 6000,
  },
}

const RATES = {
  joint_compound_all_purpose: 22,
  joint_compound_lite_weight: 20,
  joint_compound_easy_sand_90: 12,
  tape_paper_500ft: 8,
  tape_mesh_300ft: 15,
  screws_1_25_coarse: 35,
}

function v2Level4(sqft) {
  const s = SETTINGS.jointCompound
  const allPurpose = Math.ceil((sqft / s.allPurposeBaseRate) * s.allPurposeLevel4Multiplier)
  const lite = Math.ceil((sqft / s.allPurposeBaseRate) * s.liteWeightMultiplier)
  const easy = Math.ceil(sqft / s.easySand90Rate)
  const screws = Math.ceil(sqft / SETTINGS.fasteners.screwRate)
  const paper = Math.ceil(sqft / SETTINGS.tape.paperTapeRate)
  const mesh =
    sqft < SETTINGS.tape.meshTapeSmallJobThreshold
      ? Math.ceil(sqft / SETTINGS.tape.meshTapeSmallJobRate)
      : Math.ceil(sqft / SETTINGS.tape.meshTapeLargeJobRate)
  return { allPurpose, lite, easy, screws, paper, mesh }
}

function v3Cost(qty) {
  return (
    qty.allPurpose * RATES.joint_compound_all_purpose +
    qty.lite * RATES.joint_compound_lite_weight +
    qty.easy * RATES.joint_compound_easy_sand_90 +
    qty.screws * RATES.screws_1_25_coarse +
    qty.paper * RATES.tape_paper_500ft +
    qty.mesh * RATES.tape_mesh_300ft
  )
}

const sqft = 1000
const level4 = v2Level4(sqft)
console.log('1,000 sqft Level 4 — v2 quantity parity target:')
console.log(level4)
console.log('Accessory material cost @ seed rates: $' + v3Cost(level4).toFixed(2))

const firetapeAp = Math.ceil(
  (sqft / SETTINGS.jointCompound.allPurposeBaseRate) *
    SETTINGS.jointCompound.firetapeReducedMultiplier,
)
console.log('\n1,000 sqft Firetape Only — all-purpose boxes (reduced):', firetapeAp, '(expect 1)')

const hangScrews = Math.ceil(sqft / SETTINGS.fasteners.screwRate)
console.log('1,000 sqft Hang Only — screw boxes only:', hangScrews, '(expect 1)')
