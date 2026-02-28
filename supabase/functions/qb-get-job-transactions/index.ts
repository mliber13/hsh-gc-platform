// QuickBooks Get Job Transactions
// Fetches transactions for Project Actuals (reconcile to QBO COGS + Expense).
// - Source of truth: Bill, Purchase, VendorCredit; Check only when not a bill-payment (avoids double-count).
// - Line-level allocation: one row per (txnId, lineId, job) so multi-job checks split correctly.
// - Dedupe by QBO identity only: (qb_transaction_type, qb_transaction_id, qb_line_id).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ----- Inlined from _shared/qb.ts (so deploy works without _shared bundle) -----
const QB_TOKEN_ENDPOINT = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const QB_SANDBOX_BASE = 'https://sandbox-quickbooks.api.intuit.com/v3/company'
const QB_PRODUCTION_BASE = 'https://quickbooks.api.intuit.com/v3/company'
const EXPIRY_BUFFER_MS = 5 * 60 * 1000

function getQBApiBase(): string {
  return Deno.env.get('QB_USE_PRODUCTION') === 'true' ? QB_PRODUCTION_BASE : QB_SANDBOX_BASE
}

async function getValidQbToken(
  supabaseClient: { from: (t: string) => any },
  userId: string
): Promise<{ accessToken: string; realmId: string } | null> {
  const clientId = Deno.env.get('QB_CLIENT_ID') ?? ''
  const clientSecret = Deno.env.get('QB_CLIENT_SECRET') ?? ''
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('qb_access_token, qb_refresh_token, qb_token_expires_at, qb_realm_id')
    .eq('id', userId)
    .single()
  if (!profile?.qb_access_token || !profile?.qb_realm_id) return null
  const expiresAt = profile.qb_token_expires_at ? new Date(profile.qb_token_expires_at).getTime() : 0
  const now = Date.now()
  if (expiresAt > now + EXPIRY_BUFFER_MS) {
    return { accessToken: profile.qb_access_token, realmId: profile.qb_realm_id }
  }
  if (!profile.qb_refresh_token || !clientId || !clientSecret) return null
  const authString = btoa(`${clientId}:${clientSecret}`)
  const refreshResponse = await fetch(QB_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${authString}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: profile.qb_refresh_token }),
  })
  if (!refreshResponse.ok) {
    console.error('QB token refresh failed:', await refreshResponse.text())
    return null
  }
  const tokens = await refreshResponse.json()
  const accessToken = tokens.access_token
  const refreshToken = tokens.refresh_token ?? profile.qb_refresh_token
  const expiresIn = tokens.expires_in ?? 3600
  const newExpiresAt = new Date(now + expiresIn * 1000).toISOString()
  await supabaseClient.from('profiles').update({
    qb_access_token: accessToken,
    qb_refresh_token: refreshToken,
    qb_token_expires_at: newExpiresAt,
  }).eq('id', userId)
  return { accessToken, realmId: profile.qb_realm_id }
}
// ----- End inlined _shared/qb.ts -----

const MINOR_VERSION = 65

// Account/Class name patterns (case-insensitive; any of these matches)
const JOB_MATERIALS_PATTERNS = [
  'job materials', 'job material', 'materials', 'job cost - materials', 'cost of materials',
  'material', 'job cost materials', 'materials expense', 'construction materials', 'job materials expense'
]
const SUB_EXPENSE_PATTERNS = [
  'subcontractor expense', 'sub expense', 'subcontractors', 'subcontractor', 'job cost - sub', 'subs',
  'subcontractor cost', 'subcontract', 'sub contractor', '1099', 'contract labor', 'job cost - subcontractor',
  'outside services', 'outside service'
]
const UTILITIES_PATTERNS = [
  'utilities', 'utility', 'job cost - utilities', 'job utilities', 'porta pott', 'propane',
  'porta potty', 'port-a-potty', 'porta john', 'job cost utilities'
]
const DISPOSAL_PATTERNS = [
  'disposal', 'disposal fees', 'dump fees', 'dumpster', 'job cost - disposal',
  'trash', 'waste', 'debris removal', 'rubbish'
]
const FUEL_PATTERNS = [
  'fuel', 'fuel expense', 'gas', 'job cost - fuel', 'fuel and gas',
  'gasoline', 'diesel', 'job fuel'
]

type AccountType = 'Job Materials' | 'Subcontractor Expense' | 'Utilities' | 'Disposal Fees' | 'Fuel Expense'

interface JobTransaction {
  qbTransactionId: string
  qbTransactionType: string
  qbLineId: string | null
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

/** Fetch all pages for an entity (avoids missing records due to 500 cap). */
async function qbFetchAll(
  apiBase: string,
  token: string,
  realmId: string,
  entity: string,
  startDate: string,
  maxPages = 10
): Promise<any[]> {
  const out: any[] = []
  let startPosition = 1
  const pageSize = 500
  for (let page = 0; page < maxPages; page++) {
    const query = `SELECT * FROM ${entity} WHERE TxnDate >= '${startDate}' STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`
    const res = await qbFetch(apiBase, token, realmId, query)
    const arr = res.QueryResponse?.[entity] ?? []
    const list = Array.isArray(arr) ? arr : arr != null ? [arr] : []
    for (const item of list) out.push(item)
    if (list.length < pageSize) break
    startPosition += pageSize
  }
  return out
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

/** QBO often returns "Customer:Job" for ref.name; use only the job part (after the first colon) for display */
function jobDisplayName(rawName: string): string {
  if (!rawName) return ''
  const i = rawName.indexOf(':')
  return i >= 0 ? rawName.slice(i + 1).trim() : rawName.trim()
}

/** Get project/job from header or from first line that has ClassRef/CustomerRef/ProjectRef (QBO often puts job on line) */
function getProjectRefFromTransaction(t: any): { id: string; name: string } | null {
  const headerRef = t.ProjectRef || t.ClassRef
  const headerRes = headerRef?.value ? { id: String(headerRef.value), name: jobDisplayName(headerRef.name ?? '') } : null
  const lines = t.Line || []
  for (const line of lines) {
    const ref = getProjectRefFromLine(line, headerRes)
    if (ref) return ref
  }
  return headerRes
}

/** Get project/job from a single line (ClassRef/CustomerRef/ProjectRef) or fallback to header */
function getProjectRefFromLine(line: any, headerRef: { id: string; name: string } | null): { id: string; name: string } | null {
  const detail = line?.AccountBasedExpenseLineDetail || line?.ExpenseDetail || line
  const ref = detail?.ClassRef || detail?.CustomerRef || detail?.ProjectRef || line?.ClassRef
  if (ref?.value) return { id: String(ref.value), name: jobDisplayName(ref.name ?? '') }
  return headerRef
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
function classNameMatchesUtilities(name: string | null): boolean {
  if (!name) return false
  const n = name.toLowerCase()
  return UTILITIES_PATTERNS.some((p) => n.includes(p))
}
function classNameMatchesDisposal(name: string | null): boolean {
  if (!name) return false
  const n = name.toLowerCase()
  return DISPOSAL_PATTERNS.some((p) => n.includes(p))
}
function classNameMatchesFuel(name: string | null): boolean {
  if (!name) return false
  const n = name.toLowerCase()
  return FUEL_PATTERNS.some((p) => n.includes(p))
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
  } else if (headerClassName && classNameMatchesUtilities(headerClassName)) {
    matchedType = 'Utilities'
  } else if (headerClassName && classNameMatchesDisposal(headerClassName)) {
    matchedType = 'Disposal Fees'
  } else if (headerClassName && classNameMatchesFuel(headerClassName)) {
    matchedType = 'Fuel Expense'
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
      (className && classNameMatchesSubExpense(className)) ||
      (className && classNameMatchesUtilities(className)) ||
      (className && classNameMatchesDisposal(className)) ||
      (className && classNameMatchesFuel(className))
    if (matchByAccount) {
      totalForAccount += amt
      if (!matchedType) matchedType = accountIdToType[accountId!] ?? null
    } else if (matchByClassId) {
      totalForAccount += amt
      if (!matchedType) matchedType = classIdToType[classId!] ?? null
    } else if (matchByClassName) {
      totalForAccount += amt
      if (!matchedType) {
        matchedType = classNameMatchesJobMaterials(className) ? 'Job Materials'
          : classNameMatchesSubExpense(className) ? 'Subcontractor Expense'
          : classNameMatchesUtilities(className) ? 'Utilities'
          : classNameMatchesDisposal(className) ? 'Disposal Fees'
          : 'Fuel Expense'
      }
    }
  }
  return { accountType: matchedType, amount: totalForAccount }
}

/** One row per line (or one row for whole txn if single-line): amount, project, and description per line. */
function getLineLevelRows(
  t: any,
  accountIds: Set<string>,
  accountIdToType: Record<string, AccountType>,
  classIds: Set<string>,
  classIdToType: Record<string, AccountType>,
  headerProjectRef: { id: string; name: string } | null
): Array<{ lineId: string; amount: number; accountType: AccountType; projectRef: { id: string; name: string } | null; description: string }> {
  const lines = t.Line || []
  const headerClassRef = t?.ClassRef || t?.ProjectRef
  const headerClassId = headerClassRef?.value ?? null
  const headerClassName = headerClassRef?.name ?? null
  let headerMatch: AccountType | null = null
  if (headerClassId && classIds.has(headerClassId)) headerMatch = classIdToType[headerClassId] ?? null
  else if (headerClassName && classNameMatchesJobMaterials(headerClassName)) headerMatch = 'Job Materials'
  else if (headerClassName && classNameMatchesSubExpense(headerClassName)) headerMatch = 'Subcontractor Expense'
  else if (headerClassName && classNameMatchesUtilities(headerClassName)) headerMatch = 'Utilities'
  else if (headerClassName && classNameMatchesDisposal(headerClassName)) headerMatch = 'Disposal Fees'
  else if (headerClassName && classNameMatchesFuel(headerClassName)) headerMatch = 'Fuel Expense'

  const txnFallbackDesc = (t.Line || [])[0]?.Description || (t.PrivateNote ?? '') || ''
  const rows: Array<{ lineId: string; amount: number; accountType: AccountType; projectRef: { id: string; name: string } | null; description: string }> = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const amt = getLineAmount(line)
    if (amt === 0) continue
    const accountId = getLineAccountRef(line)
    const { id: classId, name: className } = getLineClassRef(line)
    const matchByAccount = accountId && accountIds.has(accountId)
    const matchByClassId = classId && classIds.has(classId)
    const matchByClassName =
      (className && classNameMatchesJobMaterials(className)) ||
      (className && classNameMatchesSubExpense(className)) ||
      (className && classNameMatchesUtilities(className)) ||
      (className && classNameMatchesDisposal(className)) ||
      (className && classNameMatchesFuel(className))
    let accountType: AccountType | null = null
    if (headerMatch && (headerClassId || headerClassName)) {
      accountType = headerMatch
    } else if (matchByAccount) {
      accountType = accountIdToType[accountId!] ?? null
    } else if (matchByClassId) {
      accountType = classIdToType[classId!] ?? null
    } else if (matchByClassName) {
      accountType = classNameMatchesJobMaterials(className)
        ? 'Job Materials'
        : classNameMatchesSubExpense(className)
          ? 'Subcontractor Expense'
          : classNameMatchesUtilities(className)
            ? 'Utilities'
            : classNameMatchesDisposal(className)
              ? 'Disposal Fees'
              : 'Fuel Expense'
    }
    if (!accountType) continue
    const lineId = line.Id != null ? String(line.Id) : String(i)
    const projectRef = getProjectRefFromLine(line, headerProjectRef)
    const lineDesc = (line.Description ?? '').trim() || txnFallbackDesc
    const description = (lineDesc || `Doc ${t.DocNumber ?? t.Id ?? ''}`).slice(0, 500)
    rows.push({ lineId, amount: amt, accountType, projectRef, description })
  }
  return rows
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
  let includeUnassigned = false
  try {
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      debug = body?.debug === true
      includeUnassigned = body?.includeUnassigned === true
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
    const utilitiesAccounts = accounts.filter(
      (a: any) => nameMatches(a.Name, UTILITIES_PATTERNS)
    )
    const disposalAccounts = accounts.filter(
      (a: any) => nameMatches(a.Name, DISPOSAL_PATTERNS)
    )
    const fuelAccounts = accounts.filter(
      (a: any) => nameMatches(a.Name, FUEL_PATTERNS)
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
    for (const a of utilitiesAccounts) {
      const id = String(a.Id)
      accountIds.add(id)
      accountIdToType[id] = 'Utilities'
    }
    for (const a of disposalAccounts) {
      const id = String(a.Id)
      accountIds.add(id)
      accountIdToType[id] = 'Disposal Fees'
    }
    for (const a of fuelAccounts) {
      const id = String(a.Id)
      accountIds.add(id)
      accountIdToType[id] = 'Fuel Expense'
    }
    // 1b) Get Classes (Category in QB UI): match same names for job materials / sub expense / utilities / disposal / fuel
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
    const utilitiesClassId = classes.find(
      (c: any) => nameMatches(c.Name, UTILITIES_PATTERNS)
    )?.Id
    const disposalClassId = classes.find(
      (c: any) => nameMatches(c.Name, DISPOSAL_PATTERNS)
    )?.Id
    const fuelClassId = classes.find(
      (c: any) => nameMatches(c.Name, FUEL_PATTERNS)
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
    if (utilitiesClassId) {
      classIds.add(utilitiesClassId)
      classIdToType[utilitiesClassId] = 'Utilities'
    }
    if (disposalClassId) {
      classIds.add(disposalClassId)
      classIdToType[disposalClassId] = 'Disposal Fees'
    }
    if (fuelClassId) {
      classIds.add(fuelClassId)
      classIdToType[fuelClassId] = 'Fuel Expense'
    }

    if (accountIds.size === 0 && classIds.size === 0) {
      const accountList = accounts.map((a: any) => ({ name: a.Name ?? '', type: a.AccountType ?? '' }))
      const classList = classes.map((c: any) => c.Name ?? '')
      const payload: Record<string, unknown> = {
        transactions: [],
        error: 'Could not find Job Materials, Subcontractor Expense, Utilities, Disposal Fees, or Fuel Expense accounts or classes in QuickBooks',
        help: 'In QuickBooks, add at least one Expense account or Class with a name containing "Job Materials", "Subcontractor", "Utilities", "Disposal" (fees), or "Fuel". Chart of Accounts: Settings → Chart of Accounts. Classes: Settings → All Lists → Classes. Then tag your bills/checks/expenses so they appear here.',
        yourAccounts: accountList,
        yourClasses: classList,
      }
      if (debug) {
        payload._debug = {
          earlyReturn: true,
          reason: 'no_accounts_or_classes_matched',
          accountsMatched: { jobMaterialsIds: [], subExpenseIds: [], utilitiesIds: [], disposalIds: [], fuelIds: [], allAccountNames: accounts.map((a: any) => a.Name) },
          classesMatched: { jobMaterialsClassId: null, subExpenseClassId: null, utilitiesClassId: null, disposalClassId: null, fuelClassId: null, allClassNames: classes.map((c: any) => c.Name) },
          yourAccounts: accountList,
          yourClasses: classList,
          counts: null,
          checksSummary: null,
        }
      }
      return new Response(
        JSON.stringify(payload),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const out: JobTransaction[] = []
    const excluded: Array<{ reason: string; txnType: string; txnId: string; docNumber?: string; vendor?: string; amount?: number; date?: string }> = []
    const startDate = '2024-01-01' // configurable later via body

    const pushLineLevel = (
      entityType: string,
      list: any[],
      getVendor: (t: any) => string,
      getSign: (t: any) => number = () => 1,
      skipCheck?: (t: any) => boolean
    ) => {
      for (const t of list) {
        if (skipCheck?.(t)) {
          excluded.push({
            reason: 'excluded_payment_linked',
            txnType: entityType,
            txnId: String(t.Id),
            docNumber: t.DocNumber ?? '',
            vendor: getVendor(t),
            amount: Number(t.TotalAmt ?? 0),
            date: t.TxnDate ?? '',
          })
          continue
        }
        const headerProjectRef = getProjectRefFromTransaction(t)
        const lineRows = getLineLevelRows(t, accountIds, accountIdToType, classIds, classIdToType, headerProjectRef)
        if (lineRows.length === 0) {
          if (debug) {
            excluded.push({
              reason: 'excluded_no_matching_lines',
              txnType: entityType,
              txnId: String(t.Id),
              docNumber: t.DocNumber ?? '',
              vendor: getVendor(t),
              amount: Number(t.TotalAmt ?? 0),
              date: t.TxnDate ?? '',
            })
          }
          continue
        }
        const vendorName = getVendor(t)
        const txnDate = t.TxnDate || ''
        const docNumber = t.DocNumber ?? t.PrivateNote ?? ''
        const sign = getSign(t)
        for (const row of lineRows) {
          out.push({
            qbTransactionId: String(t.Id),
            qbTransactionType: entityType,
            qbLineId: row.lineId,
            vendorName,
            txnDate,
            docNumber,
            amount: sign * row.amount,
            accountType: row.accountType,
            qbProjectId: row.projectRef?.id ?? null,
            qbProjectName: row.projectRef?.name ?? null,
            description: row.description,
          })
        }
      }
    }

    // 1b) BillPayments: exclude Checks that pay bills (source of truth = Bill, not payment)
    const billPayments: any[] = await qbFetchAll(apiBase, accessToken, realmId, 'BillPayment', startDate)
    const billPaymentKeySet = new Set<string>()
    for (const bp of billPayments) {
      const vendorId = bp.VendorRef?.value ?? bp.VendorRef?.name ?? ''
      const total = Number(bp.TotalAmt ?? 0)
      const date = bp.TxnDate ?? ''
      billPaymentKeySet.add(`${vendorId}|${total}|${date}`)
    }

    // 2) Bills (source of truth; BillPayment excluded so we don't double-count)
    const bills: any[] = await qbFetchAll(apiBase, accessToken, realmId, 'Bill', startDate)
    pushLineLevel(
      'Bill',
      bills,
      (t) => t.VendorRef?.name ?? t.VendorRef?.value ?? 'Unknown'
    )

    // 3) Purchase (expenses); credit card credits are negated so credits reduce cost
    const purchases: any[] = await qbFetchAll(apiBase, accessToken, realmId, 'Purchase', startDate)
    const isCreditCardCredit = (t: any) =>
      t.Credit === true || t.Credit === 1 || (typeof t.Credit === 'string' && t.Credit.toLowerCase() === 'true') ||
      t.credit === true || t.credit === 1
    pushLineLevel(
      'Purchase',
      purchases,
      (t) => t.EntityRef?.name ?? t.EntityRef?.value ?? 'Unknown',
      (t) => (isCreditCardCredit(t) ? -1 : 1)
    )

    // 4) Check — exclude when this Check is a bill-payment (same vendor/amount/date as a BillPayment)
    // Note: QBO Query API returns "invalid context declaration: Check" (400) — Check entity is not queryable.
    // For job expenses to sync, use Receive bill + Pay bill in QuickBooks instead of Write a check.
    const checkQuery = `SELECT * FROM Check WHERE TxnDate >= '${startDate}' MAXRESULTS 500`
    const checkResRaw = await fetch(
      `${apiBase}/${realmId}/query?query=${encodeURIComponent(checkQuery)}&minorversion=${MINOR_VERSION}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    )
    const checkBodyText = await checkResRaw.text()
    let checkRes: any = {}
    try {
      checkRes = checkBodyText ? JSON.parse(checkBodyText) : {}
    } catch (_) {
      checkRes = { _rawBody: checkBodyText?.slice(0, 500) }
    }
    const checkQueryOk = checkResRaw.ok
    const checkQueryStatus = checkResRaw.status
    const checkFault = checkRes?.Fault ?? null
    const checkErrorText = !checkResRaw.ok ? (checkBodyText?.slice(0, 2000) ?? '') : ''
    const rawCheck = checkRes.QueryResponse?.Check
    const checks: any[] = Array.isArray(rawCheck) ? rawCheck : rawCheck != null ? [rawCheck] : []
    const isBillPaymentCheck = (t: any) => {
      const key = `${t.VendorRef?.value ?? t.VendorRef?.name ?? ''}|${Number(t.TotalAmt ?? 0)}|${t.TxnDate ?? ''}`
      return billPaymentKeySet.has(key)
    }
    pushLineLevel(
      'Check',
      checks,
      (t) => t.VendorRef?.name ?? t.VendorRef?.value ?? 'Unknown',
      () => 1,
      isBillPaymentCheck
    )

    // 5) VendorCredit (amount will be negative for display)
    const vendorCredits: any[] = await qbFetchAll(apiBase, accessToken, realmId, 'VendorCredit', startDate)
    pushLineLevel(
      'VendorCredit',
      vendorCredits,
      (t) => t.VendorRef?.name ?? t.VendorRef?.value ?? 'Unknown',
      () => -1
    )

    // Only keep transactions for jobs that exist in the GC app (exclude Drywall-only projects)
    const { data: projectRows } = await supabaseClient.from('projects').select('name, qb_project_id, metadata')
    const isGCVisible = (r: { metadata?: { app_scope?: string; visibility?: { gc?: boolean } } | null }) => {
      const m = r.metadata
      if (!m) return true
      if (m.app_scope === 'DRYWALL_ONLY') return false
      if (m.visibility && (m.visibility as { gc?: boolean }).gc === false) return false
      return true
    }
    const gcProjects = (projectRows ?? []).filter(isGCVisible)
    const allowedQbProjectIds = new Set(
      gcProjects.map((r: { qb_project_id?: string | null }) => r.qb_project_id).filter(Boolean).map(String)
    )
    const allowedProjectNames = new Set(
      gcProjects.map((r: { name?: string | null }) => (r.name ?? '').trim().toLowerCase()).filter(Boolean)
    )
    // By default only transactions that match a GC project. If includeUnassigned=true, also include those with no job in QB.
    const outFiltered =
      allowedQbProjectIds.size > 0
        ? out.filter((t) => (t.qbProjectId != null && allowedQbProjectIds.has(t.qbProjectId)) || (includeUnassigned && t.qbProjectId == null))
        : out.filter((t) => {
            const jobName = (t.qbProjectName ?? '').trim().toLowerCase()
            return (jobName.length > 0 && allowedProjectNames.has(jobName)) || (includeUnassigned && jobName.length === 0)
          })

    // Filter out already-imported: dedupe by QBO identity (txnType + txnId + lineId).
    // Legacy: rows with null qb_line_id count as "whole transaction imported" so we don't re-show them.
    const { data: materialRows } = await supabaseClient
      .from('material_entries')
      .select('qb_transaction_id, qb_transaction_type, qb_line_id')
      .not('qb_transaction_id', 'is', null)
    const { data: subRows } = await supabaseClient
      .from('subcontractor_entries')
      .select('qb_transaction_id, qb_transaction_type, qb_line_id')
      .not('qb_transaction_id', 'is', null)
    const importedSet = new Set<string>()
    const legacyImportedTxns = new Set<string>() // txnType:txnId for rows with null qb_line_id
    for (const r of [...(materialRows || []), ...(subRows || [])]) {
      if (r.qb_transaction_id && r.qb_transaction_type) {
        const lineId = r.qb_line_id != null ? String(r.qb_line_id) : ''
        importedSet.add(`${r.qb_transaction_type}:${r.qb_transaction_id}:${lineId}`)
        if (r.qb_line_id == null) legacyImportedTxns.add(`${r.qb_transaction_type}:${r.qb_transaction_id}`)
      }
    }
    const pending = outFiltered.filter((t) => {
      const fullKey = `${t.qbTransactionType}:${t.qbTransactionId}:${t.qbLineId ?? ''}`
      if (importedSet.has(fullKey)) return false
      if (legacyImportedTxns.has(`${t.qbTransactionType}:${t.qbTransactionId}`)) return false
      return true
    })

    // Sort by date desc
    pending.sort((a, b) => (b.txnDate || '').localeCompare(a.txnDate || ''))

    // Per-project totals from QBO (for reconciliation: pre-fill "QBO total" in app)
    // Key by both QB id and project name so app can match by name when qb_project_id is not set
    const projectTotals: Record<string, number> = {}
    for (const t of out) {
      const idKey = (t.qbProjectId ?? '').toString().trim()
      const nameKey = (t.qbProjectName ?? '').toString().trim()
      const amt = t.amount
      if (idKey) projectTotals[idKey] = (projectTotals[idKey] ?? 0) + amt
      if (nameKey && nameKey !== idKey) projectTotals[nameKey] = (projectTotals[nameKey] ?? 0) + amt
    }

    const checkEntityUnsupported =
      !checkQueryOk &&
      checkFault?.Error?.[0]?.Detail != null &&
      String(checkFault.Error[0].Detail).includes('invalid context declaration') &&
      String(checkFault.Error[0].Detail).toLowerCase().includes('check')
    const payload: Record<string, unknown> = {
      transactions: pending,
      projectTotals,
      ...(checkEntityUnsupported ? { checkEntityUnsupported: true } : {}),
    }
    if (debug) {
      payload._excluded = excluded
      const firstBill = bills[0]
      // Put counts and checksSummary first so they're never lost to response size limits; keep bills summary small
      const checksSummaryList = checks.map((c: any) => {
        const ex = excluded.find((e) => e.txnType === 'Check' && e.txnId === String(c.Id))
        return {
          Id: c.Id,
          DocNumber: c.DocNumber ?? '',
          vendor: c.VendorRef?.name ?? c.VendorRef?.value,
          TotalAmt: c.TotalAmt,
          TxnDate: c.TxnDate,
          status: ex ? ex.reason : 'included',
        }
      })
      payload._debug = {
        counts: {
          beforeProjectFilter: out.length,
          afterProjectFilter: outFiltered.length,
          pendingCount: pending.length,
        },
        checksFetched: checks.length,
        checkQueryOk: checkQueryOk,
        checkQueryStatus: checkQueryStatus,
        checkFault: checkFault ?? null,
        checkErrorBody: !checkQueryOk ? checkRes : undefined,
        checkErrorText: !checkQueryOk && checkErrorText ? checkErrorText : undefined,
        checkResponseKeys: checkRes.QueryResponse ? Object.keys(checkRes.QueryResponse) : Object.keys(checkRes),
        checksSummary: checksSummaryList,
        excludedCount: excluded.length,
        accountsMatched: {
          jobMaterialsIds: jobMaterialsAccounts.map((a: any) => String(a.Id)),
          subExpenseIds: subExpenseAccounts.map((a: any) => String(a.Id)),
          utilitiesIds: utilitiesAccounts.map((a: any) => String(a.Id)),
          disposalIds: disposalAccounts.map((a: any) => String(a.Id)),
          fuelIds: fuelAccounts.map((a: any) => String(a.Id)),
          allAccountNames: accounts.map((a: any) => a.Name),
        },
        classesMatched: {
          jobMaterialsClassId: jobMaterialsClassId ?? null,
          subExpenseClassId: subExpenseClassId ?? null,
          utilitiesClassId: utilitiesClassId ?? null,
          disposalClassId: disposalClassId ?? null,
          fuelClassId: fuelClassId ?? null,
          allClassNames: classes.map((c: any) => c.Name),
        },
        billsCount: bills.length,
        allBillsSummary: bills.slice(0, 25).map((b: any) => ({
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
        purchasesWithPositiveAmt: purchases
          .filter((p: any) => Number(p.TotalAmt ?? 0) > 0)
          .slice(0, 5)
          .map((p: any) => ({
            Id: p.Id,
            TotalAmt: p.TotalAmt,
            Credit: p.Credit,
            credit: p.credit,
            PaymentType: p.PaymentType,
            TxnDate: p.TxnDate,
            DocNumber: p.DocNumber,
            topLevelKeys: Object.keys(p),
          })),
        billPaymentKeySample: Array.from(billPaymentKeySet).slice(0, 5),
      }
    }
    if (excluded.length > 0) {
      (payload as any).excluded = excluded
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
