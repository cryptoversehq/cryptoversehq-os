/**
 * qrcode.ts — Self-contained QR Code (Model 2) encoder
 *
 * Supports:
 *  - Byte mode (handles any ASCII / UTF-8 string, including wallet addresses)
 *  - Error correction level M (15 % recovery capacity)
 *  - Versions 1–10 (up to ~154 bytes at level M)
 *  - All 8 data masks evaluated; best mask selected by penalty score
 *  - Correct Reed-Solomon ECC via GF(256) arithmetic
 *  - Returns a flat boolean[] matrix (true = dark module)
 *
 * Usage:
 *   const { matrix, size } = encodeQR('0xABCD…');
 *   // matrix[row * size + col] === true  →  dark module
 */

// ─── GF(256) arithmetic (generator polynomial x^8+x^4+x^3+x^2+1 = 0x11D) ───

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function buildGFTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
}

function gfPoly(degrees: number[]): Uint8Array {
  // Build generator polynomial for `degrees` ECC codewords
  let p = new Uint8Array([1]);
  for (let i = 0; i < degrees.length; i++) {
    const term = new Uint8Array([1, GF_EXP[i]]);
    const res  = new Uint8Array(p.length + term.length - 1);
    for (let j = 0; j < p.length; j++)
      for (let k = 0; k < term.length; k++)
        res[j + k] ^= gfMul(p[j], term[k]);
    p = res;
  }
  return p;
}

function rsEncode(data: Uint8Array, nEcc: number): Uint8Array {
  const gen = gfPoly(Array.from({ length: nEcc }, (_, i) => i));
  const msg = new Uint8Array(data.length + nEcc);
  msg.set(data);
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return msg.slice(data.length);
}

// ─── Version / capacity tables (byte mode, EC level M) ────────────────────

interface VersionInfo {
  version:   number;
  size:      number;     // modules per side = version * 4 + 17
  dataBytes: number;     // total data codewords
  eccBytes:  number;     // ECC codewords per block
  blocks:    number;     // number of blocks
}

// Hand-selected entries for versions 1-10, EC level M
const VERSION_TABLE: VersionInfo[] = [
  { version: 1,  size: 21,  dataBytes: 16,  eccBytes: 10, blocks: 1 },
  { version: 2,  size: 25,  dataBytes: 28,  eccBytes: 16, blocks: 1 },
  { version: 3,  size: 29,  dataBytes: 44,  eccBytes: 26, blocks: 1 },
  { version: 4,  size: 33,  dataBytes: 64,  eccBytes: 18, blocks: 2 },
  { version: 5,  size: 37,  dataBytes: 86,  eccBytes: 24, blocks: 2 },
  { version: 6,  size: 41,  dataBytes: 108, eccBytes: 16, blocks: 4 },
  { version: 7,  size: 45,  dataBytes: 124, eccBytes: 18, blocks: 4 },
  { version: 8,  size: 49,  dataBytes: 154, eccBytes: 22, blocks: 4 },
  { version: 9,  size: 53,  dataBytes: 182, eccBytes: 22, blocks: 5 },
  { version: 10, size: 57,  dataBytes: 216, eccBytes: 26, blocks: 5 },
];

function pickVersion(byteLength: number): VersionInfo {
  for (const v of VERSION_TABLE) {
    // 4 bits mode + 8 bits char count + 8*n data bits + 4 terminator → ceiling in bytes
    const totalBits = 4 + 8 + byteLength * 8 + 4;
    const needed    = Math.ceil(totalBits / 8);
    if (needed <= v.dataBytes) return v;
  }
  throw new Error(`QR: input too long (max ~${VERSION_TABLE[VERSION_TABLE.length - 1].dataBytes} bytes)`);
}

// ─── Bit-stream builder ────────────────────────────────────────────────────

class BitBuffer {
  private buf: number[] = [];
  private len = 0;

  append(value: number, bits: number) {
    for (let i = bits - 1; i >= 0; i--) {
      const bit = (value >>> i) & 1;
      if (this.len % 8 === 0) this.buf.push(0);
      this.buf[Math.floor(this.len / 8)] |= bit << (7 - (this.len % 8));
      this.len++;
    }
  }

  pad(targetBytes: number) {
    // Terminator
    const remaining = targetBytes * 8 - this.len;
    this.append(0, Math.min(4, remaining));
    // Byte-align
    while (this.len % 8 !== 0) this.append(0, 1);
    // Padding codewords
    const pads = [0xec, 0x11];
    let pi = 0;
    while (Math.floor(this.len / 8) < targetBytes) {
      this.append(pads[pi++ % 2], 8);
    }
  }

  bytes(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

// ─── Data encoding ────────────────────────────────────────────────────────

function encodeData(text: string, vi: VersionInfo): Uint8Array {
  const bytes = new TextEncoder().encode(text);
  const bb    = new BitBuffer();

  // Byte mode indicator
  bb.append(0b0100, 4);
  // Character count
  bb.append(bytes.length, 8);
  // Data bytes
  for (const b of bytes) bb.append(b, 8);
  // Pad to capacity
  bb.pad(vi.dataBytes);

  return bb.bytes();
}

// ─── Interleave blocks ─────────────────────────────────────────────────────

function interleave(vi: VersionInfo, dataBytes: Uint8Array): Uint8Array {
  const blockSize   = Math.floor(vi.dataBytes / vi.blocks);
  const extraBlocks = vi.dataBytes % vi.blocks;           // blocks with one extra byte

  const dataBlocks: Uint8Array[] = [];
  const eccBlocks:  Uint8Array[] = [];
  let offset = 0;

  for (let b = 0; b < vi.blocks; b++) {
    const bLen  = blockSize + (b >= vi.blocks - extraBlocks ? 1 : 0);
    const block = dataBytes.slice(offset, offset + bLen);
    dataBlocks.push(block);
    eccBlocks.push(rsEncode(block, vi.eccBytes));
    offset += bLen;
  }

  // Interleave data codewords
  const out: number[] = [];
  const maxData = Math.max(...dataBlocks.map(b => b.length));
  for (let i = 0; i < maxData; i++)
    for (const block of dataBlocks)
      if (i < block.length) out.push(block[i]);

  // Interleave ECC codewords
  for (let i = 0; i < vi.eccBytes; i++)
    for (const block of eccBlocks)
      out.push(block[i]);

  return new Uint8Array(out);
}

// ─── Matrix construction ──────────────────────────────────────────────────

function makeMatrix(size: number): Uint8Array {
  // 0 = unset, 1 = dark data, 2 = dark function, 3 = light function
  return new Uint8Array(size * size);
}

function setModule(mat: Uint8Array, size: number, r: number, c: number, dark: boolean, fn = false) {
  if (r < 0 || r >= size || c < 0 || c >= size) return;
  mat[r * size + c] = dark ? (fn ? 2 : 1) : (fn ? 3 : 0);
}

function isFn(mat: Uint8Array, size: number, r: number, c: number): boolean {
  const v = mat[r * size + c];
  return v === 2 || v === 3;
}

function isDark(mat: Uint8Array, size: number, r: number, c: number): boolean {
  return mat[r * size + c] === 1 || mat[r * size + c] === 2;
}

// Finder pattern (7×7 + separator)
function placeFinderPattern(mat: Uint8Array, size: number, row: number, col: number) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const dark =
        r === -1 || r === 7 || c === -1 || c === 7 ||
        (r >= 1 && r <= 5 && c >= 1 && c <= 5)
          ? r !== -1 && r !== 7 && c !== -1 && c !== 7
            ? (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))
            : false
          : false;
      const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const d = inOuter
        ? (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))
        : false;
      setModule(mat, size, row + r, col + c, d, true);
    }
  }
}

// Alignment pattern (5×5)
function placeAlignment(mat: Uint8Array, size: number, row: number, col: number) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const d = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
      setModule(mat, size, row + r, col + c, d, true);
    }
  }
}

// Alignment pattern centre positions for versions 2-10
const ALIGN_POS: Record<number, number[]> = {
  2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

function placeAlignments(mat: Uint8Array, size: number, version: number) {
  const pos = ALIGN_POS[version] ?? [];
  for (const r of pos) {
    for (const c of pos) {
      // Skip positions that overlap finder patterns
      if ((r === 6 && c === 6) ||
          (r === 6 && c === pos[pos.length - 1]) ||
          (r === pos[pos.length - 1] && c === 6)) continue;
      placeAlignment(mat, size, r, c);
    }
  }
}

function placeTimingPatterns(mat: Uint8Array, size: number) {
  for (let i = 8; i < size - 8; i++) {
    const d = i % 2 === 0;
    setModule(mat, size, 6, i, d, true);
    setModule(mat, size, i, 6, d, true);
  }
}

function placeDarkModule(mat: Uint8Array, size: number, version: number) {
  setModule(mat, size, (4 * version) + 9, 8, true, true);
}

// Reserve format info areas (filled later)
function reserveFormatInfo(mat: Uint8Array, size: number) {
  // Around top-left finder
  for (let i = 0; i < 9; i++) {
    setModule(mat, size, i, 8, false, true);
    setModule(mat, size, 8, i, false, true);
  }
  // Top-right finder
  for (let i = size - 8; i < size; i++) setModule(mat, size, 8, i, false, true);
  // Bottom-left finder
  for (let i = size - 7; i < size; i++) setModule(mat, size, i, 8, false, true);
}

// Place data bits in the zigzag order
function placeData(mat: Uint8Array, size: number, bits: boolean[]) {
  let bitIdx = 0;
  let up     = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right--; // skip timing column

    for (let vert = 0; vert < size; vert++) {
      const row = up ? size - 1 - vert : vert;
      for (let delta = 0; delta <= 1; delta++) {
        const col = right - delta;
        if (isFn(mat, size, row, col)) continue;
        const bit = bitIdx < bits.length ? bits[bitIdx++] : false;
        setModule(mat, size, row, col, bit);
      }
    }
    up = !up;
  }
}

// ─── Format info ──────────────────────────────────────────────────────────

// Format info strings (EC level M = 01) for masks 0-7, pre-calculated
// Each is a 15-bit number (5 bits format + 10 bits BCH); XOR'd with 101010000010010
const FORMAT_INFO: Record<number, number> = {
  0: 0x5412, 1: 0x5125, 2: 0x5e7c, 3: 0x5b4b,
  4: 0x45f9, 5: 0x40ce, 6: 0x4f97, 7: 0x4aa0,
};

function applyFormatInfo(mat: Uint8Array, size: number, mask: number) {
  const fmt = FORMAT_INFO[mask];

  // Top-left horizontal (bits 14..8 → cols 0..5,7,8) and vertical
  const hPos = [0, 1, 2, 3, 4, 5, 7, 8];
  const vPos = [0, 1, 2, 3, 4, 5, 7, 8];

  for (let i = 0; i < 8; i++) {
    const bit = (fmt >> (14 - i)) & 1;
    setModule(mat, size, 8, hPos[i], bit === 1, true);
    setModule(mat, size, vPos[i], 8, bit === 1, true);
  }
  // Bottom-left vertical strip (bits 6..0)
  for (let i = 0; i < 7; i++) {
    const bit = (fmt >> i) & 1;
    setModule(mat, size, size - 1 - i, 8, bit === 1, true);
  }
  // Top-right horizontal strip (bits 7..0)
  for (let i = 0; i < 8; i++) {
    const bit = (fmt >> i) & 1;
    setModule(mat, size, 8, size - 8 + i, bit === 1, true);
  }
}

// ─── Masking ──────────────────────────────────────────────────────────────

type MaskFn = (r: number, c: number) => boolean;

const MASKS: MaskFn[] = [
  (r, c) => (r + c) % 2 === 0,
  (r, _) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(mat: Uint8Array, size: number, maskFn: MaskFn): Uint8Array {
  const m = new Uint8Array(mat);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isFn(m, size, r, c)) continue;
      if (maskFn(r, c)) m[r * size + c] ^= 1; // flip dark/light
    }
  }
  return m;
}

function penalty(mat: Uint8Array, size: number): number {
  let score = 0;

  // Rule 1: 5+ consecutive same-colour modules in row/col
  for (let r = 0; r < size; r++) {
    for (let isRow of [true, false]) {
      let run = 1, prev = isDark(mat, size, isRow ? r : 0, isRow ? 0 : r);
      for (let i = 1; i < size; i++) {
        const cur = isDark(mat, size, isRow ? r : i, isRow ? i : r);
        if (cur === prev) { run++; } else { if (run >= 5) score += run - 2; run = 1; prev = cur; }
      }
      if (run >= 5) score += run - 2;
    }
  }

  // Rule 2: 2×2 blocks
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const d = isDark(mat, size, r, c);
      if (d === isDark(mat, size, r, c + 1) &&
          d === isDark(mat, size, r + 1, c) &&
          d === isDark(mat, size, r + 1, c + 1)) score += 3;
    }
  }

  // Rule 3: finder-like patterns
  const P3a = [1,0,1,1,1,0,1,0,0,0,0];
  const P3b = [0,0,0,0,1,0,1,1,1,0,1];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - 11; c++) {
      const rowMatch3a = P3a.every((b, i) => isDark(mat, size, r, c + i) === (b === 1));
      const rowMatch3b = P3b.every((b, i) => isDark(mat, size, r, c + i) === (b === 1));
      if (rowMatch3a || rowMatch3b) score += 40;
      const colMatch3a = P3a.every((b, i) => isDark(mat, size, r + i < size ? r + i : 0, c) === (b === 1));
      const colMatch3b = P3b.every((b, i) => isDark(mat, size, r + i < size ? r + i : 0, c) === (b === 1));
      if (colMatch3a || colMatch3b) score += 40;
    }
  }

  // Rule 4: proportion of dark modules
  let dark = 0;
  for (let i = 0; i < size * size; i++) if (mat[i] === 1 || mat[i] === 2) dark++;
  const pct  = (dark / (size * size)) * 100;
  const prev5 = Math.floor(pct / 5) * 5;
  const next5 = prev5 + 5;
  score += Math.min(Math.abs(prev5 - 50), Math.abs(next5 - 50)) * 2;

  return score;
}

// ─── Public API ───────────────────────────────────────────────────────────

export interface QRResult {
  /** Flat boolean array: true = dark module. Index = row * size + col */
  matrix: boolean[];
  /** Side length in modules */
  size: number;
}

/**
 * Encode a string as a QR code (byte mode, EC level M).
 * Returns the module matrix and side length.
 */
export function encodeQR(text: string): QRResult {
  const vi = pickVersion(new TextEncoder().encode(text).length);

  // 1. Build data codewords
  const dataBytes  = encodeData(text, vi);
  const allBytes   = interleave(vi, dataBytes);

  // 2. Convert to bit array
  const bits: boolean[] = [];
  for (const byte of allBytes)
    for (let i = 7; i >= 0; i--)
      bits.push(((byte >> i) & 1) === 1);
  // Remainder bits (versions 2-6 need 7 extra 0 bits; others 0)
  const remainderBits: Record<number, number> = {2:7,3:7,4:7,5:7,6:7};
  const extra = remainderBits[vi.version] ?? 0;
  for (let i = 0; i < extra; i++) bits.push(false);

  // 3. Build base matrix (function patterns only)
  const { size, version } = vi;
  const base = makeMatrix(size);

  placeFinderPattern(base, size, 0, 0);
  placeFinderPattern(base, size, 0, size - 7);
  placeFinderPattern(base, size, size - 7, 0);
  placeTimingPatterns(base, size);
  placeAlignments(base, size, version);
  placeDarkModule(base, size, version);
  reserveFormatInfo(base, size);
  placeData(base, size, bits);

  // 4. Evaluate all 8 masks; pick best
  let bestMask  = 0;
  let bestScore = Infinity;
  let bestMat   = base;

  for (let m = 0; m < 8; m++) {
    const masked = applyMask(base, size, MASKS[m]);
    const score  = penalty(masked, size);
    if (score < bestScore) { bestScore = score; bestMask = m; bestMat = masked; }
  }

  // 5. Write format information
  applyFormatInfo(bestMat, size, bestMask);

  // 6. Convert to boolean[]
  const matrix: boolean[] = [];
  for (let i = 0; i < size * size; i++) {
    matrix.push(bestMat[i] === 1 || bestMat[i] === 2);
  }

  return { matrix, size };
}

/**
 * Render a QR code as an SVG string.
 * @param text    Content to encode
 * @param px      Pixel size per module (default 8)
 * @param fg      Foreground colour (default '#000')
 * @param bg      Background colour (default '#fff')
 */
export function qrToSVG(text: string, px = 8, fg = '#000', bg = '#fff'): string {
  const { matrix, size } = encodeQR(text);
  const dim = size * px;
  const rects: string[] = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r * size + c]) {
        rects.push(`<rect x="${c * px}" y="${r * px}" width="${px}" height="${px}" fill="${fg}"/>`);
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" ` +
    `viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">` +
    `<rect width="${dim}" height="${dim}" fill="${bg}"/>` +
    rects.join('') +
    `</svg>`
  );
}
