// ============================================================================

// Drywall org catalogs — org_drywall_catalogs JSONB (mirror hrTeamService)

// ============================================================================



import { supabase, isOnlineMode } from '@/lib/supabase'

import { createDefaultDrywallCatalogSeeds } from '@/lib/drywall/catalogSeeds'

import {

  catalogsPayloadOnly,

  isEmptyCatalogPayload,

  parseOrgDrywallCatalogs,

  prepareOrgDrywallCatalogs,

} from '@/lib/drywall/catalogUtils'

import {

  DEFAULT_MARGIN_FLOOR_TARGET,

  DEFAULT_PO_ESTIMATED_COST_PER_SQFT,

} from '@/lib/drywall/marginFloor'

import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

import { requireUserOrgId } from './userService'



export class DrywallCatalogPermissionError extends Error {

  constructor(message = 'You do not have permission to update drywall catalogs.') {

    super(message)

    this.name = 'DrywallCatalogPermissionError'

  }

}



function isRlsOrPermissionError(error: { code?: string; message?: string }): boolean {

  const code = error.code ?? ''

  const msg = (error.message ?? '').toLowerCase()

  return (

    code === '42501' ||

    code === 'PGRST301' ||

    msg.includes('permission') ||

    msg.includes('row-level security') ||

    msg.includes('violates row-level')

  )

}



function num(v: unknown, fallback: number): number {

  const n = typeof v === 'string' ? parseFloat(v) : Number(v)

  return Number.isFinite(n) ? n : fallback

}



function mergeMarginTargets(

  catalogs: OrgDrywallCatalogs,

  row?: {

    margin_floor_target?: unknown

    po_estimated_cost_per_sqft?: unknown

  } | null,

): OrgDrywallCatalogs {

  return {

    ...catalogs,

    marginFloorTarget: num(row?.margin_floor_target, DEFAULT_MARGIN_FLOOR_TARGET),

    poEstimatedCostPerSqft: num(row?.po_estimated_cost_per_sqft, DEFAULT_PO_ESTIMATED_COST_PER_SQFT),

  }

}



/** Idempotent — inserts default seeds when no row exists for the org. */

export async function seedDrywallCatalogs(

  organizationId: string,

  catalogs?: OrgDrywallCatalogs,

): Promise<void> {

  const { data: existing, error: fetchError } = await supabase

    .from('org_drywall_catalogs')

    .select('organization_id')

    .eq('organization_id', organizationId)

    .maybeSingle()



  if (fetchError) {

    console.error('seedDrywallCatalogs fetch:', fetchError)

    throw new Error(fetchError.message || 'Failed to check drywall catalogs')

  }

  if (existing) return



  const seeded = catalogs ?? createDefaultDrywallCatalogSeeds()

  const payload = prepareOrgDrywallCatalogs(seeded)

  const now = new Date().toISOString()



  const { error: insertError } = await supabase.from('org_drywall_catalogs').insert({

    organization_id: organizationId,

    payload: catalogsPayloadOnly(payload),

    margin_floor_target: seeded.marginFloorTarget,

    po_estimated_cost_per_sqft: seeded.poEstimatedCostPerSqft,

    updated_at: now,

  })



  if (insertError) {

    console.error('seedDrywallCatalogs insert:', insertError)

    if (isRlsOrPermissionError(insertError)) throw new DrywallCatalogPermissionError()

    throw new Error(insertError.message || 'Failed to seed drywall catalogs')

  }

}



export async function fetchOrgDrywallCatalogs(): Promise<OrgDrywallCatalogs> {

  if (!isOnlineMode()) {

    throw new Error('Drywall catalogs require an online connection to Supabase.')

  }



  const organizationId = await requireUserOrgId()

  const seeds = createDefaultDrywallCatalogSeeds()



  const { data, error } = await supabase

    .from('org_drywall_catalogs')

    .select('payload, margin_floor_target, po_estimated_cost_per_sqft')

    .eq('organization_id', organizationId)

    .maybeSingle()



  if (error) {

    console.error('fetchOrgDrywallCatalogs:', error)

    throw new Error(error.message || 'Failed to load drywall catalogs')

  }



  if (!data?.payload || isEmptyCatalogPayload(data.payload)) {

    try {

      await seedDrywallCatalogs(organizationId, seeds)

    } catch (err) {

      // Seed may fail under RLS for read-only roles (e.g. crew). Fall back to in-memory

      // defaults so the UI keeps working; admins will see the seed succeed and persist.

      console.warn('seedDrywallCatalogs skipped (read-only role?):', err)

    }

    return seeds

  }



  return mergeMarginTargets(parseOrgDrywallCatalogs(data.payload), data)

}



export async function saveOrgDrywallCatalogs(catalogs: OrgDrywallCatalogs): Promise<void> {

  if (!isOnlineMode()) {

    throw new Error('Drywall catalogs require an online connection to Supabase.')

  }



  const organizationId = await requireUserOrgId()

  const payload = prepareOrgDrywallCatalogs(catalogs)

  const now = new Date().toISOString()



  const row = {

    organization_id: organizationId,

    payload: catalogsPayloadOnly(payload),

    updated_at: now,

  }



  const { error } = await supabase.from('org_drywall_catalogs').upsert(row, {

    onConflict: 'organization_id',

  })



  if (error) {

    console.error('saveOrgDrywallCatalogs:', error)

    if (isRlsOrPermissionError(error)) throw new DrywallCatalogPermissionError()

    throw new Error(error.message || 'Failed to save drywall catalogs')

  }

}



export async function updateDrywallMarginTargets(

  marginFloorTarget: number,

  poEstimatedCostPerSqft: number,

): Promise<void> {

  if (!isOnlineMode()) {

    throw new Error('Drywall catalogs require an online connection to Supabase.')

  }



  if (!Number.isFinite(marginFloorTarget) || marginFloorTarget <= 0 || marginFloorTarget > 1) {

    throw new Error('Margin floor target must be between 0 and 100%')

  }

  if (!Number.isFinite(poEstimatedCostPerSqft) || poEstimatedCostPerSqft <= 0) {

    throw new Error('PO estimated cost per sqft must be greater than 0')

  }



  const organizationId = await requireUserOrgId()

  const now = new Date().toISOString()



  const { data: existing } = await supabase

    .from('org_drywall_catalogs')

    .select('organization_id')

    .eq('organization_id', organizationId)

    .maybeSingle()



  if (!existing) {

    await seedDrywallCatalogs(organizationId)

  }



  const { error } = await supabase

    .from('org_drywall_catalogs')

    .update({

      margin_floor_target: marginFloorTarget,

      po_estimated_cost_per_sqft: poEstimatedCostPerSqft,

      updated_at: now,

    })

    .eq('organization_id', organizationId)



  if (error) {

    console.error('updateDrywallMarginTargets:', error)

    if (isRlsOrPermissionError(error)) throw new DrywallCatalogPermissionError()

    throw new Error(error.message || 'Failed to update margin targets')

  }

}

