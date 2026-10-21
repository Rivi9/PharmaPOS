import { jsPDF } from 'jspdf'
import autoTable, { type CellHookData, type RowInput, type Styles } from 'jspdf-autotable'

/**
 * One look for every generated PDF (Analytics → Reports), drawn with jsPDF
 * shapes so it needs nothing from the network.
 *
 * The palette mirrors the light `:root` tokens in `styles/globals.css`, converted
 * from oklch to sRGB hex. A PDF cannot read CSS variables, so the values are
 * copied here; `tests/unit/pdf-reports.test.mjs` converts the oklch values in
 * globals.css and fails if any of these drift from them. Reports are always
 * light — they are printed, and dark mode is a screen preference.
 *
 * Fonts: the app's Inter ships only as a WOFF2 variable font
 * (@fontsource-variable/inter), which jsPDF cannot embed (it needs a static
 * TTF), and fetching one is blocked by the CSP and impossible offline. Reports
 * use jsPDF's built-in Helvetica throughout. Helvetica's digits all share one
 * advance width, so right-aligned money columns line up like tabular figures.
 */
export const PDF_COLORS = {
  primary: '#0F766E',
  primaryPressed: '#115E59',
  primaryForeground: '#FFFFFF',
  accent: '#E6F4F1',
  canvas: '#F6F8F8',
  card: '#FFFFFF',
  muted: '#EEF2F2',
  mutedForeground: '#5B6B6B',
  border: '#DDE4E4',
  foreground: '#0F1A1A',
  success: '#15803D',
  successMuted: '#DCFCE7',
  warning: '#B45309',
  warningMuted: '#FEF3C7',
  destructive: '#DC2626',
  info: '#0369A1',
  infoMuted: '#E0F2FE'
} as const

/** `--chart-1…5`, for any series drawn in a report. */
export const PDF_CHART_SERIES = ['#0F766E', '#0284C7', '#D97706', '#7C3AED', '#DB2777'] as const

export type Rgb = [number, number, number]
export type Tone = 'primary' | 'success' | 'warning' | 'destructive' | 'info' | 'neutral'

export function rgb(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** `hex` mixed toward white; `amount` 0 = unchanged, 1 = white. */
export function tint(hex: string, amount: number): Rgb {
  return rgb(hex).map((c) => Math.round(c + (255 - c) * amount)) as Rgb
}

/** Strong colour of a tone (text, bars, dots). */
export function toneColor(tone: Tone): Rgb {
  switch (tone) {
    case 'primary':
      return rgb(PDF_COLORS.primary)
    case 'success':
      return rgb(PDF_COLORS.success)
    case 'warning':
      return rgb(PDF_COLORS.warning)
    case 'destructive':
      return rgb(PDF_COLORS.destructive)
    case 'info':
      return rgb(PDF_COLORS.info)
    default:
      return rgb(PDF_COLORS.mutedForeground)
  }
}

/** Soft background of a tone, the `-muted` tokens. globals.css has no
 *  destructive tint, so that one is the destructive colour mixed toward white. */
export function toneTint(tone: Tone): Rgb {
  switch (tone) {
    case 'primary':
      return rgb(PDF_COLORS.accent)
    case 'success':
      return rgb(PDF_COLORS.successMuted)
    case 'warning':
      return rgb(PDF_COLORS.warningMuted)
    case 'destructive':
      return tint(PDF_COLORS.destructive, 0.9)
    case 'info':
      return rgb(PDF_COLORS.infoMuted)
    default:
      return rgb(PDF_COLORS.muted)
  }
}

/** Negative amounts read as a loss. */
export function signTone(n: number): Tone | undefined {
  return n < 0 ? 'destructive' : undefined
}

// ── Formatting ────────────────────────────────────────────────────────────────

export function formatMoney(n: number, sym: string): string {
  return `${sym} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Spelled out by hand rather than with toLocaleString: the till's Windows locale
// decides what that prints (and en-GB now gives "Sept"), and a report should
// read the same on every machine.
function formatDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/** `2026-10-20` → `20 Oct 2026`, read as a local calendar date. */
export function formatReportDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate ?? '')
  if (!match) return isoDate
  return formatDate(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

export function formatPeriod(start: string, end: string): string {
  return start === end
    ? formatReportDate(start)
    : `${formatReportDate(start)} – ${formatReportDate(end)}`
}

function formatGenerated(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${formatDate(date)}, ${hh}:${mm}`
}

// ── Page geometry (mm, A4 portrait) ───────────────────────────────────────────

export const PAGE = {
  marginX: 14,
  /** First y below the page-one header band. */
  contentTop: 50,
  /** First y below the running header on later pages. */
  continuedTop: 24,
  /** Keep this much clear at the bottom for the footer. */
  bottom: 20
} as const

export interface ReportMeta {
  businessName: string
  title: string
  /** e.g. `formatPeriod(start, end)` or `As of 20 Oct 2026`. */
  period: string
  generatedAt?: Date
}

function setText(doc: jsPDF, color: Rgb, size: number, style: 'normal' | 'bold' = 'normal'): void {
  doc.setTextColor(...color)
  doc.setFontSize(size)
  doc.setFont('helvetica', style)
}

/**
 * The PharmaPOS mark: a teal rounded square with lucide's outlined `Cross`, as
 * in the app header (`components/layout/Header.tsx`). `size` is the square's
 * side; the glyph and stroke keep the header's 20px-icon-in-36px proportions.
 */
export function drawBrandMark(doc: jsPDF, x: number, y: number, size: number): void {
  doc.setFillColor(...rgb(PDF_COLORS.primary))
  doc.roundedRect(x, y, size, size, size / 3, size / 3, 'F')

  const icon = size * (20 / 36)
  const unit = icon / 24
  const ox = x + (size - icon) / 2
  const oy = y + (size - icon) / 2
  // lucide Cross on its 24-unit grid: arms 6 wide, spanning 2…22.
  // prettier-ignore
  const pts: [number, number][] = [
    [9, 2], [15, 2], [15, 9], [22, 9], [22, 15], [15, 15],
    [15, 22], [9, 22], [9, 15], [2, 15], [2, 9], [9, 9]
  ]
  const deltas = pts
    .slice(1)
    .map(([px, py], i) => [(px - pts[i][0]) * unit, (py - pts[i][1]) * unit])
  doc.setDrawColor(...rgb(PDF_COLORS.primaryForeground))
  doc.setLineWidth(unit * 2)
  doc.setLineJoin('round')
  doc.lines(deltas, ox + pts[0][0] * unit, oy + pts[0][1] * unit, [1, 1], 'S', true)
  doc.setLineJoin('miter')
}

/** A rounded label, used for the report period. Right-aligned at `right`. */
function drawPill(doc: jsPDF, text: string, right: number, centerY: number): void {
  setText(doc, rgb(PDF_COLORS.primaryPressed), 8.5, 'bold')
  const w = doc.getTextWidth(text) + 7
  const h = 7
  doc.setFillColor(...rgb(PDF_COLORS.accent))
  doc.roundedRect(right - w, centerY - h / 2, w, h, h / 2, h / 2, 'F')
  doc.text(text, right - w / 2, centerY, { align: 'center', baseline: 'middle' })
}

/** Starts a report: A4 portrait with the page-one header band drawn. */
export function startReport(meta: ReportMeta): { doc: jsPDF; y: number } {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const left = PAGE.marginX
  const right = W - PAGE.marginX
  const bandH = 40

  doc.setFillColor(...rgb(PDF_COLORS.canvas))
  doc.rect(0, 0, W, bandH, 'F')
  doc.setFillColor(...rgb(PDF_COLORS.primary))
  doc.rect(0, 0, W, 1.2, 'F')
  doc.setDrawColor(...rgb(PDF_COLORS.border))
  doc.setLineWidth(0.3)
  doc.line(0, bandH, W, bandH)

  // Row 1: mark + business name, generated time on the right.
  drawBrandMark(doc, left, 8, 9)
  setText(doc, rgb(PDF_COLORS.foreground), 11.5, 'bold')
  doc.text(meta.businessName, left + 12.5, 12.5 + 0.2, { baseline: 'middle' })
  setText(doc, rgb(PDF_COLORS.mutedForeground), 7.5)
  if (meta.businessName !== 'PharmaPOS') {
    doc.text('Powered by PharmaPOS', left + 12.5, 16.4, { baseline: 'middle' })
  }
  doc.text(`Generated ${formatGenerated(meta.generatedAt ?? new Date())}`, right, 12.7, {
    align: 'right',
    baseline: 'middle'
  })

  // Row 2: report title, period on the right.
  setText(doc, rgb(PDF_COLORS.foreground), 19, 'bold')
  doc.text(meta.title, left, 31, { baseline: 'middle' })
  drawPill(doc, meta.period, right, 31)

  return { doc, y: PAGE.contentTop }
}

/**
 * Ends a report: the running header on pages 2+ and the footer (business name,
 * page numbers) on every page. Call once, after all content is drawn.
 */
export function finishReport(doc: jsPDF, meta: ReportMeta): jsPDF {
  const total = doc.getNumberOfPages()
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const left = PAGE.marginX
  const right = W - PAGE.marginX

  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setDrawColor(...rgb(PDF_COLORS.border))
    doc.setLineWidth(0.3)

    if (i > 1) {
      drawBrandMark(doc, left, 8, 6)
      setText(doc, rgb(PDF_COLORS.foreground), 9, 'bold')
      doc.text(meta.businessName, left + 8.5, 11, { baseline: 'middle' })
      setText(doc, rgb(PDF_COLORS.mutedForeground), 8)
      doc.text(`${meta.title}  ·  ${meta.period}`, right, 11, {
        align: 'right',
        baseline: 'middle'
      })
      doc.line(left, 17, right, 17)
    }

    doc.line(left, H - 13, right, H - 13)
    setText(doc, rgb(PDF_COLORS.mutedForeground), 7.5)
    doc.text(`${meta.businessName}  ·  ${meta.title}  ·  Confidential`, left, H - 8)
    setText(doc, rgb(PDF_COLORS.foreground), 7.5, 'bold')
    doc.text(`Page ${i} of ${total}`, right, H - 8, { align: 'right' })
  }
  return doc
}

/** Starts a new page when fewer than `needed` mm remain; returns the y to use. */
export function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const H = doc.internal.pageSize.getHeight()
  if (y + needed <= H - PAGE.bottom) return y
  doc.addPage()
  return PAGE.continuedTop
}

/** Section heading: a short teal bar and the label. Returns the y for content. */
export function drawSectionTitle(doc: jsPDF, label: string, y: number, caption?: string): number {
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(...rgb(PDF_COLORS.primary))
  doc.roundedRect(PAGE.marginX, y, 1.2, 5, 0.6, 0.6, 'F')
  setText(doc, rgb(PDF_COLORS.foreground), 11, 'bold')
  doc.text(label, PAGE.marginX + 3.6, y + 2.6, { baseline: 'middle' })
  if (caption) {
    setText(doc, rgb(PDF_COLORS.mutedForeground), 8)
    doc.text(caption, W - PAGE.marginX, y + 2.6, { align: 'right', baseline: 'middle' })
  }
  return y + 8
}

// ── KPI tiles ─────────────────────────────────────────────────────────────────

export interface Kpi {
  label: string
  value: string
  /** Colour of the tile's accent bar. Default primary. */
  tone?: Tone
  /** Colour the value itself (e.g. a loss in destructive). Default foreground. */
  valueTone?: Tone
}

const KPI_H = 20
const KPI_GAP = 4

/** The app's card: white, bordered, rounded, with a tone accent bar. */
function drawKpi(doc: jsPDF, kpi: Kpi, x: number, y: number, w: number): void {
  doc.setFillColor(...rgb(PDF_COLORS.card))
  doc.setDrawColor(...rgb(PDF_COLORS.border))
  doc.setLineWidth(0.3)
  doc.roundedRect(x, y, w, KPI_H, 2.5, 2.5, 'FD')

  doc.setFillColor(...toneColor(kpi.tone ?? 'primary'))
  doc.roundedRect(x + 3.5, y + 4.5, 1.2, KPI_H - 9, 0.6, 0.6, 'F')

  const textX = x + 7.5
  const maxW = w - 11
  setText(doc, rgb(PDF_COLORS.mutedForeground), 7.5)
  doc.text(kpi.label, textX, y + 7.2, { baseline: 'middle' })

  // Shrink a long value (big money on a narrow tile) instead of overflowing.
  let size = 13
  setText(doc, kpi.valueTone ? toneColor(kpi.valueTone) : rgb(PDF_COLORS.foreground), size, 'bold')
  while (size > 8 && doc.getTextWidth(kpi.value) > maxW) {
    size -= 0.5
    doc.setFontSize(size)
  }
  doc.text(kpi.value, textX, y + 14, { baseline: 'middle' })
}

/** Lays KPI tiles out `columns` to a row. Returns the y below the last row. */
export function drawKpiGrid(doc: jsPDF, kpis: Kpi[], y: number, columns: number): number {
  const W = doc.internal.pageSize.getWidth()
  const w = (W - PAGE.marginX * 2 - KPI_GAP * (columns - 1)) / columns
  kpis.forEach((kpi, i) => {
    const col = i % columns
    const row = Math.floor(i / columns)
    drawKpi(doc, kpi, PAGE.marginX + col * (w + KPI_GAP), y + row * (KPI_H + KPI_GAP), w)
  })
  const rows = Math.ceil(kpis.length / columns)
  return y + rows * KPI_H + (rows - 1) * KPI_GAP + 8
}

// ── Callouts and bars ─────────────────────────────────────────────────────────

/** A tinted note box (info, a warning, expired stock). Returns the y below it. */
export function drawCallout(
  doc: jsPDF,
  { title, lines, tone }: { title?: string; lines: string[]; tone: Tone },
  y: number
): number {
  const W = doc.internal.pageSize.getWidth()
  const x = PAGE.marginX
  const w = W - PAGE.marginX * 2
  const textW = w - 12
  const lineH = 4

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  const wrapped = lines.flatMap((l) => doc.splitTextToSize(l, textW) as string[])
  const h = 7 + (title ? lineH + 0.5 : 0) + wrapped.length * lineH

  doc.setFillColor(...toneTint(tone))
  doc.roundedRect(x, y, w, h, 2.5, 2.5, 'F')
  doc.setFillColor(...toneColor(tone))
  doc.roundedRect(x + 3.5, y + 3.5, 1.2, h - 7, 0.6, 0.6, 'F')

  let ty = y + 3.5 + lineH / 2
  if (title) {
    setText(doc, toneColor(tone), 8.5, 'bold')
    doc.text(title, x + 8, ty, { baseline: 'middle' })
    ty += lineH + 0.5
  }
  setText(doc, rgb(PDF_COLORS.foreground), 8.5)
  for (const line of wrapped) {
    doc.text(line, x + 8, ty, { baseline: 'middle' })
    ty += lineH
  }
  return y + h + 6
}

/** A labelled horizontal meter, `ratio` 0…1. Returns the y below it. */
export function drawMeter(
  doc: jsPDF,
  { label, value, ratio, tone }: { label: string; value: string; ratio: number; tone: Tone },
  y: number
): number {
  const W = doc.internal.pageSize.getWidth()
  const w = W - PAGE.marginX * 2
  setText(doc, rgb(PDF_COLORS.mutedForeground), 8)
  doc.text(label, PAGE.marginX, y + 1.5, { baseline: 'middle' })
  setText(doc, toneColor(tone), 8.5, 'bold')
  doc.text(value, W - PAGE.marginX, y + 1.5, { align: 'right', baseline: 'middle' })

  const barY = y + 5
  doc.setFillColor(...rgb(PDF_COLORS.muted))
  doc.roundedRect(PAGE.marginX, barY, w, 3, 1.5, 1.5, 'F')
  const fill = w * Math.max(0, Math.min(ratio, 1))
  if (fill > 0) {
    doc.setFillColor(...toneColor(tone))
    doc.roundedRect(PAGE.marginX, barY, Math.max(fill, 3), 3, 1.5, 1.5, 'F')
  }
  return barY + 3 + 9
}

// ── Tables ────────────────────────────────────────────────────────────────────

export interface ReportTableOptions {
  startY: number
  head: string[]
  body: RowInput[]
  foot?: string[]
  /** Columns from this index on are numbers: right-aligned. Default 1. */
  numericFrom?: number
  fontSize?: number
  columnStyles?: Record<number, Partial<Styles>>
  /** Colour a body cell's text, e.g. a negative profit in destructive. */
  cellTone?: (rowIndex: number, columnIndex: number) => Tone | undefined
  /** Shown in place of an empty body. */
  emptyText?: string
}

/** A striped table in the app's palette. Returns the y below it. */
export function drawReportTable(doc: jsPDF, opts: ReportTableOptions): number {
  const fontSize = opts.fontSize ?? 8
  const numericFrom = opts.numericFrom ?? 1
  const empty = opts.body.length === 0 && opts.emptyText
  const body: RowInput[] = empty
    ? [
        [
          {
            content: opts.emptyText as string,
            colSpan: opts.head.length,
            styles: { halign: 'center', textColor: rgb(PDF_COLORS.mutedForeground) }
          }
        ]
      ]
    : opts.body

  autoTable(doc, {
    startY: opts.startY,
    head: [opts.head],
    body,
    foot: opts.foot ? [opts.foot] : undefined,
    theme: 'plain',
    showFoot: 'lastPage',
    styles: {
      font: 'helvetica',
      fontSize,
      textColor: rgb(PDF_COLORS.foreground),
      cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 },
      lineColor: rgb(PDF_COLORS.border),
      lineWidth: { bottom: 0.2 },
      valign: 'middle'
    },
    headStyles: {
      fillColor: rgb(PDF_COLORS.muted),
      textColor: rgb(PDF_COLORS.foreground),
      fontStyle: 'bold',
      fontSize: fontSize - 0.5,
      lineColor: rgb(PDF_COLORS.primary),
      lineWidth: { bottom: 0.5 }
    },
    alternateRowStyles: { fillColor: rgb(PDF_COLORS.canvas) },
    footStyles: {
      fillColor: rgb(PDF_COLORS.accent),
      textColor: rgb(PDF_COLORS.primaryPressed),
      fontStyle: 'bold',
      lineColor: rgb(PDF_COLORS.primary),
      lineWidth: { top: 0.5 }
    },
    columnStyles: opts.columnStyles,
    // Adjacent cell fills leave a hairline seam in most viewers where they meet;
    // a sliver of the same fill across each inner edge hides it.
    willDrawCell: ({ cell, column, table }: CellHookData) => {
      const fill = cell.styles.fillColor
      if (!Array.isArray(fill) || column.index === table.columns.length - 1) return
      doc.setFillColor(fill[0], fill[1], fill[2])
      doc.rect(cell.x + cell.width - 0.2, cell.y, 0.4, cell.height, 'F')
    },
    didParseCell: ({ cell, column, row, section }: CellHookData) => {
      if (empty && section === 'body') return
      if (column.index >= numericFrom) cell.styles.halign = 'right'
      if (section === 'body' && opts.cellTone) {
        const tone = opts.cellTone(row.index, column.index)
        if (tone) cell.styles.textColor = toneColor(tone)
      }
    },
    margin: {
      left: PAGE.marginX,
      right: PAGE.marginX,
      top: PAGE.continuedTop,
      bottom: PAGE.bottom
    }
  })

  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
}
