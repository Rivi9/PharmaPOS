const ESC = 0x1b
const GS = 0x1d

// Map select Unicode codepoints to CP437 bytes used in receipts.
// ESC/POS printers default to CP437 (PC437 OEM-US).
const CP437: Record<number, number> = {
  0x2500: 0xc4, // ─  BOX DRAWINGS LIGHT HORIZONTAL
  0x2550: 0xcd, // ═  BOX DRAWINGS DOUBLE HORIZONTAL
  0x2502: 0xb3 //  │  BOX DRAWINGS LIGHT VERTICAL
}

function encodeText(t: string): number[] {
  const bytes: number[] = []
  for (const char of t) {
    const code = char.charCodeAt(0)
    if (code < 0x80) {
      bytes.push(code)
    } else {
      bytes.push(CP437[code] ?? 0x3f) // '?' for unmapped chars
    }
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
