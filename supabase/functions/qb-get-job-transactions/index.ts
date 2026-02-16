// QuickBooks Get Job Transactions
// Fetches transactions that hit Job Materials or Subcontractor Expense accounts (for pending import list)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getValidQbToken, getQBApiBase } from '../_shared/qb.ts'

const MINOR_VERSION = 65

// Account/Class name patterns (case-insensitive; any of these matches)
const JOB_MATERIALS_PATTERNS = [
  'job materials', 'job material', 'materials', 'job cost - materials', 'cost of materials',
  'material', 'job cost materials', 'materials expense', 'construction materials', 'job materials expense'
]
const SUB_EXPENSE_PATTERNS = [
  'subcontractor expense', 'sub expense', 'subcontractors', 'subcontractor', 'job cost - sub', 'subs',
  'subcontractor cost', 'subcontract', 'sub contractor', '1099', 'contract labor', 'job cost - subcontractor'
]

type AccountType = 'Job Materials' | 'Subcontractor Expense'

interface JobTransaction {
  qbTransactionId: string
  qbTransactionType: string
  vendorName: string
  txnDate: string
  docNumber: string
  amount: number
  accountType: AccountType
  qbProjectId: string | null
  qbProjectName: string | null
  description: string
}

function qbFetch(
  apiBase: string,
  token: string,
  realmId: string,
  query: string
): Promise<{ QueryResponse?: Record<string, unknown[]> }> {
  return fetch(
    `${apiBase}/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=${MINOR_VERSION}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    }
  ).then((r) => (r.ok ? r.json() : Promise.resolve({})))
}

function getLineAccountRef(line: any): string | null {
  const detail = line?.AccountBasedExpenseLineDetail || line?.ExpenseDetail
  const val = detail?.AccountRef?.value
  return val != null ? String(val) : null
}

function getLineClassRef(line: any): { id: string | null; name: string | null } {
  const detail = line?.AccountBasedExpenseLineDetail || line?.ExpenseDetail || line
  const ref = detail?.ClassRef || line?.ClassRef
  const id = ref?.value
  return { id: id != null ? String(id) : null, name: ref?.name ?? null }
}

function getLineAmount(line: any): number {
  return Number(line?.Amount ?? 0)
}

function classNameMatchesJobMaterials(name: string | null): boolean {
  if (!name) return false
  const n = name.toLowerCase()
  return JOB_MATERIALS_PATTERNS.some((p) => n.includes(p))
}
function classNameMatchesSubExpense(name: string | null): boolean {
  if (!name) return false
  const n = name.toLowerCase()
  return SUB_EXPENSE_PATTERNS.some((p) => n.includes(p))
}

function transactionHasAccountOrClass(
  transaction: any,
  accountIds: Set<string>,
  accountIdToType: Record<string, AccountType>,
  classIds: Set<string>,
  classIdToType: Record<string, AccountType>
): { accountType: AccountType | null; amount: number } {
  const lines = transaction.Line || []
  let totalForAccount = 0
  let matchedType: AccountType | null = null

  // Header-level Class/Category (whole transaction has one category)
  const headerClassRef = transaction?.ClassRef
  const headerClassId = headerClassRef?.value ?? null
  const headerClassName = headerClassRef?.name ?? null
  if (headerClassId && classIds.has(headerClassId)) {
    matchedType = classIdToType[headerClassId] ?? null
  } else if (headerClassName && classNameMatchesJobMaterials(headerClassName)) {
    matchedType = 'Job Materials'
  } else if (headerClassName && classNameMatchesSubExpense(headerClassName)) {
    matchedType = 'Subcontractor Expense'
  }
  if (matchedType && lines.length > 0) {
    totalForAccount = lines.reduce((sum: number, line: any) => sum + getLineAmount(line), 0)
    return { accountType: matchedType, amount: totalForAccount }
  }

  // Line-level: account or class
  for (const line of lines) {
    const amt = getLineAmount(line)
    const accountId = getLineAccountRef(line)
    const { id: classId, name: className } = getLineClassRef(line)
    const matchByAccount = accountId && accountIds.has(accountId)
    const matchByClassId = classId && classIds.has(classId)
    const matchByClassName =
      (className && classNameMatchesJobMaterials(className)) ||
      (className && classNameMatchesSubExpense(className))
    if (matchByAccount) {
      totalForAccount += amt
      if (!matchedType) matchedType = accountIdToType[accountId!] ?? null
    } else if (matchByClassId) {
      totalForAccount += amt
      if (!matchedType) matchedType = classIdToType[classId!] ?? null
    } else if (matchByClassName) {
      totalForAccount += amt
      if (!matchedType) matchedType = classNameMatchesJobMaterials(className) ? 'Job Materials' : 'Subcontractor Expense'
    }
  }
  return { accountType: matchedType, amount: totalForAccount }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  let debug = false
  try {
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      debug = body?.debug === true
    }
  } catch (_) {}

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header', transactions: [] }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', transactions: [] }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const tokenResult = await getValidQbToken(supabaseClient, user.id)
    if (!tokenResult) {
      return new Response(
        JSON.stringify({ transactions: [], error: 'QuickBooks not connected' }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const { accessToken, realmId } = tokenResult
    const apiBase = getQBApiBase()

    // 1) Get accounts: find Job Materials and Subcontractor Expense by name
    const accountRes = await qbFetch(
      apiBase,
      accessToken,
      realmId,
      `SELECT * FROM Account WHERE Active = true MAXRESULTS 1000`
    )
    const accounts: any[] = accountRes.QueryResponse?.Account || []
    const nameMatches = (name: string, patterns: string[]) =>
      patterns.some((p) => (name || '').toLowerCase().includes(p))
    const jobMaterialsAccounts = accounts.filter(
      (a: any) => nameMatches(a.Name, JOB_MATERIALS_PATTERNS)
    )
    const subExpenseAccounts = accounts.filter(
      (a: any) => nameMatches(a.Name, SUB_EXPENSE_PATTERNS)
    )

    const accountIds = new Set<string>()
    const accountIdToType: Record<string, AccountType> = {}
    for (const a of jobMaterialsAccounts) {
      const id = String(a.Id)
      accountIds.add(id)
      accountIdToType[id] = 'Job Materials'
    }
    for (const a of subExpenseAccounts) {
      const id = String(a.Id)
      accountIds.add(id)
      accountIdToType[id] = 'Subcontractor Expense'
    }
    // 1b) Get Classes (Category in QB UI): match same names for job materials / sub expense
    const classRes = await qbFetch(
      apiBase,
      accessToken,
      realmId,
      `SELECT * FROM Class WHERE Active = true MAXRESULTS 1000`
    )
    const classes: any[] = classRes.QueryResponse?.Class || []
    const jobMaterialsClassId = classes.find(
      (c: any) => nameMatches(c.Name, JOB_MATERIALS_PATTERNS)
    )?.Id
    const subExpenseClassId = classes.find(
      (c: any) => nameMatches(c.Name, SUB_EXPENSE_PATTERNS)
    )?.Id

    const classIds = new Set<string>()
    const classIdToType: Record<string, AccountType> = {}
    if (jobMaterialsClassId) {
      classIds.add(jobMaterialsClassId)
      classIdToType[jobMaterialsClassId] = 'Job Materials'
    }
    if (subExpenseClassId) {
      classIds.add(subExpenseClassId)
      classIdToType[subExpenseClassId] = 'Subcontractor Expense'
    }

    if (accountIds.size === 0 && classIds.size === 0) {
      const accountList = accounts.map((a: any) => ({ name: a.Name ?? '', type: a.AccountType ?? '' }))
      const classList = classes.map((c: any) => c.Name ?? '')
      const payload: Record<string, unknown> = {
        transactions: [],
        error: 'Could not find Job Materials or Subcontractor Expense accounts or classes in QuickBooks',
        help: 'In QuickBooks, add at least one Expense account or Class with a name containing "Job Materials" or "Materials", and/or "Subcontractor Expense" or "Subcontractors". Chart of Accounts: Settings → Chart of Accounts. Classes: Settings → All Lists → Classes. Then tag your bills/checks/expenses with that account or class so they appear here.',
        yourAccounts: accountList,
        yourClasses: classList,
      }
      if (debug) {
        payload._debug = {
          accountsMatched: { jobMaterialsIds: [], subExpenseIds: [], allAccountNames: accounts.map((a: any) => a.Name) },
          classesMatched: { jobMaterialsClassId: null, subExpenseClassId: null, allClassNames: classes.map((c: any) => c.Name) },
          yourAccounts: accountList,
          yourClasses: classList,
        }
      }
      return new Response(
        JSON.stringify(payload),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const out: JobTransaction[] = []
    const startDate = '2024-01-01' // configurable later via body

    const pushFrom = (
      entityType: string,
      list: any[],
      getVendor: (t: any) => string,
      getTotal: (t: any) => number,
      getProjectRef: (t: any) => { id: string; name: string } | null
    ) => {
      for (const t of list) {
        const { accountType, amount } = transactionHasAccountOrClass(
          t, accountIds, accountIdToType, classIds, classIdToType
        )
        if (!accountType || amount === 0) continue
        const projectRef = getProjectRef(t)
        const firstLine = (t.Line || [])[0]
        const description = firstLine?.Description || (t.PrivateNote ?? '') || `${entityType} ${t.DocNumber || t.Id}`
        out.push({
          qbTransactionId: String(t.Id),
          qbTransactionType: entityType,
          vendorName: getVendor(t),
          txnDate: t.TxnDate || '',
          docNumber: t.DocNumber ?? t.PrivateNote ?? '',
          amount: getTotal(t),
          accountType,
          qbProjectId: projectRef?.id ?? null,
          qbProjectName: projectRef?.name ?? null,
          description: description.slice(0, 500),
        })
      }
    }

    const projectRefFrom = (t: any) => {
      const ref = t.ProjectRef || t.ClassRef
      if (!ref?.value) return null
      return { id: ref.value, name: ref.name ?? '' }
    }

    // 2) Bills
    const billRes = await qbFetch(
      apiBase,
      accessToken,
      realmId,
      `SELECT * FROM Bill WHERE TxnDate >= '${startDate}' MAXRESULTS 500`
    )
    const bills: any[] = billRes.QueryResponse?.Bill || []
    pushFrom(
      'Bill',
      bills,
      (t) => t.VendorRef?.name ?? t.VendorRef?.value ?? 'Unknown',
      (t) => Number(t.TotalAmt ?? 0),
      projectRefFrom
    )

    // 3) Purchase (expenses)
    const purchaseRes = await qbFetch(
      apiBase,
      accessToken,
      realmId,
      `SELECT * FROM Purchase WHERE TxnDate >= '${startDate}' MAXRESULTS 500`
    )
    const purchases: any[] = purchaseRes.QueryResponse?.Purchase || []
    pushFrom(
      'Purchase',
      purchases,
      (t) => t.EntityRef?.name ?? t.EntityRef?.value ?? 'Unknown',
      (t) => Number(t.TotalAmt ?? 0),
      projectRefFrom
    )

    // 4) Check
    const checkRes = await qbFetch(
      apiBase,
      accessToken,
      realmId,
      `SELECT * FROM Check WHERE TxnDate >= '${startDate}' MAXRESULTS 500`
    )
    const checks: any[] = checkRes.QueryResponse?.Check || []
    pushFrom(
      'Check',
      checks,
      (t) => t.VendorRef?.name ?? t.VendorRef?.value ?? 'Unknown',
      (t) => Number(t.TotalAmt ?? 0),
      projectRefFrom
    )

    // 5) VendorCredit (amount will be negative for display)
    const creditRes = await qbFetch(
      apiBase,
      accessToken,
      realmId,
      `SELECT * FROM VendorCredit WHERE TxnDate >= '${startDate}' MAXRESULTS 500`
    )
    const vendorCredits: any[] = creditRes.QueryResponse?.VendorCredit || []
    pushFrom(
      'VendorCredit',
      vendorCredits,
      (t) => t.VendorRef?.name ?? t.VendorRef?.value ?? 'Unknown',
      (t) => -Math.abs(Number(t.TotalAmt ?? 0)),
      projectRefFrom
    )

    // Only keep transactions for QB projects that are linked to an app project
    const { data: projectRows } = await supabaseClient
      .from('projects')
      .select('qb_project_id')
      .not('qb_project_id', 'is', null)
    const allowedQbProjectIds = new Set((projectRows ?? []).map((r: { qb_project_id: string }) => r.qb_project_id))
    const outFiltered = out.filter(
      (t) => t.qbProjectId != null && allowedQbProjectIds.has(t.qbProjectId)
    )

    // Filter out already-imported: fetch qb_transaction_id from our DB (material + sub entries)
    const { data: materialRows } = await supabaseClient
      .from('material_entries')
      .select('qb_transaction_id, qb_transaction_type')
      .not('qb_transaction_id', 'is', null)
    const { data: subRows } = await supabaseClient
      .from('subcontractor_entries')
      .select('qb_transaction_id, qb_transaction_type')
      .not('qb_transaction_id', 'is', null)
    const importedSet = new Set<string>()
    for (const r of [...(materialRows || []), ...(subRows || [])]) {
      if (r.qb_transaction_id && r.qb_transaction_type) {
        importedSet.add(`${r.qb_transaction_type}:${r.qb_transaction_id}`)
      }
    }
    const pending = outFiltered.filter(
      (t) => !importedSet.has(`${t.qbTransactionType}:${t.qbTransactionId}`)
    )

    // Sort by date desc
    pending.sort((a, b) => (b.txnDate || '').localeCompare(a.txnDate || ''))

    const payload: Record<string, unknown> = { transactions: pending }
    if (debug) {
      const firstBill = bills[0]
      payload._debug = {
        accountsMatched: {
          jobMaterialsIds: jobMaterialsAccounts.map((a: any) => String(a.Id)),
          subExpenseIds: subExpenseAccounts.map((a: any) => String(a.Id)),
          allAccountNames: accounts.map((a: any) => a.Name),
        },
        classesMatched: {
          jobMaterialsClassId: jobMaterialsClassId ?? null,
          subExpenseClassId: subExpenseClassId ?? null,
          allClassNames: classes.map((c: any) => c.Name),
        },
        billsCount: bills.length,
        allBillsSummary: bills.map((b: any) => ({
          Id: b.Id,
          TotalAmt: b.TotalAmt,
          DocNumber: b.DocNumber,
          VendorRef: b.VendorRef?.name ?? b.VendorRef?.value,
          headerClassRef: b.ClassRef,
          firstLine: (b.Line || [])[0]
            ? {
                Amount: (b.Line || [])[0].Amount,
                DetailType: (b.Line || [])[0].DetailType,
                AccountRef: (b.Line || [])[0].AccountBasedExpenseLineDetail?.AccountRef,
                ClassRef: (b.Line || [])[0].AccountBasedExpenseLineDetail?.ClassRef ?? (b.Line || [])[0].ClassRef,
              }
            : null,
        })),
        firstBillFullFirstLine: firstBill?.Line?.[0] ?? null,
      }
    }

    return new Response(
      JSON.stringify(payload),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  } catch (error) {
    console.error('qb-get-job-transactions error:', error)
    return new Response(
      JSON.stringify({
        transactions: [],
        error: (error as Error).message,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
