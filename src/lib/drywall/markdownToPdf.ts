/**
 * Pragmatic markdown subset → jsPDF drawing for custom scope of work.
 * Supports: #/##/### headings, **bold**, *italic*, -/* bullets, 1. numbered lists,
 * paragraphs, and hard line breaks (remark-breaks parity). Unsupported constructs
 * are stripped to plain inner text.
 */

import type jsPDF from 'jspdf'
import { DW_BLUE, DW_TEXT, setTextRgb } from '@/lib/drywall/drywallQuotePdfTheme'

export type MarkdownPdfCtx = {
  doc: jsPDF
  y: number
  pageW: number
  pageH: number
  maxW: number
  margin: number
  marginY: number
}

export type MarkdownPdfSpacing = {
  specLine: number
  specIndent: number
  bulletIndent: number
  subsectionTop: number
  subsectionAfterHeading: number
  bottomReserve: number
}

export type MarkdownPdfFonts = {
  bodySize: number
  h1Size: number
  h2Size: number
  h3Size: number
}

type InlineRun = { text: string; bold?: boolean; italic?: boolean }

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; runs: InlineRun[] }
  | { kind: 'bullet'; runs: InlineRun[] }
  | { kind: 'numbered'; n: number; runs: InlineRun[] }
  | { kind: 'paragraph'; runs: InlineRun[] }
  | { kind: 'blank' }

const DEFAULT_SPACING: MarkdownPdfSpacing = {
  specLine: 13,
  specIndent: 10,
  bulletIndent: 10,
  subsectionTop: 8,
  subsectionAfterHeading: 10,
  bottomReserve: 80,
}

const DEFAULT_FONTS: MarkdownPdfFonts = {
  bodySize: 10,
  h1Size: 12,
  h2Size: 11,
  h3Size: 10,
}

function ensureRoom(ctx: MarkdownPdfCtx, h: number, bottomReserve: number) {
  if (ctx.y + h <= ctx.pageH - bottomReserve) return
  ctx.doc.addPage()
  ctx.y = ctx.marginY
}

function fontStyle(bold?: boolean, italic?: boolean): 'normal' | 'bold' | 'italic' | 'bolditalic' {
  if (bold && italic) return 'bolditalic'
  if (bold) return 'bold'
  if (italic) return 'italic'
  return 'normal'
}

/** Strip unsupported markers while keeping readable text. */
function stripUnsupported(raw: string): string {
  let s = raw
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  s = s.replace(/`([^`]+)`/g, '$1')
  s = s.replace(/^>\s?/gm, '')
  if (s.includes('|')) {
    s = s
      .split('|')
      .map((part) => part.trim())
      .filter((part) => part && !/^[-:]+$/.test(part))
      .join(' ')
  }
  return s
}

/**
 * Parse inline **bold** and *italic* (and __ / _). Nested/overlapping edge cases
 * fall back to plain text for the unmatched remainder.
 */
export function parseInlineRuns(raw: string): InlineRun[] {
  const text = stripUnsupported(raw)
  const runs: InlineRun[] = []
  const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      runs.push({ text: text.slice(last, m.index) })
    }
    if (m[1]) {
      runs.push({ text: m[2], bold: true })
    } else {
      runs.push({ text: m[4], italic: true })
    }
    last = m.index + m[0].length
  }
  if (last < text.length) {
    runs.push({ text: text.slice(last) })
  }
  if (runs.length === 0) runs.push({ text: '' })
  return runs
}

function parseBlocks(markdown: string): Block[] {
  const lines = String(markdown ?? '').replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []

  for (const line of lines) {
    const trimmedRight = line.replace(/\s+$/, '')
    if (!trimmedRight.trim()) {
      blocks.push({ kind: 'blank' })
      continue
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmedRight)
    if (heading) {
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3
      // Headings are always bold in the PDF subset
      const runs = parseInlineRuns(heading[2]).map((r) => ({ ...r, bold: true }))
      blocks.push({ kind: 'heading', level, runs })
      continue
    }

    const bullet = /^[-*]\s+(.+)$/.exec(trimmedRight)
    if (bullet) {
      blocks.push({ kind: 'bullet', runs: parseInlineRuns(bullet[1]) })
      continue
    }

    const numbered = /^(\d+)\.\s+(.+)$/.exec(trimmedRight)
    if (numbered) {
      blocks.push({
        kind: 'numbered',
        n: Number(numbered[1]) || 1,
        runs: parseInlineRuns(numbered[2]),
      })
      continue
    }

    const plain = trimmedRight.replace(/^```\w*/, '').replace(/^~~~.*/, '')
    blocks.push({ kind: 'paragraph', runs: parseInlineRuns(plain) })
  }

  return blocks
}

type WordToken = { text: string; bold?: boolean; italic?: boolean; leadingSpace: boolean }

function runsToTokens(runs: InlineRun[]): WordToken[] {
  const tokens: WordToken[] = []
  for (const run of runs) {
    const parts = run.text.split(/(\s+)/)
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (!part) continue
      if (/^\s+$/.test(part)) continue
      const leadingSpace = i > 0 && /^\s+$/.test(parts[i - 1] ?? '')
      tokens.push({
        text: part,
        bold: run.bold,
        italic: run.italic,
        leadingSpace,
      })
    }
  }
  return tokens
}

/**
 * Lay out styled inline runs left-to-right with manual word wrapping.
 */
export function drawInlineRuns(
  ctx: MarkdownPdfCtx,
  runs: InlineRun[],
  startX: number,
  lineStep: number,
  maxWidth: number,
  opts: {
    fontSize: number
    bottomReserve: number
    color?: [number, number, number]
  },
) {
  const { doc } = ctx
  const color = opts.color ?? DW_TEXT
  doc.setFontSize(opts.fontSize)
  setTextRgb(doc, color)

  const tokens = runsToTokens(runs)
  let x = startX
  const rightEdge = startX + maxWidth

  ensureRoom(ctx, lineStep + 2, opts.bottomReserve)

  if (tokens.length === 0) {
    ctx.y += lineStep
    return
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const style = fontStyle(token.bold, token.italic)
    doc.setFont('helvetica', style)

    const useSpace = token.leadingSpace && x > startX
    const chunk = `${useSpace ? ' ' : ''}${token.text}`
    const width = doc.getTextWidth(chunk)

    if (x > startX && x + width > rightEdge) {
      ctx.y += lineStep
      ensureRoom(ctx, lineStep + 2, opts.bottomReserve)
      x = startX
      doc.setFont('helvetica', style)
      const bareW = doc.getTextWidth(token.text)
      doc.text(token.text, x, ctx.y)
      x += bareW
    } else {
      doc.text(chunk, x, ctx.y)
      x += width
    }
  }

  ctx.y += lineStep
}

export function drawMarkdownScope(
  ctx: MarkdownPdfCtx,
  markdown: string,
  spacing: Partial<MarkdownPdfSpacing> = {},
  fonts: Partial<MarkdownPdfFonts> = {},
): void {
  const SP = { ...DEFAULT_SPACING, ...spacing }
  const F = { ...DEFAULT_FONTS, ...fonts }
  const blocks = parseBlocks(markdown)

  for (const block of blocks) {
    if (block.kind === 'blank') {
      ctx.y += Math.round(SP.specLine * 0.45)
      continue
    }

    if (block.kind === 'heading') {
      ctx.y += SP.subsectionTop
      const size = block.level === 1 ? F.h1Size : block.level === 2 ? F.h2Size : F.h3Size
      const indent = SP.specIndent
      const maxW = ctx.maxW - indent - 4
      ensureRoom(ctx, size + SP.subsectionAfterHeading + 4, SP.bottomReserve)
      drawInlineRuns(ctx, block.runs, ctx.margin + indent, size + 2, maxW, {
        fontSize: size,
        bottomReserve: SP.bottomReserve,
        color: DW_BLUE,
      })
      ctx.y += Math.max(0, SP.subsectionAfterHeading - 4)
      continue
    }

    if (block.kind === 'bullet') {
      const indent = SP.specIndent + SP.bulletIndent
      const prefix = '• '
      const maxW = ctx.maxW - indent - 4
      ensureRoom(ctx, SP.specLine + 2, SP.bottomReserve)
      ctx.doc.setFont('helvetica', 'normal')
      ctx.doc.setFontSize(F.bodySize)
      setTextRgb(ctx.doc, DW_TEXT)
      const prefixW = ctx.doc.getTextWidth(prefix)
      ctx.doc.text(prefix, ctx.margin + indent, ctx.y)
      drawInlineRuns(ctx, block.runs, ctx.margin + indent + prefixW, SP.specLine, maxW - prefixW, {
        fontSize: F.bodySize,
        bottomReserve: SP.bottomReserve,
      })
      continue
    }

    if (block.kind === 'numbered') {
      const indent = SP.specIndent + SP.bulletIndent
      const prefix = `${block.n}. `
      const maxW = ctx.maxW - indent - 4
      ensureRoom(ctx, SP.specLine + 2, SP.bottomReserve)
      ctx.doc.setFont('helvetica', 'normal')
      ctx.doc.setFontSize(F.bodySize)
      setTextRgb(ctx.doc, DW_TEXT)
      const prefixW = ctx.doc.getTextWidth(prefix)
      ctx.doc.text(prefix, ctx.margin + indent, ctx.y)
      drawInlineRuns(ctx, block.runs, ctx.margin + indent + prefixW, SP.specLine, maxW - prefixW, {
        fontSize: F.bodySize,
        bottomReserve: SP.bottomReserve,
      })
      continue
    }

    const indent = SP.specIndent
    const maxW = ctx.maxW - indent - 4
    ensureRoom(ctx, SP.specLine + 2, SP.bottomReserve)
    drawInlineRuns(ctx, block.runs, ctx.margin + indent, SP.specLine, maxW, {
      fontSize: F.bodySize,
      bottomReserve: SP.bottomReserve,
    })
  }

  setTextRgb(ctx.doc, DW_TEXT)
  ctx.doc.setFont('helvetica', 'normal')
  ctx.doc.setFontSize(F.bodySize)
}
