// Unit test for the local-date helpers.
//
// Run with:  npm run test:dates
//
// M21: `new Date().toISOString().split('T')[0]` yields the UTC date. The shop
// runs at UTC+5:30, so stock received at 02:00 local was dated the previous day
// and every date-bounded report shifted its boundary by 5h30m — a monthly VAT
// return excluded 00:00–05:29 on the first and included it in the next month.

import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pharmapos-dates-test-'))
const outFile = path.join(work, 'dates.js')

execFileSync(
  process.execPath,
  [
    path.join(ROOT, 'node_modules/esbuild/bin/esbuild'),
    path.join(ROOT, 'src/shared/dates.ts'),
    '--bundle',
    '--platform=node',
    '--format=cjs',
    `--outfile=${outFile}`
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] }
)

const require_ = createRequire(path.join(work, 'x.js'))
const { localDateString, localDateOffset, daysUntil } = require_('./dates.js')

let pass = 0
const failures = []
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    pass++
    console.log(`  ok   ${name} → ${JSON.stringify(actual)}`)
  } else {
    failures.push(name)
    console.log(`  FAIL ${name} → got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)
  }
}

console.log('\nA local date is the date on the wall, not in UTC')
// 02:00 local. In any timezone ahead of UTC this is still "the 15th" locally,
// while toISOString() would report the 14th.
const earlyMorning = new Date(2026, 2, 15, 2, 0, 0)
check('02:00 on 15 March', localDateString(earlyMorning), '2026-03-15')
check('23:30 on 15 March', localDateString(new Date(2026, 2, 15, 23, 30)), '2026-03-15')
check('midnight exactly', localDateString(new Date(2026, 2, 15, 0, 0, 0)), '2026-03-15')

console.log('\nIt disagrees with the UTC form when it should')
const utcForm = earlyMorning.toISOString().split('T')[0]
const offsetMinutes = earlyMorning.getTimezoneOffset()
check(
  offsetMinutes < 0
    ? 'ahead of UTC: local date differs from the UTC date at 02:00'
    : 'at or behind UTC: the two agree at 02:00',
  localDateString(earlyMorning) !== utcForm,
  offsetMinutes < 0
)

console.log('\nZero padding, because these are compared as strings in SQL')
check('single-digit month and day', localDateString(new Date(2026, 0, 5)), '2026-01-05')

console.log('\nOffsets move whole local days, across month and year ends')
check('yesterday from 1 March', localDateOffset(-1, new Date(2026, 2, 1, 12)), '2026-02-28')
check('30 days back from 15 March', localDateOffset(-30, new Date(2026, 2, 15, 12)), '2026-02-13')
check('tomorrow from 31 December', localDateOffset(1, new Date(2026, 11, 31, 12)), '2027-01-01')
check('leap day exists in 2028', localDateOffset(-1, new Date(2028, 2, 1, 12)), '2028-02-29')

console.log('\ndaysUntil counts calendar days, so "expires today" can happen (L9)')
const noon = new Date(2026, 2, 15, 12, 0, 0)
check('today', daysUntil('2026-03-15', noon), 0)
check('tomorrow', daysUntil('2026-03-16', noon), 1)
check('yesterday', daysUntil('2026-03-14', noon), -1)
check('30 days out', daysUntil('2026-04-14', noon), 30)
// Late in the evening the answer must not slip by a day.
check('today, seen at 23:59', daysUntil('2026-03-15', new Date(2026, 2, 15, 23, 59)), 0)
check('today, seen at 00:01', daysUntil('2026-03-15', new Date(2026, 2, 15, 0, 1)), 0)
check('full ISO timestamp accepted', daysUntil('2026-03-16T00:00:00.000Z', noon), 1)
check('rubbish returns null', daysUntil('not-a-date', noon), null)
check('empty returns null', daysUntil('', noon), null)

fs.rmSync(work, { recursive: true, force: true })

console.log(`\n${pass}/${pass + failures.length} passed`)
if (failures.length) {
  console.log('failed:\n  ' + failures.join('\n  '))
  process.exit(1)
}
