const ESC = 0x1b
const GS = 0x1d

// Map select Unicode codepoints to CP437 bytes used in receipts.
// ESC/POS printers default to CP437 (PC437 OEM-US).
const CP437: Record<number, number> = {
  0x2500: 0xc4, // ─  BOX DRAWINGS LIGHT HORIZONTAL
  0x2550: 0xcd, // ═  BOX DRAWINGS DOUBLE HORIZONTAL
  0x2502: 0xb3 //  │  BOX DRAWINGS LIGHT VERTICAL
}

/**
 * Characters this encoder had to give up on, most recently.
 *
 * M11: anything non-ASCII became `0x3f`, so a product, business or footer name
 * in Sinhala or Tamil printed as `????????` — on a dispensing record. Silently.
 *
 * True Sinhala/Tamil printing needs the receipt rendered to a bitmap and sent in
 * graphics mode, which needs a bundled font and cannot be verified without the
 * printer in hand — see the QA report. What is fixed here is the *silence*:
 * Latin text with diacritics now degrades to readable ASCII instead of question
 * marks, and anything genuinely unrepresentable is recorded so the caller can
 * warn the operator before it reaches a customer.
 */
let lastUnsupported = new Set<string>()

export function unsupportedCharacters(): string[] {
  return [...lastUnsupported]
}

export function resetUnsupportedCharacters(): void {
  lastUnsupported = new Set<string>()
}

/**
 * Latin letters with diacritics, folded to their base letter.
 *
 * `Ā` printing as `?` loses the whole word; printing as `A` loses an accent. On a
 * medicine label the second is plainly better.
 */
function foldToAscii(char: string): string | null {
  const decomposed = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (decomposed !== char && /^[\x20-\x7e]+$/.test(decomposed)) return decomposed
  const SPECIALS: Record<string, string> = {
    Æ: 'AE',
    æ: 'ae',
    Œ: 'OE',
    œ: 'oe',
    ß: 'ss',
    Ø: 'O',
    ø: 'o',
    Ð: 'D',
    ð: 'd',
    Þ: 'Th',
    þ: 'th',
    Ł: 'L',
    ł: 'l',
    '–': '-',
    '—': '-',
    '‑': '-',
    '‘': "'",
    '’': "'",
    '“': '"',
    '”': '"',
    '…': '...',
    '\u00a0': ' ',
    '€': 'EUR',
    '£': 'GBP',
    '×': 'x',
    '·': '.'
  }
  return SPECIALS[char] ?? null
}

function encodeText(t: string): number[] {
  const bytes: number[] = []
  for (const char of t) {
    const code = char.codePointAt(0) ?? 0
    if (code < 0x80) {
      bytes.push(code)
      continue
    }
    const mapped = CP437[code]
    if (mapped !== undefined) {
      bytes.push(mapped)
      continue
    }
    const folded = foldToAscii(char)
    if (folded !== null) {
      for (const c of folded) bytes.push(c.charCodeAt(0))
      continue
    }
    // Genuinely unrepresentable on a CP437 printer. Record it so the operator can
    // be told, rather than discovering it on a customer's receipt.
    lastUnsupported.add(char)
    bytes.push(0x3f)
  }
  return bytes
}

export class EscPosBuilder {
  private buf: number[]

  constructor() {
    // ESC @ — initialize printer (reset all settings)
    this.buf = [ESC, 0x40]
  }

  /** ESC a n — justification: LT=0, CT=1, RT=2 */
  align(a: 'LT' | 'CT' | 'RT'): this {
    this.buf.push(ESC, 0x61, a === 'CT' ? 1 : a === 'RT' ? 2 : 0)
    return this
  }

  /** ESC E n — emphasized (bold): 1=on, 0=off */
  bold(on: boolean): this {
    this.buf.push(ESC, 0x45, on ? 1 : 0)
    return this
  }

  /**
   * GS ! n — character size.
   * w and h must be 1 (normal) or 2 (double).
   * n = ((w-1) << 4) | (h-1)
   */
  size(w: 1 | 2, h: 1 | 2): this {
    this.buf.push(GS, 0x21, ((w - 1) << 4) | (h - 1))
    return this
  }

  /** Append text encoded to CP437 bytes. Use \n for line feed. */
  text(t: string): this {
    this.buf.push(...encodeText(t))
    return this
  }

  /** ESC d n — feed n lines */
  feed(n: number): this {
    this.buf.push(ESC, 0x64, n)
    return this
  }

  /** GS V 0 — full paper cut */
  cut(): this {
    this.buf.push(GS, 0x56, 0x00)
    return this
  }

  /**
   * ESC p m t1 t2 — open cash drawer.
   * pin 2 → m=0, pin 5 → m=1.
   * t1/t2 are pulse timings (ms units of 2ms each).
   */
  cashdraw(pin: 2 | 5 = 2): this {
    this.buf.push(ESC, 0x70, pin === 2 ? 0 : 1, 60, 120)
    return this
  }

  build(): Buffer {
    return Buffer.from(this.buf)
  }
}
