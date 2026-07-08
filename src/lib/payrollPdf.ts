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
  splitGrossByDivisions,
  sortPayrollReportEntries,
} from '@/lib/payrollMath'
import { DIVISIONS, divisionLabel, UNALLOCATED_KEY } from '@/lib/divisions'

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

  const personLookup = new Map<string, Employee | Contractor1099>()
  for (const e of employees) personLookup.set(personKey(e.id, 'w2'), e)
  for (const c of contractors) personLookup.set(personKey(c.id, '1099'), c)
  const personById = (id: string, type: string) => personLookup.get(personKey(id, type))

  const reportEntries = sortPayrollReportEntries(
    entriesWithPay(run.entries),
    (e) => e.personName || '',
    (e) => e.personType,
  )
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
  y += 12

  const UNASSIGNED_KEY = '__unassigned__'
  const jobNameKey = (name: string) => {
    const n = (name || '').trim()
    return n === '' ? UNASSIGNED_KEY : n.toLowerCase()
  }
  const byJob = new Map<string, { name: string; w2: number; c1099: number }>()
  byJob.set(UNASSIGNED_KEY, { name: 'Unassigned', w2: 0, c1099: 0 })

  reportEntries.forEach((e) => {
    const pid = personKey(e.personId, e.personType)
    const isW2 = e.personType === 'w2'
    const person = personById(e.personId, e.personType)
    const profileRate = parseFloat(String(person?.hourlyRate)) || 0
    let allocated = 0

    const { hourlyBase, entryPayments } = calculateHourlyPayWithOvertimeCap(e, profileRate)
    allocated += hourlyBase
    if (entryPayments.length > 0) {
      entryPayments.forEach((h) => {
        const useJob = h.jobId && h.jobId !== 'none' && h.jobId !== 'unassigned'
        const jobKey = useJob ? jobNameKey(h.jobName || 'Job') : UNASSIGNED_KEY
        const displayName = (h.jobName || 'Job').trim() || 'Unassigned'
        const prev = byJob.get(jobKey) || { name: displayName, w2: 0, c1099: 0 }
        if (!byJob.has(jobKey)) byJob.set(jobKey, prev)
        if (isW2) prev.w2 += h.pay
        else prev.c1099 += h.pay
      })
    } else {
      const legacyHours = parseFloat(String(e.hours)) || 0
      if (legacyHours > 0) {
        const prev = byJob.get(UNASSIGNED_KEY) || { name: 'Unassigned', w2: 0, c1099: 0 }
        if (!byJob.has(UNASSIGNED_KEY)) byJob.set(UNASSIGNED_KEY, prev)
        if (isW2) prev.w2 += hourlyBase
        else prev.c1099 += hourlyBase
      }
    }

    const pieceByJob = new Map<string, { raw: number; jobId?: string; jobName: string }>()
    ;(e.pieceEntries || []).forEach((p) => {
      const raw = parseFloat(String(p.amount)) || 0
      const key = jobNameKey(p.jobName || 'Job')
      const prev = pieceByJob.get(key) || {
        raw: 0,
        jobId: p.jobId,
        jobName: (p.jobName || 'Job').trim(),
      }
      prev.raw += raw
      pieceByJob.set(key, prev)
    })
    pieceByJob.forEach((item, key) => {
      if (key === UNASSIGNED_KEY) return
      const deduction = getHelperDeductionForPdf(pid, item.jobId || '', item.jobName || '')
      const net = Math.max(0, item.raw - deduction)
      allocated += net
      const prev = byJob.get(key) || { name: item.jobName || 'Job', w2: 0, c1099: 0 }
      if (!byJob.has(key)) byJob.set(key, prev)
      if (isW2) prev.w2 += net
      else prev.c1099 += net
    })

    const gross = parseFloat(String(e.gross)) || 0
    const unallocated = gross - allocated
    const unass = byJob.get(UNASSIGNED_KEY)!
    if (isW2) unass.w2 += unallocated
    else unass.c1099 += unallocated
  })

  if (byJob.size > 0) {
    checkPage(25 + byJob.size * rowH)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('By Job / Project (W2 vs 1099 for QuickBooks)', m, y)
    y += 8
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const jobCols = { name: m, w2: m + 95, c1099: m + 130, total: m + 165 }
    doc.text('Job / Project', jobCols.name, y)
    doc.text('W2', jobCols.w2, y)
    doc.text('1099', jobCols.c1099, y)
    doc.text('Total', jobCols.total, y)
    y += 5
    doc.setDrawColor(200, 200, 200)
    doc.line(m, y, pageW - m, y)
    y += 6

    const byJobSorted = [...byJob.entries()].sort((a, b) =>
      (a[1].name || '').localeCompare(b[1].name || '', undefined, { sensitivity: 'base' }),
    )
    let sumW2 = 0
    let sum1099 = 0
    byJobSorted.forEach(([, v], idx) => {
      checkPage(rowH)
      const tw = (v.w2 || 0) + (v.c1099 || 0)
      if (idx % 2 === 1) {
        doc.setFillColor(245, 245, 245)
        doc.rect(m, y - 4, pageW - 2 * m, rowH, 'F')
      }
      doc.text((v.name || '—').slice(0, 28), jobCols.name, y)
      doc.text(formatCurrency(v.w2 || 0), jobCols.w2, y)
      doc.text(formatCurrency(v.c1099 || 0), jobCols.c1099, y)
      doc.text(formatCurrency(tw), jobCols.total, y)
      sumW2 += v.w2 || 0
      sum1099 += v.c1099 || 0
      y += rowH
    })
    checkPage(12)
    y += 2
    doc.setFont('helvetica', 'bold')
    doc.setDrawColor(200, 200, 200)
    doc.line(m, y, pageW - m, y)
    y += 6
    doc.text('By Job Total', jobCols.name, y)
    doc.text(formatCurrency(sumW2), jobCols.w2, y)
    doc.text(formatCurrency(sum1099), jobCols.c1099, y)
    doc.text(formatCurrency(sumW2 + sum1099), jobCols.total, y)
    y += 14
  }

  const byDivision = new Map<string, { w2: number; c1099: number }>()
  for (const e of reportEntries) {
    const gross = parseFloat(String(e.gross)) || 0
    if (gross <= 0) continue
    const person = personById(e.personId, e.personType)
    const allocations = person?.divisionAllocations
    if (!allocations || allocations.length === 0) continue
    const split = splitGrossByDivisions(gross, allocations)
    for (const [divisionKey, amount] of Object.entries(split)) {
      if (!(amount > 0)) continue
      const row = byDivision.get(divisionKey) || { w2: 0, c1099: 0 }
      if (e.personType === 'w2') row.w2 += amount
      else row.c1099 += amount
      byDivision.set(divisionKey, row)
    }
  }

  if (byDivision.size > 0) {
    const divisionOrder = [...DIVISIONS.map((d) => d.code), UNALLOCATED_KEY]
    const sortedDivisionKeys = [...byDivision.keys()].sort((a, b) => {
      const ai = divisionOrder.indexOf(a)
      const bi = divisionOrder.indexOf(b)
      if (ai >= 0 && bi >= 0) return ai - bi
      if (ai >= 0) return -1
      if (bi >= 0) return 1
      return divisionLabel(a).localeCompare(divisionLabel(b), undefined, { sensitivity: 'base' })
    })

    checkPage(25 + sortedDivisionKeys.length * rowH)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('By Division — salary allocation (for QuickBooks)', m, y)
    y += 8
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const divisionCols = { name: m, w2: m + 95, c1099: m + 130, total: m + 165 }
    doc.text('Division', divisionCols.name, y)
    doc.text('W2', divisionCols.w2, y)
    doc.text('1099', divisionCols.c1099, y)
    doc.text('Total', divisionCols.total, y)
    y += 5
    doc.setDrawColor(200, 200, 200)
    doc.line(m, y, pageW - m, y)
    y += 6

    let sumW2 = 0
    let sum1099 = 0
    sortedDivisionKeys.forEach((divisionKey, idx) => {
      checkPage(rowH)
      const v = byDivision.get(divisionKey)!
      const total = (v.w2 || 0) + (v.c1099 || 0)
      if (idx % 2 === 1) {
        doc.setFillColor(245, 245, 245)
        doc.rect(m, y - 4, pageW - 2 * m, rowH, 'F')
      }
      doc.text(divisionLabel(divisionKey), divisionCols.name, y)
      doc.text(formatCurrency(v.w2 || 0), divisionCols.w2, y)
      doc.text(formatCurrency(v.c1099 || 0), divisionCols.c1099, y)
      doc.text(formatCurrency(total), divisionCols.total, y)
      sumW2 += v.w2 || 0
      sum1099 += v.c1099 || 0
      y += rowH
    })

    checkPage(12)
    y += 2
    doc.setFont('helvetica', 'bold')
    doc.setDrawColor(200, 200, 200)
    doc.line(m, y, pageW - m, y)
    y += 6
    doc.text('By Division Total', divisionCols.name, y)
    doc.text(formatCurrency(sumW2), divisionCols.w2, y)
    doc.text(formatCurrency(sum1099), divisionCols.c1099, y)
    doc.text(formatCurrency(sumW2 + sum1099), divisionCols.total, y)
    y += 14
  }

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
      doc.setDrawColor(200, 200, 200)
      doc.line(hCols.job, y - 1, hCols.amt + 22, y - 1)
      doc.text('Job', hCols.job, y + 3)
      doc.text('Reg', hCols.reg, y + 3)
      doc.text('OT', hCols.ot, y + 3)
      doc.text('Rate', hCols.rate, y + 3)
      doc.text('Amt', hCols.amt, y + 3)
      y += 5
      d.hoursBreakdown.forEach((h) => {
        checkPage(5)
        doc.text((h.jobName || '—').slice(0, 18), hCols.job, y)
        doc.text(h.asRegular.toFixed(2), hCols.reg, y)
        doc.text(h.asOT.toFixed(2), hCols.ot, y)
        doc.text(formatCurrency(h.rate), hCols.rate, y)
        doc.text(formatCurrency(h.pay), hCols.amt, y)
        y += 4
      })
      doc.line(hCols.job, y, hCols.amt + 22, y)
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
