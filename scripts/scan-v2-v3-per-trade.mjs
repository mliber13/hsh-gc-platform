/**
 * Read-only per-trade v2 vs v3 scan.
 *
 *   node scripts/scan-v2-v3-per-trade.mjs [payload.json]
 *
 * Default payload: scripts/.v2-v3-scan-payload.json
 * (dumped via read-only MCP — do not commit live quotes).
 */
import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const payloadArg = process.argv[2]
const payloadPath = resolve(
  payloadArg || process.env.SCAN_PAYLOAD_PATH || resolve(__dirname, '.v2-v3-scan-payload.json'),
)

if (!existsSync(payloadPath)) {
  console.error(`Payload not found: ${payloadPath}`)
  console.error('Dump projects + catalogs with read-only MCP into that file, then re-run.')
  process.exit(1)
}

const result = spawnSync(
  'npm',
  ['exec', '--', 'vitest', 'run', 'scripts/scan-v2-v3-per-trade.harness.test.ts'],
  {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, SCAN_PAYLOAD_PATH: payloadPath },
  },
)
process.exit(result.status ?? 1)
