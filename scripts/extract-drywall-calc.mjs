import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcPath =
  'c:/Users/mlibe/Documents/HSH APP/project-bolt-vitejs-vite-armltfjp 72525/project/hsh-drywall-app/src/components/workflow/QuoteStage.jsx'
const outPath = path.resolve(__dirname, '../src/lib/drywall/buildDrywallQuoteCalculations.ts')

const lines = fs.readFileSync(srcPath, 'utf8').split(/\r?\n/)
let body = lines.slice(871, 1838).join('\n')
const depIdx = body.lastIndexOf('}, [')
if (depIdx > 0) {
  const retEnd = body.lastIndexOf('};', depIdx)
  if (retEnd > 0) body = body.slice(0, retEnd + 2)
}

const header = `/**
 * Drywall quote calculations engine — ported from QuoteStage.jsx useMemo (formulas unchanged).
 */
import { calcSuspendedGridTotals } from './calculations/suspendedGridCalc'
import { LABOR_TAX_RATE, RC_CHANNEL_PIECE_LENGTH_FT } from './calculations/quantityUtils'
import { getInsulationMaterialRate, getStudRateKey } from './drywallQuoteHelpers'
import type { DrywallQuote, DrywallQuoteCalculations } from '@/types/drywall'

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function str(v: unknown): string {
  if (v == null || v === '') return ''
  return String(v)
}

export function buildDrywallQuoteCalculations(quote: DrywallQuote): DrywallQuoteCalculations {
  const q = quote
`

const assignments = `
  const sqft = str(q.sqft)
  const wastePercentage = str(q.wastePercentage)
  const drywallScope = q.drywallScope || 'hang_and_finish'
  const hangLayers = str(q.hangLayers) || '1'
  const finishLayers = str(q.finishLayers) || '1'
  const hangSqftOverride = q.hangSqftOverride != null ? str(q.hangSqftOverride) : ''
  const finishSqftOverride = q.finishSqftOverride != null ? str(q.finishSqftOverride) : ''
  const boardOnlyMaterialRate = str(q.boardOnlyMaterialRate)
  const suspendedGridWastePercentage = str(q.suspendedGridWastePercentage)
  const includeSuspendedGrid = Boolean(q.includeSuspendedGrid)
  const materialRate = str(q.materialRate)
  const hangerRate = str(q.hangerRate)
  const finisherRate = str(q.finisherRate)
  const prepCleanRate = str(q.prepCleanRate)
  const carpenterRate = str(q.carpenterRate)
  const shiny90Count = str(q.shiny90Count)
  const shiny90Rate = str(q.shiny90Rate)
  const mainsCount = str(q.mainsCount)
  const mainsRate = str(q.mainsRate)
  const tees4ftCount = str(q.tees4ftCount)
  const tees4ftRate = str(q.tees4ftRate)
  const wireLinearFt = str(q.wireLinearFt)
  const wireRate = str(q.wireRate)
  const lagsCount = str(q.lagsCount)
  const lagsRate = str(q.lagsRate)
  const includeRcChannel = Boolean(q.includeRcChannel)
  const rcChannelCeilingSqft = str(q.rcChannelCeilingSqft)
  const rcChannelCeilingSpacing = str(q.rcChannelCeilingSpacing) || '24'
  const rcChannelWallEntries = Array.isArray(q.rcChannelWallEntries) ? q.rcChannelWallEntries : []
  const rcChannelWallSpacing = str(q.rcChannelWallSpacing) || '24'
  const rcChannelWastePercentage = str(q.rcChannelWastePercentage)
  const rcChannelRate = str(q.rcChannelRate)
  const rcChannelLaborRate = str(q.rcChannelLaborRate)
  const includeInsulation = Boolean(q.includeInsulation)
  const insulationWastePercentage = str(q.insulationWastePercentage)
  const insulationCeilingLaborRate = str(q.insulationCeilingLaborRate)
  const insulationWallLaborRate = str(q.insulationWallLaborRate)
  const insulationEntries = Array.isArray(q.insulationEntries) ? q.insulationEntries : []
  const includeAcousticCeiling = Boolean(q.includeAcousticCeiling)
  const acousticCeilingTileSize = q.acousticCeilingTileSize || '2x4'
  const acousticCeilingWastePercentage = str(q.acousticCeilingWastePercentage)
  const acousticCeilingTileRate = str(q.acousticCeilingTileRate)
  const acousticCeilingLaborRate = str(q.acousticCeilingLaborRate)
  const acousticCeilingPerimeter = str(q.acousticCeilingPerimeter)
  const acousticWallAngleCount = str(q.acousticWallAngleCount)
  const acousticWallAngleRate = str(q.acousticWallAngleRate)
  const acousticMainsCount = str(q.acousticMainsCount)
  const acousticMainsRate = str(q.acousticMainsRate)
  const acousticTees4ftCount = str(q.acousticTees4ftCount)
  const acousticTees4ftRate = str(q.acousticTees4ftRate)
  const acousticTees2ftCount = str(q.acousticTees2ftCount)
  const acousticTees2ftRate = str(q.acousticTees2ftRate)
  const acousticWireLinearFt = str(q.acousticWireLinearFt)
  const acousticWireRate = str(q.acousticWireRate)
  const acousticLagsCount = str(q.acousticLagsCount)
  const acousticLagsRate = str(q.acousticLagsRate)
  const includeMetalStudFraming = Boolean(q.includeMetalStudFraming)
  const metalStudWastePercentage = str(q.metalStudWastePercentage)
  const metalStudLaborRate = str(q.metalStudLaborRate)
  const metalStudStudRates = (q.metalStudStudRates && typeof q.metalStudStudRates === 'object') ? q.metalStudStudRates as Record<string, number | string> : {}
  const metalStudTrackRates = (q.metalStudTrackRates && typeof q.metalStudTrackRates === 'object') ? q.metalStudTrackRates as Record<string, number | string> : {}
  const metalStudEntries = Array.isArray(q.metalStudEntries) ? q.metalStudEntries : []
  const includeFRP = Boolean(q.includeFRP)
  const frpWastePercentage = str(q.frpWastePercentage)
  const frpSqft = str(q.frpSqft)
  const frpWallCount = str(q.frpWallCount)
  const frpWallHeight = str(q.frpWallHeight)
  const frpInsideCorners = str(q.frpInsideCorners)
  const frpOutsideCorners = str(q.frpOutsideCorners)
  const frpExposedEdgesLf = str(q.frpExposedEdgesLf)
  const frpSheetRate = str(q.frpSheetRate)
  const frpAdhesiveBucketRate = str(q.frpAdhesiveBucketRate)
  const frpDivisionStickRate = str(q.frpDivisionStickRate)
  const frpIcStickRate = str(q.frpIcStickRate)
  const frpOcStickRate = str(q.frpOcStickRate)
  const frpJMoldStickRate = str(q.frpJMoldStickRate)
  const overheadPercentage = str(q.overheadPercentage)
  const profitPercentage = str(q.profitPercentage)
  const salesTaxRate = str(q.salesTaxRate)
  const totalQuoteAmount = str(q.totalQuoteAmount)
  const breakdowns = Array.isArray(q.breakdowns) ? q.breakdowns : []
  const options = Array.isArray(q.options) ? q.options : []
`

body = body.replace(/\bquote\./g, 'q.')
const content = header + assignments + body + '\n}\n'
fs.writeFileSync(outPath, content)
console.log('wrote', outPath, 'lines', content.split(/\n/).length)
