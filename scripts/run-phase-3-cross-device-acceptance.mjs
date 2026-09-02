import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const suites = [
  ['bootstrap recovery', 'run-supabase-bootstrap-acceptance.mjs'],
  ['incremental cross-device', 'run-supabase-incremental-sync-acceptance.mjs'],
  ['realtime invalidation', 'run-supabase-realtime-acceptance.mjs'],
  ['conflict convergence', 'run-supabase-conflict-resolution-acceptance.mjs'],
]

let passed = 0
let failed = 0
for (const [name, script] of suites) {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL(script, import.meta.url))],
    { stdio: 'inherit' },
  )
  if (result.status === 0) {
    passed += 1
    console.log(`cross-device suite ok - ${name}`)
  } else {
    failed += 1
    console.log(`cross-device suite not ok - ${name}`)
  }
}

console.log(
  `cross-device acceptance summary: passed=${passed} failed=${failed} skipped=0`,
)
if (failed > 0) process.exitCode = 1
