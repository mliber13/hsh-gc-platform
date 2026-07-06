import { describe, expect, it } from 'vitest'

import { LABOR_TAX_RATE } from '@/lib/drywall/calculations/quantityUtils'

import { DEFAULT_DASHBOARD_TARGETS } from '@/lib/drywall/dashboardTargets'

import { computeEstimatedLabor, emptyEstimatedLaborBreakdown } from './estimatedLabor'

import type { DrywallQuote, DrywallQuoteV3 } from '@/types/drywall'

import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'



function v2QuoteWithCalculations(

  calculations: Record<string, number>,

  burdenFlags: Partial<

    Pick<

      DrywallQuote,

      'hangerIncludeLaborBurden' | 'finisherIncludeLaborBurden' | 'prepCleanIncludeLaborBurden'

    >

  > = {},

): DrywallQuote {

  return {

    version: 2,

    calculations,

    ...burdenFlags,

  } as DrywallQuote

}



const catalogs: OrgDrywallCatalogs = {

  boards: [],

  finish_scopes: [

    {

      id: 'level_4',

      display_name: 'Level 4',

      applies_to_locations: ['wall', 'ceiling'],

      finisher_rate: 0.5,

      accessories_applied: {

        joint_compound: true,

        tape: true,

        screws: true,

        corner_bead: true,

      },

      payroll_piece_key: 'level_4',

    },

  ],

  accessories: [],

  rc_channel: [],

  suspended_grid: [],

  insulation: [],

  acoustic: [],

  metal_stud: [],

  frp: [],

  marginFloorTarget: 0.3,

  poEstimatedCostPerSqft: 2.5,

  dashboardTargets: DEFAULT_DASHBOARD_TARGETS,

}



describe('computeEstimatedLabor v2', () => {

  it('reads burden-inclusive calc fields when burden is on (default)', () => {

    const suspendedWithTax = 1_000

    const quote = v2QuoteWithCalculations({

      hangerCost: 1_200,

      hangerCostWithTax: 1_500,

      finisherCost: 900,

      finisherCostWithTax: 1_125,

      prepCleanCost: 150,

      prepCleanCostWithTax: 187.5,

      rcChannelLaborCost: 250,

      insulationLaborCost: 125,

      acousticCeilingLaborCost: 0,

      metalStudLaborCost: 62.5,

      frpLaborCost: 93.75,

      suspendedGridLaborCost: suspendedWithTax,

    })



    const result = computeEstimatedLabor(quote, null)



    expect(result.hanger).toBe(1_500)

    expect(result.finisher).toBe(1_125)

    expect(result.prepClean).toBe(187.5)

    expect(result.components.find((c) => c.key === 'rc_channel_labor')?.amount).toBe(250)

    expect(result.components.find((c) => c.key === 'insulation_labor')?.amount).toBe(125)

    expect(result.components.find((c) => c.key === 'metal_stud_labor')?.amount).toBe(62.5)

    expect(result.components.find((c) => c.key === 'frp_labor')?.amount).toBe(93.75)

    expect(result.components.find((c) => c.key === 'suspended_grid_labor')?.amount).toBe(

      suspendedWithTax,

    )

    expect(result.components.find((c) => c.key === 'acoustic_labor')).toBeUndefined()

    expect(result.componentsTotal).toBeCloseTo(250 + 125 + 62.5 + 93.75 + suspendedWithTax, 5)

    expect(result.total).toBeCloseTo(1_500 + 1_125 + 187.5 + result.componentsTotal, 5)

  })



  it('uses base labor fields when burden is explicitly off', () => {

    const quote = v2QuoteWithCalculations(

      {

        hangerCost: 1_200,

        hangerCostWithTax: 1_500,

        finisherCost: 900,

        finisherCostWithTax: 1_125,

        prepCleanCost: 150,

        prepCleanCostWithTax: 187.5,

      },

      {

        hangerIncludeLaborBurden: false,

        finisherIncludeLaborBurden: false,

        prepCleanIncludeLaborBurden: false,

      },

    )



    const result = computeEstimatedLabor(quote, null)



    expect(result.hanger).toBe(1_200)

    expect(result.finisher).toBe(900)

    expect(result.prepClean).toBe(150)

  })



  it('returns zeros when v2 calculations are missing', () => {

    const result = computeEstimatedLabor(v2QuoteWithCalculations({}), null)

    expect(result).toEqual(emptyEstimatedLaborBreakdown())

  })

})



describe('computeEstimatedLabor v3', () => {

  it('includes W2 burden by default (hanger = base rate × sqft × 1.25)', () => {

    const sqft = 1_000

    const hangerRate = 0.4

    const finisherRate = 0.5

    const prepCleanRate = 0.1

    const rcLaborRate = 2



    const quote = {

      version: 3,

      prep_clean_rate: prepCleanRate,

      lineItems: [

        {

          id: 'dw-1',

          type: 'drywall',

          quantity: sqft,

          waste_pct: 0,

          catalog_id: 'board-1',

          finish_scope_id: 'level_4',

          custom_hanger_rate: hangerRate,

          custom_finisher_rate: finisherRate,

        },

        {

          id: 'rc-1',

          type: 'rc_channel',

          quantity: 100,

          catalog_id: 'rc-1',

          custom_labor_rate: rcLaborRate,

        },

      ],

    } as unknown as DrywallQuoteV3



    const result = computeEstimatedLabor(quote, catalogs)



    expect(result.hanger).toBeCloseTo(sqft * hangerRate * (1 + LABOR_TAX_RATE), 5)

    expect(result.finisher).toBeCloseTo(sqft * finisherRate * (1 + LABOR_TAX_RATE), 5)

    expect(result.prepClean).toBeCloseTo(sqft * prepCleanRate * (1 + LABOR_TAX_RATE), 5)



    const rc = result.components.find((c) => c.key === 'rc_channel_labor')

    expect(rc?.amount).toBeCloseTo(100 * rcLaborRate, 5)

    expect(rc?.label).toBe('RC Channel')



    expect(result.total).toBeCloseTo(

      sqft * hangerRate * (1 + LABOR_TAX_RATE) +

        sqft * finisherRate * (1 + LABOR_TAX_RATE) +

        sqft * prepCleanRate * (1 + LABOR_TAX_RATE) +

        100 * rcLaborRate,

      5,

    )

  })



  it('returns empty breakdown when catalogs are null', () => {

    const quote = {

      version: 3,

      prep_clean_rate: 0.1,

      lineItems: [],

    } as unknown as DrywallQuoteV3



    expect(computeEstimatedLabor(quote, null)).toEqual(emptyEstimatedLaborBreakdown())

  })



  it('uses project_hanger_rate with burden when catalog board hanger_rate is zero', () => {

    const sqft = 2_000

    const projectHangerRate = 0.35

    const catalogsWithZeroBoard: OrgDrywallCatalogs = {

      ...catalogs,

      boards: [

        {

          id: 'board-zero-hanger',

          display_name: '1/2" Board',

          hanger_rate: 0,

          material_rate: 0.5,

          default_waste_pct: 10,

        },

      ],

    }



    const quote = {

      version: 3,

      project_hanger_rate: projectHangerRate,

      prep_clean_rate: 0,

      lineItems: [

        {

          id: 'dw-1',

          type: 'drywall',

          quantity: sqft,

          waste_pct: 0,

          catalog_id: 'board-zero-hanger',

          finish_scope_id: 'level_4',

        },

      ],

    } as unknown as DrywallQuoteV3



    const result = computeEstimatedLabor(quote, catalogsWithZeroBoard)



    expect(result.hanger).toBeCloseTo(sqft * projectHangerRate * (1 + LABOR_TAX_RATE), 5)

    expect(result.hanger).toBeGreaterThan(0)

  })

})

