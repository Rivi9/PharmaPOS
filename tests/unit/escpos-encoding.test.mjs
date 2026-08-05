// Unit test for the ESC/POS text encoder.
//
// Run with:  npm run test:escpos
//
// A receipt is a dispensing record. Anything non-ASCII used to become `0x3f`, so
// "Ā" and a whole Sinhala product name both printed as question marks with no
// indication that anything had been lost (M11).

import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pharmapos-escpos-test-'))
const outFile = path.join(work, 'escpos.js')

execFileSync(
  process.execPath,
  [
    path.join(ROOT, 'node_modules/esbuild/bin/esbuild'),
    path.join(ROOT, 'src/main/services/printer/escpos-builder.ts'),
    '--bundle',
    '--platform=node',
    '--format=cjs',
    `--outfile=${outFile}`
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] }
)

const require_ = createRequire(path.join(work, 'x.js'))
const { EscPosBuilder, unsupportedCharacters, resetUnsupportedCharacters } = require_('./escpos.js')

let pass = 0
const failures = []
const check = (name, cond, detail) => {
  if (cond) {
    pass++
    console.log('  ok   ' + name)
  } else {
    failures.push(name)
    console.log('  FAIL ' + name + (detail ? ' — ' + detail : ''))
  }
}

/** The printable bytes a builder produced, as a string, ignoring control codes. */
function printed(text) {
  resetUnsupportedCharacters()
  const bytes = new EscPosBuilder().text(text).build()
  return Buffer.from(bytes)
    .toString('latin1')
    .replace(/[\x00-\x09\x0b-\x1f]/g, '')
}

console.log('\nASCII passes through untouched')
check('plain name', printed('Paracetamol 500mg').includes('Paracetamol 500mg'))
check('digits and punctuation', printed('Rs.1,234.50').includes('Rs.1,234.50'))

console.log('\nLatin diacritics fold to readable ASCII, not question marks')
for (const [input, expected] of [
  ['Ãcetaminophen', 'Acetaminophen'],
  ['Café', 'Cafe'],
  ['Ibuprofén', 'Ibuprofen'],
  ['Nörgaard', 'Norgaard'],
  ['Māori', 'Maori']
]) {
  const out = printed(input)
  check(`${input} → ${expected}`, out.includes(expected), `got ${JSON.stringify(out)}`)
  check(`${input} produced no '?'`, !out.includes('?'), `got ${JSON.stringify(out)}`)
}

console.log('\nCommon typography degrades sensibly')
for (const [input, expected] of [
  ['en–dash', 'en-dash'],
  ['it’s', "it's"],
  ['“quoted”', '"quoted"'],
  ['5 × 2', '5 x 2'],
  ['and…', 'and...']
]) {
  check(`${input} → ${expected}`, printed(input).includes(expected), JSON.stringify(printed(input)))
}

console.log('\nBox drawing is mapped, since the receipt layout uses it')
check('horizontal rule maps to a CP437 byte, not "?"', !printed('─────').includes('?'))

console.log('\nGenuinely unrepresentable text is reported, not silently mangled')
resetUnsupportedCharacters()
const sinhala = 'පැරසිටමෝල්'
const out = printed(sinhala)
check('still prints something rather than throwing', out.length > 0)
check(
  'reported as unsupported',
  unsupportedCharacters().length > 0,
  JSON.stringify(unsupportedCharacters())
)
check(
  'every reported character is one that was actually dropped',
  unsupportedCharacters().every((c) => sinhala.includes(c)),
  JSON.stringify(unsupportedCharacters())
)

console.log('\nThe report resets between print jobs')
resetUnsupportedCharacters()
check('clean after reset', unsupportedCharacters().length === 0)
printed('Paracetamol')
check('ASCII-only job reports nothing', unsupportedCharacters().length === 0)

fs.rmSync(work, { recursive: true, force: true })

console.log(`\n${pass}/${pass + failures.length} passed`)
if (failures.length) {
  console.log('failed:\n  ' + failures.join('\n  '))
  process.exit(1)
}
