// Unit test for what a sale does with the customer fields typed at checkout.
//
// Run with:  npm run test:checkout-customer
//
// planCheckoutCustomer is the single decision both createSale (inside the sale
// transaction) and the till's "New customer — will be saved" notice run, so it
// is tested directly. The permission branch in particular cannot be reached
// end to end: every role that can sell can currently also create customers.

import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pharmapos-checkout-customer-test-'))
const outFile = path.join(work, 'customers.js')

// bin/esbuild is a JS shim on Windows but the native binary on macOS/Linux.
const ESBUILD = path.join(ROOT, 'node_modules/esbuild/bin/esbuild')
const esbuildIsJs = fs.readFileSync(ESBUILD).subarray(0, 2).toString() === '#!'

execFileSync(
  esbuildIsJs ? process.execPath : ESBUILD,
  [
    ...(esbuildIsJs ? [ESBUILD] : []),
    path.join(ROOT, 'src/shared/customers.ts'),
    '--bundle',
    '--platform=node',
    '--format=cjs',
    `--outfile=${outFile}`
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] }
)

const require_ = createRequire(path.join(work, 'x.js'))
const { planCheckoutCustomer, placeholderCustomerName, hasRealCustomerName, normalisePhone } =
  require_('./customers.js')

let pass = 0
const failures = []
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    pass++
    console.log(`  ok   ${name}`)
  } else {
    failures.push(name)
    console.log(`  FAIL ${name} → got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)
  }
}

const base = {
  phone: '0771234567',
  typedName: '',
  active: null,
  heldByRemoved: false,
  canCreate: true
}
const plan = (over) => planCheckoutCustomer({ ...base, ...over })

console.log('\nNo phone, no record')
check('name only', plan({ phone: null, typedName: 'Nimal' }), { kind: 'none', reason: 'no-phone' })
check('nothing typed', plan({ phone: null }), { kind: 'none', reason: 'no-phone' })

console.log('\nA new number creates the customer')
check('with a name', plan({ typedName: '  Nimal Perera ' }), {
  kind: 'create',
  name: 'Nimal Perera',
  placeholder: false
})
check('without a name gets the placeholder', plan({}), {
  kind: 'create',
  name: 'Customer 4567',
  placeholder: true
})
check(
  'an over-long name is cut to the column limit',
  plan({ typedName: 'x'.repeat(200) }).name.length,
  120
)
check('an incomplete number creates nothing', plan({ phone: '07712' }), {
  kind: 'none',
  reason: 'invalid-phone'
})

console.log('\nOnly a role with customers:create can create one')
check('not permitted', plan({ typedName: 'Nimal', canCreate: false }), {
  kind: 'none',
  reason: 'not-permitted'
})
const active = { id: 'c1', name: 'Nimal Perera', phone: '0771234567' }
check(
  'but linking an existing customer still works',
  plan({ active, canCreate: false }).kind,
  'link'
)

console.log('\nAn existing customer is linked, and a real name is never overwritten')
check('different name typed', plan({ active, typedName: 'Someone Else' }), {
  kind: 'link',
  customerId: 'c1',
  displayName: 'Nimal Perera',
  fillName: null
})
const unnamed = { id: 'c2', name: 'Customer 4567', phone: '0771234567' }
check('placeholder name is filled in', plan({ active: unnamed, typedName: 'Nimal' }), {
  kind: 'link',
  customerId: 'c2',
  displayName: 'Nimal',
  fillName: 'Nimal'
})
check(
  'blank stored name is filled in',
  plan({ active: { ...unnamed, name: '  ' }, typedName: 'Nimal' }).fillName,
  'Nimal'
)
check('placeholder kept when nothing typed', plan({ active: unnamed }), {
  kind: 'link',
  customerId: 'c2',
  displayName: 'Customer 4567',
  fillName: null
})
check(
  'an old record with a non-standard number still links',
  plan({ phone: '011234', active: { id: 'c3', name: 'Old', phone: '011234' } }).kind,
  'link'
)

console.log('\nA removed customer is not revived')
check('number held by a removed customer', plan({ heldByRemoved: true, typedName: 'Nimal' }), {
  kind: 'none',
  reason: 'removed'
})

console.log('\nPlaceholder recognition is tied to the record’s own number')
check('placeholder', placeholderCustomerName('0712223333'), 'Customer 3333')
check('placeholder is not a real name', hasRealCustomerName('Customer 3333', '0712223333'), false)
check('same words for another number are', hasRealCustomerName('Customer 3333', '0771234567'), true)
check('erased placeholder text is a name', hasRealCustomerName('Erased customer', null), true)

console.log('\nNormalising is shared with the main process')
check('+94 form', normalisePhone('+94 77 123 4567'), '0771234567')
check('nine digits', normalisePhone('771234567'), '0771234567')

fs.rmSync(work, { recursive: true, force: true })

console.log(`\n${pass}/${pass + failures.length} passed`)
if (failures.length) {
  console.log('failed:\n  ' + failures.join('\n  '))
  process.exit(1)
}
