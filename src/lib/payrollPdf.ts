// ============================================================================
// Payroll run PDF (landscape summary + calculation detail — Drywall parity)
// ============================================================================

import jsPDF from 'jspdf'
import type { Contractor1099, Employee } from '@/types/hr'
import type { PayPeriod } from '@/types/payroll'
import {
  PAYROLL_WORK_TYPES,
  calculateHourlyPayWithOvertimeCap,
  entriesWithPay,
  getCalculationDetail,
  getToolDeductionThisWeek,
  jobsMatch,
  personKey,
} from '@/lib/payrollMath'

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n ?? 0)

const COMPANY_NAME = 'HSH Contractor'

function workTypeLabel(v: string): string {
  return PAYROLL_WORK_TYPES.find((w) => w.value === v)?.label || v || '—'
}

export function exportPayrollRunPdf(
  run: PayPeriod,
  employees: Employee[],
  contractors: Contractor1099[],
  companyName = COMPANY_NAME,
): void {
  const doc = new jsPDF({ orientation: 'l' })
  const m = 15
  const pageW = doc.internal.pageSize.width
  const pageH = doc.internal.pageSize.height
  const rowH = 6
  let y = m

  const personById = (id: string, type: string) => {
    if (type === 'w2') return employees.find((p) => p.id === id)
    return contractors.find((p) => p.id === id)
  }

  const reportEntries = entriesWithPay(run.entries)
  const runEntriesById: Record<string, (typeof run.entries)[0]> = {}
  ;(run.entries || []).forEach((e) => {
    runEntriesById[personKey(e.personId, e.personType)] = e
  })

  const getHelperDeductionForPdf = (fromPid: string, jobId: string, jobName: string) => {
    let total = 0
    for (const ent of Object.values(runEntriesById)) {
      for (const he of ent.hourEntries || []) {
        if (he.assignToPersonId !== fromPid) continue
        if (jobsMatch(he.jobId, he.jobName, jobId, jobName)) {
          const rate = parseFloat(String(he.assignRate))
          if (!Number.isNaN(rate) && rate > 0) {
            total += (parseFloat(String(he.hours)) || 0) * rate
          } else {
            total += parseFloat(String(he.assignAmount)) || 0
          }
        }
      }
    }
    return total
  }

  const calcPdfRow = (e: (typeof run.entries)[0]) => {
    const person = personById(e.personId, e.personType)
    const pid = personKey(e.personId, e.personType)
    const profileRate = parseFloat(String(person?.hourlyRate)) || 0
    const is1099 = e.personType !== 'w2'

    let hoursGross = 0
    let otGross = 0
    if (person?.payType === 'hourly') {
      const { hourlyBase, otPremium } = calculateHourlyPayWithOvertimeCap(e, profileRate)
      hoursGross = hourlyBase
      otGross = otPremium
    }

    const salaryAmount =
      person?.payType === 'salary' ? parseFloat(String(person.salaryAmount)) || 0 : 0
    const pieceByJob = new Map<string, { raw: number; jobId?: string; jobName?: string }>()
    ;(e.pieceEntries || []).forEach((p) => {
      const jk = `${p.jobId || ''}::${p.jobName || 'Job'}`
      const raw = parseFloat(String(p.amount)) || 0
      const prev = pieceByJob.get(jk) || { raw: 0, jobId: p.jobId, jobName: p.jobName }
      prev.raw += raw
      pieceByJob.set(jk, prev)
    })
    let pieceGross = 0
    pieceByJob.forEach((item) => {
      const deduction = getHelperDeductionForPdf(pid, item.jobId || '', item.jobName || '')
      pieceGross += Math.max(0, item.raw - deduction)
    })

    const draw = parseFloat(String(person?.ownersDraw)) || 0
    const perDiem = parseFloat(String(e.perDiem)) || 0
    const reimbursement = parseFloat(String(e.reimbursement)) || 0
    const gas = parseFloat(String(person?.gasAllowance)) || 0
    const toolDeduction = is1099 ? 0 : getToolDeductionThisWeek(person || {})

    return {
      name: e.personName || '—',
      isW2: e.personType === 'w2',
      hoursGross,
      salaryAmount,
      pieceGross,
      otGross,
      draw,
      perDiem,
      reimbursement,
      gas,
      toolDeduction,
      gross: parseFloat(String(e.gross)) || 0,
    }
  }

  const checkPage = (needed = 10) => {
    if (y + needed > pageH - 15) {
      doc.addPage('l')
      y = m
    }
  }

  doc.setFontSize(16)
  doc.text(companyName, m, y)
  y += 8
  doc.setFontSize(11)
  doc.text(`Payroll: ${run.startDate} – ${run.endDate}`, m, y)
  y += 10

  const cols = {
    name: m,
    type: m + 42,
    base: m + 65,
    addons: m + 115,
    toolDed: m + 175,
    gross: m + 210,
  }
  const addonsRowH = 20

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Name', cols.name, y)
  doc.text('Type', cols.type, y)
  doc.text('Base $ / OT premium', cols.base, y)
  doc.text('Draw / PerDiem / Reimb / Fuel', cols.addons, y)
  doc.text('Tool Ded', cols.toolDed, y)
  doc.text('Gross', cols.gross, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setDrawColor(200, 200, 200)
  doc.line(m, y, pageW - m, y)
  y += 7

  let totalW2 = 0
  let total1099 = 0

  reportEntries.forEach((e, idx) => {
    checkPage(addonsRowH)
    const row = calcPdfRow(e)
    if (row.isW2) totalW2 += row.gross
    else total1099 += row.gross
    const addonsTotal = row.draw + row.perDiem + row.reimbursement + row.gas
    if (idx % 2 === 1) {
      doc.setFillColor(245, 245, 245)
      doc.rect(m, y - 4, pageW - 2 * m, addonsRowH, 'F')
    }
    const baseTotal = row.hoursGross + row.salaryAmount + row.pieceGross
    doc.text(row.name.length > 18 ? `${row.name.slice(0, 17)}…` : row.name, cols.name, y)
    doc.text(row.isW2 ? 'W2' : '1099', cols.type, y)
    doc.text(formatCurrency(baseTotal), cols.base, y)
    doc.setFontSize(7)
    doc.text(`OT premium amt ${formatCurrency(row.otGross)}`, cols.base, y + 3.5)
    doc.setFontSize(8)
    doc.setFontSize(7)
    doc.text(`Draw ${formatCurrency(row.draw)}`, cols.addons, y)
    doc.text(`PerD ${formatCurrency(row.perDiem)}`, cols.addons, y + 3.5)
    doc.text(`Reimb ${formatCurrency(row.reimbursement)}`, cols.addons, y + 7)
    doc.text(`Fuel ${formatCurrency(row.gas)}`, cols.addons, y + 10.5)
    doc.setFont('helvetica', 'bold')
    doc.text(`Total ${formatCurrency(addonsTotal)}`, cols.addons, y + 15)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(formatCurrency(row.toolDeduction), cols.toolDed, y + 7)
    doc.text(formatCurrency(row.gross), cols.gross, y + 7)
    y += addonsRowH
  })

  checkPage(25)
  y += 4
  doc.setDrawColor(200, 200, 200)
  doc.line(m, y, pageW - m, y)
  y += 7
  doc.setFont('helvetica', 'bold')
  doc.text('Total W2', cols.name, y)
  doc.text(formatCurrency(totalW2), cols.gross, y)
  y += 6
  doc.text('Total 1099', cols.name, y)
  doc.text(formatCurrency(total1099), cols.gross, y)
  y += 6
  doc.setFontSize(9)
  doc.text('Grand Total', cols.name, y)
  doc.text(formatCurrency(totalW2 + total1099), cols.gross, y)
  y += 14

  const runWithPay = { ...run, entries: reportEntries }
  const details = getCalculationDetail(runWithPay, employees, contractors)
  const lineH = 5
  const sectionGap = 4

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Calculation detail by person', m, y)
  y += 10

  details.forEach((d, idx) => {
    checkPage(85)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(`${d.name}  ·  ${d.personType === 'w2' ? 'W2' : '1099'}`, m, y)
    y += lineH + 2
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)

    if (d.payType === 'salary' && d.salaryAmount) {
      doc.text(`Salary: ${formatCurrency(d.salaryAmount)}`, m, y)
      y += lineH + 1
    }

    if (d.hoursBreakdown.length > 0) {
      doc.setFont('helvetica', 'bold')
      doc.text('Hours by job', m, y)
      y += lineH
      doc.setFont('helvetica', 'normal')
      const hCols = { job: m, reg: m + 42, ot: m + 52, rate: m + 64, amt: m + 82 }
      doc.setFontSize(7)
      d.hoursBreakdown.forEach((h) => {
        checkPage(5)
        doc.text((h.jobName || '—').slice(0, 18), hCols.job, y)
        doc.text(h.asRegular.toFixed(2), hCols.reg, y)
        doc.text(h.asOT.toFixed(2), hCols.ot, y)
        doc.text(formatCurrency(h.rate), hCols.rate, y)
        doc.text(formatCurrency(h.pay), hCols.amt, y)
        y += 4
      })
      y += sectionGap + 2
    }

    if (d.pieceBreakdown.length > 0) {
      doc.setFont('helvetica', 'bold')
      doc.text('Piece (phases ÷ total × sqft × rate)', m, y)
      y += lineH
      doc.setFont('helvetica', 'normal')
      d.pieceBreakdown.forEach((p) => {
        checkPage(5)
        doc.text(
          `${(p.jobName || '—').slice(0, 14)} ${workTypeLabel(p.workType)} ${p.phasesCompleted}/${p.totalPhases} ${formatCurrency(p.amount)}`,
          m,
          y,
        )
        y += 4
      })
      if (d.pieceDeductionTotal > 0) {
        doc.text(`Helper deduction: −${formatCurrency(d.pieceDeductionTotal)}`, m, y)
        y += 4
      }
      doc.setFont('helvetica', 'bold')
      doc.text(`Net piece: ${formatCurrency(d.pieceNetTotal)}`, m, y)
      doc.setFont('helvetica', 'normal')
      y += sectionGap + 2
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(`Gross: ${formatCurrency(d.gross)}`, m, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    y += 8
    if (idx < details.length - 1) {
      doc.setDrawColor(220, 220, 220)
      doc.line(m, y, pageW - m, y)
      y += 6
    }
  })

  const name = `Payroll_${run.startDate}_${run.endDate}.pdf`
  doc.save(name)
}
