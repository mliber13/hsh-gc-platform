/**
 *   SCAN_PAYLOAD_PATH=scripts/.v2-v3-scan-payload.json npx vitest run scripts/scan-v2-v3-per-trade.harness.test.ts
 *   node scripts/scan-v2-v3-per-trade.mjs [payload.json]
 */
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { parseOrgDrywallCatalogs } from '../src/lib/drywall/catalogUtils'
import {
  printScanReport,
  scanProject,
  type ScanProjectInput,
} from './lib/scanV2V3PerTrade'

const payloadPath = process.env.SCAN_PAYLOAD_PATH

describe.skipIf(!payloadPath)('v2 vs v3 per-trade scan (read-only report)', () => {
  it('prints disagreements and scans every payload project', () => {
    const path = resolve(payloadPath as string)
    if (!existsSync(path)) {
      throw new Error(`Payload not found: ${path}`)
    }
    const payload = JSON.parse(readFileSync(path, 'utf8')) as {
      catalogsPayload: unknown
      projects: ScanProjectInput[]
    }
    expect(payload.projects.length).toBeGreaterThan(0)
    const catalogs = parseOrgDrywallCatalogs(payload.catalogsPayload)
    const results = payload.projects.map((project) => ({
      project,
      ...scanProject(project, catalogs),
    }))
    printScanReport(results)
    expect(results.length).toBe(payload.projects.length)
  })
})
