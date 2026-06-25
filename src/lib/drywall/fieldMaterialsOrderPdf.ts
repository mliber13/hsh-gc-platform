// Field measurement materials PDF — boards by area + accessory groups (legacy OrderStage.jsx)

import jsPDF from 'jspdf'
import {
  extractMaterialsFromFieldTakeoff,
  formatAccessoryLineDescription,
  formatBoardLineDescriptionInGroup,
  groupBoardsForMaterialsPdf,
  type FieldMaterialsAreaGroup,
} from '@/lib/drywall/fieldMaterialsPdfData'
import { orderPdfFilename } from '@/lib/drywall/orderPdfFilename'
import type { DrywallProject, FieldTakeoff } from '@/types/drywall'

const COMPANY_NAME = 'HSH Drywall'

export function downloadDrywallFieldMaterialsPdf(
  project: Pick<DrywallProject, 'name' | 'address' | 'client'>,
  takeoff: FieldTakeoff,
): void {
  const { boards, accessories } = extractMaterialsFromFieldTakeoff(takeoff)
  const projectName = project.name || 'Unnamed project'

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 14
  const headerHeight = 26
  const metaTop = 30
  const metaLineGap = 5
  const rowHeight = 7
  const tableFontSize = 8.5
  const col = {
    left: margin,
    right: pageW - margin,
    desc: margin + 3,
    qty: pageW - margin - 28,
    unit: pageW - margin - 8,
  }
  const descWidth = col.qty - col.desc - 6
  let y = 20

  const drawHeader = () => {
    doc.setFillColor(244, 248, 252)
    doc.rect(0, 0, pageW, headerHeight, 'F')
    doc.setTextColor(18, 86, 120)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.text('MATERIAL ORDER', pageW - margin, 16, { align: 'right' })
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    doc.text(COMPANY_NAME, margin, 14.5)

    doc.setTextColor(40, 40, 40)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(projectName, margin, metaTop)
    doc.setFont('helvetica', 'normal')
    doc.text(project.address || 'N/A', margin, metaTop + metaLineGap)
    doc.text(`Generated ${new Date().toLocaleString()}`, pageW - margin, metaTop, { align: 'right' })
    y = 44
  }

  const ensureSpace = (needed = 8) => {
    if (y + needed > pageH - margin) {
      doc.addPage()
      drawHeader()
    }
  }

  const drawSectionTitle = (title: string) => {
    ensureSpace(11)
    doc.setFillColor(240, 245, 250)
    doc.rect(col.left, y - 5, col.right - col.left, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(28, 28, 28)
    doc.text(title, col.desc, y)
    y += 3
  }

  const drawTableHeader = () => {
    ensureSpace(rowHeight)
    doc.setDrawColor(210, 210, 210)
    doc.setFillColor(250, 250, 250)
    doc.rect(col.left, y, col.right - col.left, rowHeight, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(90, 90, 90)
    const textY = y + rowHeight / 2 + 1.3
    doc.text('Description', col.desc, textY)
    doc.text('Qty', col.qty, textY, { align: 'right' })
    doc.text('Unit', col.unit, textY, { align: 'right' })
    doc.line(col.left, y + rowHeight, col.right, y + rowHeight)
    y += rowHeight
  }

  const drawRow = (
    description: string,
    qty: string,
    unit: string,
    variant: 'item' | 'area' | 'group' = 'item',
  ) => {
    const indent =
      variant === 'area' ? 0 : variant === 'group' ? 4 : 8
    const rowDescX = col.desc + indent
    const rowDescWidth = descWidth - indent
    const wrapped = doc.splitTextToSize(String(description || ''), rowDescWidth)
    const height = Math.max(rowHeight, wrapped.length * 3.9 + 3)
    ensureSpace(height)
    const textY = y + height / 2 + 1.2
    if (variant === 'area') {
      doc.setFillColor(246, 247, 249)
      doc.rect(col.left, y, col.right - col.left, height, 'F')
    } else if (variant === 'group') {
      doc.setFillColor(250, 251, 252)
      doc.rect(col.left, y, col.right - col.left, height, 'F')
    }
    doc.setDrawColor(235, 235, 235)
    doc.line(col.left, y + height, col.right, y + height)
    doc.setFont('helvetica', variant === 'item' ? 'normal' : 'bold')
    doc.setFontSize(variant === 'group' ? 8 : tableFontSize)
    doc.setTextColor(variant === 'group' ? 70 : 30, variant === 'group' ? 70 : 30, variant === 'group' ? 70 : 30)
    doc.text(wrapped, rowDescX, textY - (wrapped.length - 1) * 1.95)
    doc.text(String(qty ?? ''), col.qty, textY, { align: 'right' })
    doc.text(String(unit ?? ''), col.unit, textY, { align: 'right' })
    y += height
  }

  drawHeader()

  const columnGap = 6
  const columnWidth = (col.right - col.left - columnGap) / 2
  const leftColumnX = col.left
  const rightColumnX = col.left + columnWidth + columnGap

  const measureBoardRowHeight = (
    description: string,
    descWidth: number,
    variant: 'item' | 'group' = 'item',
  ) => {
    const wrapped = doc.splitTextToSize(String(description || ''), descWidth)
    return Math.max(rowHeight, wrapped.length * 3.9 + 3)
  }

  const measureBoardAreaGroupHeight = (areaGroup: FieldMaterialsAreaGroup) => {
    const localDescWidth = columnWidth - 28
    let h = rowHeight * 2
    for (const twGroup of areaGroup.thicknessWidthGroups) {
      h += measureBoardRowHeight(twGroup.label, localDescWidth - 4, 'group')
      for (const board of twGroup.boards) {
        h += measureBoardRowHeight(
          formatBoardLineDescriptionInGroup(board),
          localDescWidth - 8,
        )
      }
    }
    return h + 3
  }

  const drawBoardAreaGroup = (x: number, groupY: number, areaGroup: FieldMaterialsAreaGroup) => {
    let localY = groupY
    const localCols = {
      left: x,
      right: x + columnWidth,
      desc: x + 2.5,
      qty: x + columnWidth - 12,
      unit: x + columnWidth - 2.5,
    }
    const localDescWidth = localCols.qty - localCols.desc - 4

    doc.setFillColor(246, 247, 249)
    doc.rect(localCols.left, localY, columnWidth, rowHeight, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(28, 28, 28)
    doc.text(areaGroup.area, localCols.desc, localY + rowHeight / 2 + 1.3)
    localY += rowHeight

    doc.setDrawColor(210, 210, 210)
    doc.setFillColor(250, 250, 250)
    doc.rect(localCols.left, localY, columnWidth, rowHeight, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(90, 90, 90)
    const headerY = localY + rowHeight / 2 + 1.3
    doc.text('Description', localCols.desc, headerY)
    doc.text('Qty', localCols.qty, headerY, { align: 'right' })
    doc.text('Unit', localCols.unit, headerY, { align: 'right' })
    doc.line(localCols.left, localY + rowHeight, localCols.right, localY + rowHeight)
    localY += rowHeight

    const drawLocalRow = (
      description: string,
      qty: string,
      unit: string,
      variant: 'item' | 'group',
    ) => {
      const indent = variant === 'group' ? 2 : 5
      const rowDescX = localCols.desc + indent
      const rowDescWidth = localDescWidth - indent
      const wrapped = doc.splitTextToSize(String(description || ''), rowDescWidth)
      const h = Math.max(rowHeight, wrapped.length * 3.9 + 3)
      const textY = localY + h / 2 + 1.2
      if (variant === 'group') {
        doc.setFillColor(250, 251, 252)
        doc.rect(localCols.left, localY, columnWidth, h, 'F')
      }
      doc.setDrawColor(235, 235, 235)
      doc.line(localCols.left, localY + h, localCols.right, localY + h)
      doc.setFont('helvetica', variant === 'group' ? 'bold' : 'normal')
      doc.setFontSize(variant === 'group' ? 7.5 : 8)
      doc.setTextColor(variant === 'group' ? 70 : 45, variant === 'group' ? 70 : 45, variant === 'group' ? 70 : 45)
      doc.text(wrapped, rowDescX, textY - (wrapped.length - 1) * 1.95)
      doc.text(String(qty ?? ''), localCols.qty, textY, { align: 'right' })
      doc.text(String(unit ?? ''), localCols.unit, textY, { align: 'right' })
      localY += h
    }

    for (const twGroup of areaGroup.thicknessWidthGroups) {
      drawLocalRow(twGroup.label, '', '', 'group')
      for (const board of twGroup.boards) {
        drawLocalRow(
          formatBoardLineDescriptionInGroup(board),
          (board.quantity || 0).toLocaleString(),
          'pcs',
          'item',
        )
      }
    }

    return localY + 2
  }

  drawSectionTitle('Boards by Area')
  if (boards.length === 0) {
    drawTableHeader()
    drawRow('No board items', '', '')
  } else {
    const areaGroups = groupBoardsForMaterialsPdf(boards)
    let cursorY = y

    for (let i = 0; i < areaGroups.length; i += 2) {
      const leftGroup = areaGroups[i]
      const rightGroup = areaGroups[i + 1] ?? null
      const leftHeight = measureBoardAreaGroupHeight(leftGroup)
      const rightHeight = rightGroup ? measureBoardAreaGroupHeight(rightGroup) : 0
      const blockHeight = Math.max(leftHeight, rightHeight)

      if (cursorY + blockHeight > pageH - margin) {
        doc.addPage()
        drawHeader()
        cursorY = y
      }

      drawBoardAreaGroup(leftColumnX, cursorY, leftGroup)
      if (rightGroup) {
        drawBoardAreaGroup(rightColumnX, cursorY, rightGroup)
      }
      cursorY += blockHeight
    }

    y = cursorY
  }

  y += 8
  drawSectionTitle('Accessories')
  if (accessories.length === 0) {
    drawTableHeader()
    drawRow('No accessory items', '', '')
  } else {
    const groupedAccessories = new Map<string, typeof accessories>()
    accessories.forEach((a) => {
      const category = a.type || 'Other'
      if (!groupedAccessories.has(category)) groupedAccessories.set(category, [])
      groupedAccessories.get(category)!.push(a)
    })

    const orderedGroups = [...groupedAccessories.entries()].sort(([a], [b]) => {
      if (a === 'Corner Bead') return -1
      if (b === 'Corner Bead') return 1
      return a.localeCompare(b)
    })

    const gap = columnGap
    const colWidth = columnWidth
    const leftColX = leftColumnX
    const rightColX = rightColumnX

    const measureAccessoryGroupHeight = ([, items]: [string, typeof accessories]) => {
      let h = rowHeight * 2
      items.forEach((a) => {
        const desc = formatAccessoryLineDescription(a)
        const wrapped = doc.splitTextToSize(String(desc), colWidth - 28)
        h += Math.max(rowHeight, wrapped.length * 3.9 + 3)
      })
      return h + 3
    }

    const drawAccessoryGroup = (x: number, groupY: number, [, items]: [string, typeof accessories], category: string) => {
      let localY = groupY
      const localCols = {
        left: x,
        right: x + colWidth,
        desc: x + 2.5,
        qty: x + colWidth - 12,
        unit: x + colWidth - 2.5,
      }
      const localDescWidth = localCols.qty - localCols.desc - 4

      doc.setFillColor(246, 247, 249)
      doc.rect(localCols.left, localY, colWidth, rowHeight, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(28, 28, 28)
      doc.text(category, localCols.desc, localY + rowHeight / 2 + 1.3)
      localY += rowHeight

      doc.setDrawColor(210, 210, 210)
      doc.setFillColor(250, 250, 250)
      doc.rect(localCols.left, localY, colWidth, rowHeight, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(90, 90, 90)
      const hY = localY + rowHeight / 2 + 1.3
      doc.text('Description', localCols.desc, hY)
      doc.text('Qty', localCols.qty, hY, { align: 'right' })
      doc.text('Unit', localCols.unit, hY, { align: 'right' })
      doc.line(localCols.left, localY + rowHeight, localCols.right, localY + rowHeight)
      localY += rowHeight

      items.forEach((a) => {
        const desc = formatAccessoryLineDescription(a)
        const wrapped = doc.splitTextToSize(String(desc), localDescWidth)
        const h = Math.max(rowHeight, wrapped.length * 3.9 + 3)
        const textY = localY + h / 2 + 1.2
        doc.setDrawColor(235, 235, 235)
        doc.line(localCols.left, localY + h, localCols.right, localY + h)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(45, 45, 45)
        doc.text(wrapped, localCols.desc, textY - (wrapped.length - 1) * 1.95)
        doc.text((a.quantity || 0).toLocaleString(), localCols.qty, textY, { align: 'right' })
        doc.text(a.unit || 'pcs', localCols.unit, textY, { align: 'right' })
        localY += h
      })

      return localY + 2
    }

    let cursorY = y
    for (let i = 0; i < orderedGroups.length; i += 2) {
      const leftGroup = orderedGroups[i]
      const rightGroup = orderedGroups[i + 1] ?? null
      const leftHeight = measureAccessoryGroupHeight(leftGroup)
      const rightHeight = rightGroup ? measureAccessoryGroupHeight(rightGroup) : 0
      const blockHeight = Math.max(leftHeight, rightHeight)

      if (cursorY + blockHeight > pageH - margin) {
        doc.addPage()
        drawHeader()
        cursorY = y
      }

      drawAccessoryGroup(leftColX, cursorY, leftGroup, leftGroup[0])
      if (rightGroup) {
        drawAccessoryGroup(rightColX, cursorY, rightGroup, rightGroup[0])
      }
      cursorY += blockHeight
    }

    y = cursorY
  }

  doc.save(orderPdfFilename(projectName))
}
