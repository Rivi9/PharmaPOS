import fs from 'fs'
import os from 'os'
import path from 'path'
import { zipSync, strToU8 } from 'fflate'

/**
 * Write a minimal one-sheet .xlsx for import tests.
 *
 * The project has an xlsx *reader* (read-excel-file) but no writer, and a binary
 * fixture would hide what each test feeds in. An .xlsx is a zip of a few XML
 * parts; fflate (already installed) zips them. Strings are inline, numbers are
 * numeric cells — the same two shapes a real supplier sheet produces.
 */
export function writeXlsx(rows: (string | number | null)[][]): string {
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const col = (i: number): string => String.fromCharCode(65 + i)
  const sheetRows = rows
    .map((cells, r) => {
      const xml = cells
        .map((v, c) => {
          const ref = `${col(c)}${r + 1}`
          if (v === null || v === '') return ''
          if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`
          return `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`
        })
        .join('')
      return `<row r="${r + 1}">${xml}</row>`
    })
    .join('')

  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`
  }

  const zipped = zipSync(
    Object.fromEntries(Object.entries(files).map(([name, xml]) => [name, strToU8(xml)]))
  )
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pharmapos-xlsx-'))
  const file = path.join(dir, 'import.xlsx')
  fs.writeFileSync(file, zipped)
  return file
}
