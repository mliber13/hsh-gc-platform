import type { DrywallQuote, DrywallQuoteV3 } from '@/types/drywall'

export type ScopePdfBlock = { heading?: string; lines: string[]; plain?: boolean }

function textOrBlank(value: unknown): string {
  return String(value ?? '').trim()
}

function resolveFinishLabel(raw?: string, other?: string): string {
  if (raw === 'Other') return textOrBlank(other)
  return textOrBlank(raw)
}

function hangFinishBlocks(input: {
  ceilingThickness?: string
  wallThickness?: string
  hangExceptions?: string
  ceilingFinish?: string
  ceilingFinishOther?: string
  ceilingExceptions?: string
  wallFinish?: string
  wallFinishOther?: string
  wallExceptions?: string
}): ScopePdfBlock[] {
  const blocks: ScopePdfBlock[] = []

  const hangLines: string[] = []
  if (textOrBlank(input.ceilingThickness)) {
    hangLines.push(`Ceiling Thickness: ${input.ceilingThickness}`)
  }
  if (textOrBlank(input.wallThickness)) {
    hangLines.push(`Wall Thickness: ${input.wallThickness}`)
  }
  if (textOrBlank(input.hangExceptions)) {
    hangLines.push(`Exceptions: ${input.hangExceptions}`)
  }
  if (hangLines.length) blocks.push({ heading: 'Hang Specifications:', lines: hangLines })

  const finishLines: string[] = []
  const ceilingFinish = resolveFinishLabel(input.ceilingFinish, input.ceilingFinishOther)
  const wallFinish = resolveFinishLabel(input.wallFinish, input.wallFinishOther)
  if (ceilingFinish) finishLines.push(`Ceiling Finish: ${ceilingFinish}`)
  if (wallFinish) finishLines.push(`Wall Finish: ${wallFinish}`)
  const finishExceptions = textOrBlank(input.ceilingExceptions || input.wallExceptions)
  if (finishExceptions) finishLines.push(`Exceptions: ${finishExceptions}`)
  if (finishLines.length) blocks.push({ heading: 'Finish Specifications:', lines: finishLines })

  return blocks
}

/** v2 quote PDF scope blocks (full parity including drywall scope + component addons). */
export function quoteScopeBlocksFromV2(quote: DrywallQuote): ScopePdfBlock[] {
  if (quote.useCustomScopeOfWork && textOrBlank(quote.customScopeOfWork)) {
    return [{ lines: [String(quote.customScopeOfWork)] }]
  }

  const blocks: ScopePdfBlock[] = []
  const scope = String(quote.drywallScope || 'hang_and_finish')
  blocks.push({
    lines: [
      `Drywall: ${
        scope === 'hang_only'
          ? 'Hang only. Finish not included.'
          : scope === 'finish_only'
            ? 'Finish only. Hang not included.'
            : 'Hang and finish included.'
      }`,
    ],
  })

  blocks.push(
    ...hangFinishBlocks({
      ceilingThickness: textOrBlank(quote.ceilingThickness),
      wallThickness: textOrBlank(quote.wallThickness),
      hangExceptions: textOrBlank(quote.hangExceptions),
      ceilingFinish: textOrBlank(quote.ceilingFinish),
      ceilingFinishOther: textOrBlank(quote.ceilingFinishOther),
      ceilingExceptions: textOrBlank(quote.ceilingExceptions),
      wallFinish: textOrBlank(quote.wallFinish),
      wallFinishOther: textOrBlank(quote.wallFinishOther),
      wallExceptions: textOrBlank(quote.wallExceptions),
    }),
  )

  const addonLines: string[] = []
  if (quote.includeSuspendedGrid) {
    addonLines.push('Suspended Drywall Grid Ceiling: Material and labor per plans and specs.')
  }
  if (quote.includeRcChannel) {
    addonLines.push('RC Channel: Labor and material per plans and specs.')
  }
  if (quote.includeMetalStudFraming) {
    addonLines.push('Metal Stud Framing: Labor and material per plans and specs.')
  }
  if (quote.includeAcousticCeiling) {
    addonLines.push('Acoustic Ceiling Tile & Grid: Labor and material per plans and specs.')
  }
  if (quote.includeFRP) addonLines.push('FRP: Labor and material per plans and specs.')
  if (addonLines.length) blocks.push({ lines: addonLines, plain: true })

  const notes = textOrBlank(quote.scopeOfWork)
  if (notes) blocks.push({ heading: 'Additional Notes:', lines: [notes] })

  return blocks
}

/** v3 quote PDF scope blocks — structured hang/finish + additional notes (no v2 component addons). */
export function quoteScopeBlocksFromV3(quote: DrywallQuoteV3): ScopePdfBlock[] {
  if (quote.use_custom_scope_of_work && textOrBlank(quote.custom_scope_of_work)) {
    return [{ lines: [String(quote.custom_scope_of_work)] }]
  }

  const blocks = hangFinishBlocks({
    ceilingThickness: textOrBlank(quote.ceiling_thickness),
    wallThickness: textOrBlank(quote.wall_thickness),
    hangExceptions: textOrBlank(quote.hang_exceptions),
    ceilingFinish: textOrBlank(quote.ceiling_finish),
    ceilingFinishOther: textOrBlank(quote.ceiling_finish_other),
    ceilingExceptions: textOrBlank(quote.ceiling_exceptions),
    wallFinish: textOrBlank(quote.wall_finish),
    wallFinishOther: textOrBlank(quote.wall_finish_other),
    wallExceptions: textOrBlank(quote.wall_exceptions),
  })

  const notes = textOrBlank(quote.scope_of_work)
  if (notes) blocks.push({ heading: 'Additional Notes:', lines: [notes] })

  return blocks.length > 0 ? blocks : [{ lines: ['—'] }]
}
