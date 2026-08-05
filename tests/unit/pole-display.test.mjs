// Unit test for the OCPD-LED8 pole display formatter.
//
// Run with:  npm run test:pole
//
// The pole display is the pharmacy's only customer-facing output, and it has
// exactly eight digit positions. `ESC Q A` accepts only 0-9, '-' and '.', so an
// over-long string is either truncated by the panel or ignored — either way the
// customer is shown a number that is not the price.
//
// esbuild (already present via Vite) bundles the module with `serialport` and the
// logger stubbed, so this runs on plain Node with no native modules.

import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pharmapos-pole-test-'))
const outFile = path.join(work, 'pole-display.js')

execFileSync(
  process.execPath,
  [
    path.join(ROOT, 'node_modules/esbuild/bin/esbuild'),
    path.join(ROOT, 'src/main/services/pole-display.ts'),
    '--bundle',
    '--platform=node',
    '--format=cjs',
    // Stubbed: the real serialport is a native module, and nothing here opens a port.
    '--external:serialport',
    '--external:./logging/logger',
    `--outfile=${outFile}`
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] }
)

fs.mkdirSync(path.join(work, 'logging'), { recursive: true })
fs.writeFileSync(
  path.join(work, 'logging', 'logger.js'),
  'exports.logInfo=()=>{};exports.logError=()=>{}\n'
)
fs.writeFileSync(
  path.join(work, 'node_modules_stub.js'),
  'module.exports = { SerialPort: class {} }\n'
)
// `serialport` is resolved from node_modules; point it at the stub via a local dir.
const nm = path.join(work, 'node_modules', 'serialport')
fs.mkdirSync(nm, { recursive: true })
fs.writeFileSync(
  path.join(nm, 'package.json'),
  JSON.stringify({ name: 'serialport', main: 'index.js' })
)
fs.writeFileSync(path.join(nm, 'index.js'), 'exports.SerialPort = class {}\n')

const require_ = createRequire(path.join(work, 'x.js'))
const { formatForDisplay } = require_('./pole-display.js')

let pass = 0
const failures = []
const check = (name, actual, expected) => {
  if (actual === expected) {
    pass++
    console.log(`  ok   ${name} → ${actual}`)
  } else {
    failures.push(name)
    console.log(`  FAIL ${name} → got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)
  }
}

console.log('\nAmounts that fit the eight digits')
check('0', formatForDisplay(0), '0.00')
check('25.5', formatForDisplay(25.5), '25.50')
check('1234.56', formatForDisplay(1234.56), '1234.56')
// Six digits + two decimals is exactly eight positions.
check('999999.99', formatForDisplay(999999.99), '999999.99')

console.log('\nToo long with decimals — whole rupees are still the right amount')
check('1000000 (7 digits + 2dp = 9)', formatForDisplay(1000000), '1000000')
check('12345678.99', formatForDisplay(12345678.99), '12345679')

console.log('\nToo long even without decimals — dashes, never a wrong number')
check('123456789', formatForDisplay(123456789), '--------')
check('Infinity', formatForDisplay(Infinity), '--------')
check('NaN', formatForDisplay(NaN), '--------')

console.log('\nOnly characters the panel accepts (0-9, - and .)')
for (const value of [0, 25.5, 999999.99, 1000000, 123456789, NaN]) {
  const out = formatForDisplay(value)
  check(`charset of ${value}`, /^[0-9.-]+$/.test(out), true)
  check(`digit positions of ${value} <= 8`, out.replace(/[^0-9]/g, '').length <= 8, true)
}

console.log('\nNegative change (a refund handed back) still renders')
check('-45.5', formatForDisplay(-45.5), '-45.50')

fs.rmSync(work, { recursive: true, force: true })

console.log(`\n${pass}/${pass + failures.length} passed`)
if (failures.length) {
  console.log('failed:\n  ' + failures.join('\n  '))
  process.exit(1)
}
