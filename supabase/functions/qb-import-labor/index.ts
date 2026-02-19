// QuickBooks Import Labor - Deno/TS only (no JSX). Do not replace with React/TSX.
// Fetches Journal Entries for a date range, extracts wage lines (by configurable account IDs),
// maps job/class to app projects, and upserts into labor_entries (source_system='qbo').

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const QB_TOKEN_ENDPOINT = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const QB_SANDBOX_BASE = 'https://sandbox-quickbooks.api.intuit.com/v3/company'
const QB_PRODUCTION_BASE = 'https://quickbooks.api.intuit.com/v3/company'
const EXPIRY_BUFFER_MS = 5 * 60 * 1000
const MINOR_VERSION = 65

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
  if (!refreshResponse.ok) return null
  const tokens = await refreshResponse.json()
  const accessToken = tokens.access_token
  const refreshToken = tokens.refresh_token ?? profile.qb_refresh_token
  const expiresIn = tokens.expires_in ?? 3600
  await supabaseClient.from('profiles').update({
    qb_access_token: accessToken,
    qb_refresh_token: refreshToken,
    qb_token_expires_at: new Date(now + expiresIn * 1000).toISOString(),
  }).eq('id', userId)
  return { accessToken, realmId: profile.qb_realm_id }
}

function qbFetch(apiBase: string, token: string, realmId: string, query: string): Promise<{ QueryResponse?: Record<string, unknown[]> }> {
  return fetch(
    `${apiBase}/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=${MINOR_VERSION}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
  ).then((r) => (r.ok ? r.json() : Promise.resolve({})))
}

async function qbFetchAccountNumbers(
  apiBase: string,
  token: string,
  realmId: string,
  accountIds: string[]
): Promise<Set<string>> {
  if (accountIds.length === 0) return new Set()
  const out = new Set<string>()
  const query = 'SELECT Id, AcctNum FROM Account WHERE Active = true MAXRESULTS 1000'
  const res = await qbFetch(apiBase, token, realmId, query)
  const list: any[] = res.QueryResponse?.Account ?? []
  const idSet = new Set(accountIds.map((id) => String(id).trim()).filter(Boolean))
  for (const a of list) {
    const id = String(a.Id ?? '')
    if (idSet.has(id) && a.AcctNum != null && String(a.AcctNum).trim() !== '') {
      out.add(String(a.AcctNum).trim())
    }
  }
  return out
}

async function qbFetchJournalEntries(
  apiBase: string,
  token: string,
  realmId: string,
  dateStart: string,
  dateEnd: string
): Promise<any[]> {
  const out: any[] = []
  let startPosition = 1
  const pageSize = 500
  for (let page = 0; page < 10; page++) {
    const query = `SELECT * FROM JournalEntry WHERE TxnDate >= '${dateStart}' AND TxnDate <= '${dateEnd}' STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`
    const res = await qbFetch(apiBase, token, realmId, query)
    const arr = res.QueryResponse?.JournalEntry ?? []
    const list = Array.isArray(arr) ? arr : arr != null ? [arr] : []
    for (const item of list) out.push(item)
    if (list.length < pageSize) break
    startPosition += pageSize
  }
  return out
}

/** Get AccountRef from JournalEntryLineDetail. */
function getJELineAccountId(line: any): string | null {
  const detail = line?.JournalEntryLineDetail
  const val = detail?.AccountRef?.value
  return val != null ? String(val) : null
}

/** Get job/project from line: ClassRef or Entity (QBO "Name" column is often Entity for Customer:Job), then JE header. */
function getJELineClassRef(line: any, je?: any): { id: string | null; name: string | null } {
  const detail = line?.JournalEntryLineDetail || line
  let ref = detail?.ClassRef || line?.ClassRef
  let id = ref?.value != null ? String(ref.value) : null
  let name = ref?.name ?? null
  if (!id && !name && detail?.Entity?.EntityRef) {
    ref = detail.Entity.EntityRef
    id = ref?.value != null ? String(ref.value) : null
    name = ref?.name ?? null
  }
  if (!id && !name && je) {
    const headerRef = je?.ClassRef || je?.ProjectRef
    id = headerRef?.value != null ? String(headerRef.value) : null
    name = headerRef?.name ?? null
  }
  return { id, name }
}

function getJELineAmount(line: any): number {
  const amt = Number(line?.Amount ?? 0)
  return Math.abs(amt)
}

async function getOrCreateActualsId(
  supabaseClient: any,
  projectId: string,
  userId: string,
  organizationId: string
): Promise<string | null> {
  const { data: existing } = await supabaseClient
    .from('project_actuals')
    .select('id')
    .eq('project_id', projectId)
    .limit(1)
    .maybeSingle()
  if (existing?.id) return existing.id
  const { data: newActuals, error } = await supabaseClient
    .from('project_actuals')
    .insert({
      project_id: projectId,
      user_id: userId,
      organization_id: organizationId,
      labor_cost: 0,
      material_cost: 0,
      subcontractor_cost: 0,
      total_actual: 0,
    })
    .select('id')
    .single()
  if (error || !newActuals) return null
  return newActuals.id
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: 'No authorization header' }),
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
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }

  let dateStart: string
  let dateEnd: string
  let preview = false
  try {
    const body = await req.json().catch(() => ({}))
    dateStart = body?.dateStart ?? body?.date_start
    dateEnd = body?.dateEnd ?? body?.date_end
    preview = body?.preview === true
    if (!dateStart || !dateEnd) {
      return new Response(
        JSON.stringify({ error: 'dateStart and dateEnd are required (YYYY-MM-DD)' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }

  const tokenResult = await getValidQbToken(supabaseClient, user.id)
  if (!tokenResult) {
    return new Response(
      JSON.stringify({ error: 'QuickBooks not connected' }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()
  const organizationId = profile?.organization_id ?? 'default-org'

  const { data: wageConfig } = await supabaseClient
    .from('qbo_wage_allocation_config')
    .select('account_ids, account_ids_no_burden')
    .eq('organization_id', organizationId)
    .maybeSingle()
  const wageAccountIds: string[] = Array.isArray(wageConfig?.account_ids) ? wageConfig.account_ids : []
  const noBurdenAccountIds: string[] = Array.isArray(wageConfig?.account_ids_no_burden) ? wageConfig.account_ids_no_burden : []
  const allWageAccountIds = [...new Set([...wageAccountIds, ...noBurdenAccountIds].map((id) => String(id).trim()).filter(Boolean))]
  if (allWageAccountIds.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No wage allocation accounts configured. Set them in Import labor → Settings.' }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
  const wageAccountSet = new Set(allWageAccountIds)

  const apiBase = getQBApiBase()
  const { accessToken, realmId } = tokenResult
  const wageAccountNumbers = await qbFetchAccountNumbers(apiBase, accessToken, realmId, allWageAccountIds)
  const isWageAccount = (accountId: string | null) =>
    accountId != null && (wageAccountSet.has(accountId) || wageAccountNumbers.has(accountId))
  const noBurdenAccountSet = new Set(noBurdenAccountIds.map((id) => String(id).trim()).filter(Boolean))
  const noBurdenAccountNumbers = await qbFetchAccountNumbers(apiBase, accessToken, realmId, noBurdenAccountIds)
  const isNoBurdenAccount = (accountId: string | null) =>
    accountId != null && (noBurdenAccountSet.has(accountId) || noBurdenAccountNumbers.has(accountId))

  const { data: projects } = await supabaseClient
    .from('projects')
    .select('id, qb_project_id, name')
  const projectList: Array<{ id: string; qb_project_id: string | null; name: string | null }> = projects ?? []
  const projectByQbId: Record<string, string> = {}
  const projectByNameLower: Record<string, string> = {}
  for (const p of projectList) {
    if (p.qb_project_id) projectByQbId[String(p.qb_project_id)] = p.id
    const n = (p.name as string)?.trim()
    if (n) projectByNameLower[n.toLowerCase()] = p.id
  }

  const { data: burdenRow } = await supabaseClient
    .from('labor_burden_rates')
    .select('method, value')
    .eq('organization_id', organizationId)
    .is('employee_class_id', null)
    .eq('is_active', true)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const burdenPercent: number =
    burdenRow?.method === 'percent' && burdenRow?.value != null ? Number(burdenRow.value) : 0

  /** Resolve QBO class/job (id or name) to GC project id. Matches by qb id, exact name, name after colon, or project name contained in class name. */
  function resolveProjectId(classRef: { id: string | null; name: string | null }): string | null {
    if (classRef.id && projectByQbId[classRef.id]) return projectByQbId[classRef.id]
    const qbName = (classRef.name ?? '').trim()
    if (!qbName) return null
    const qbLower = qbName.toLowerCase()
    if (projectByNameLower[qbLower]) return projectByNameLower[qbLower]
    const afterColon = qbName.includes(':') ? qbName.split(':').pop()!.trim().toLowerCase() : ''
    if (afterColon && projectByNameLower[afterColon]) return projectByNameLower[afterColon]
    for (const p of projectList) {
      const projName = (p.name as string)?.trim()
      if (!projName) continue
      if (qbLower.includes(projName.toLowerCase()) || projName.toLowerCase().includes(qbLower)) return p.id
    }
    return null
  }

  const journalEntries = await qbFetchJournalEntries(apiBase, accessToken, realmId, dateStart, dateEnd)

  // Preview: return counts only, no DB writes
  if (preview) {
    let matchingWageLines = 0
    let totalGrossWages = 0
    const distinctProjectIds = new Set<string>()
    for (const je of journalEntries) {
      const lines = je.Line ?? []
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const accountId = getJELineAccountId(line)
        if (!isWageAccount(accountId)) continue
        const amount = getJELineAmount(line)
        if (amount <= 0) continue
        const classRef = getJELineClassRef(line, je)
        const projectId = resolveProjectId(classRef)
        if (!projectId) continue
        matchingWageLines++
        totalGrossWages += amount
        distinctProjectIds.add(projectId)
      }
    }
    return new Response(
      JSON.stringify({
        preview: true,
        journalEntriesFound: journalEntries.length,
        matchingWageLines,
        totalGrossWages,
        distinctProjectsAffected: distinctProjectIds.size,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }

  const batchId = crypto.randomUUID()
  let rowCount = 0
  let totalWages = 0
  const errors: Array<{ sourceId: string; errorMessage: string }> = []

  try {
    for (const je of journalEntries) {
      const jeId = String(je.Id ?? '')
      const txnDate = je.TxnDate ?? dateEnd
      const lines = je.Line ?? []
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const accountId = getJELineAccountId(line)
        if (!isWageAccount(accountId)) continue
        const classRef = getJELineClassRef(line, je)
        const amount = getJELineAmount(line)
        if (amount <= 0) continue

        const projectId = resolveProjectId(classRef)
        if (!projectId) {
          errors.push({
            sourceId: `${jeId}:${line.Id ?? i}`,
            errorMessage: `No app project matched for job/class: ${classRef.name || classRef.id || 'unknown'}`,
          })
          continue
        }

        const actualsId = await getOrCreateActualsId(supabaseClient, projectId, user.id, organizationId)
        if (!actualsId) {
          errors.push({ sourceId: `${jeId}:${line.Id ?? i}`, errorMessage: 'Could not get or create project actuals' })
          continue
        }

        const sourceId = `${jeId}:${line.Id ?? i}`
        const applyBurden = burdenPercent > 0 && !isNoBurdenAccount(accountId)
        const burdenAmount = applyBurden ? Math.round(amount * (burdenPercent / 100) * 100) / 100 : 0
        const totalAmount = amount + burdenAmount
        const { error: upsertErr } = await supabaseClient
          .from('labor_entries')
          .upsert(
            {
              project_id: projectId,
              actuals_id: actualsId,
              user_id: user.id,
              organization_id: organizationId,
              entered_by: user.id,
              source_system: 'qbo',
              source_id: sourceId,
              import_batch_id: batchId,
              work_date: txnDate,
              date: txnDate + 'T12:00:00Z',
              gross_wages: amount,
              burden_amount: burdenAmount,
              amount: totalAmount,
              hours: null,
              hourly_rate: 0,
              category: 'labor',
              description: `QBO labor ${txnDate}`,
              worker_name: null,
              notes: null,
            },
            { onConflict: 'source_system,source_id' }
          )
        if (upsertErr) {
          errors.push({ sourceId, errorMessage: upsertErr.message })
          continue
        }
        rowCount++
        totalWages += amount
      }
    }

    await supabaseClient.from('labor_import_batches').insert({
      id: batchId,
      organization_id: organizationId,
      source_system: 'qbo',
      period_start: dateStart,
      period_end: dateEnd,
      account_ids_snapshot: wageAccountIds,
      row_count: rowCount,
      total_wages: totalWages,
      error_count: errors.length,
      created_by: user.id,
      status: 'completed',
    })

    for (const e of errors) {
      await supabaseClient.from('labor_import_errors').insert({
        batch_id: batchId,
        source_id: e.sourceId,
        error_message: e.errorMessage,
      })
    }

    const payload: Record<string, unknown> = {
      batchId,
      rowCount,
      totalWages,
      errorCount: errors.length,
    }
    if (rowCount === 0 && errors.length > 0) {
      payload.firstError = errors[0].errorMessage
    }
    return new Response(
      JSON.stringify(payload),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    await supabaseClient.from('labor_import_batches').insert({
      id: batchId,
      organization_id: organizationId,
      source_system: 'qbo',
      period_start: dateStart,
      period_end: dateEnd,
      account_ids_snapshot: wageAccountIds,
      row_count: 0,
      total_wages: 0,
      error_count: 0,
      created_by: user.id,
      status: 'failed',
    })
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
