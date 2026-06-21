/* ============================================================================
   qrEncoder.js — dependency-free QR Code encoder (byte mode, versions 1–10).
   Used as an OFFLINE FALLBACK by <ClubQR/>. When the 'qrcode' npm package is
   installed it is preferred (proven to scan); this kicks in only if it's absent.
   Produces a boolean matrix (true = dark module). EC level M by default.
   ============================================================================ */
/* Minimal QR Code encoder — byte mode, supports versions 1..10, EC level M/L.
   Produces a boolean matrix. No dependencies. Adapted to a compact form for
   embedding in a single-file React app. */

// @ts-nocheck

// ---- Galois field tables for Reed-Solomon ----
const GF_EXP = new Array(512);
const GF_LOG = new Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();
function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}
function rsGenPoly(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], GF_EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}
function rsEncode(data, ecLen) {
  const gen = rsGenPoly(ecLen);
  const res = new Array(ecLen).fill(0);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    res.shift();
    res.push(0);
    if (factor !== 0)
      for (let j = 0; j < gen.length; j++) res[j] ^= gfMul(gen[j], factor);
  }
  return res;
}

// ---- Capacity tables (byte mode) for versions 1..10 ----
// [version] -> { L: capacityBytes, M: capacityBytes }
// total codewords and EC per block from the QR spec.
const VERSION_INFO = {
  // ver: { size, align, ecc: { L:[ecPerBlock, [ [numBlocks, dataPerBlock], ...] ], M:[...] } }
  1: { ecc: { L: [7, [[1, 19]]], M: [10, [[1, 16]]] } },
  2: { ecc: { L: [10, [[1, 34]]], M: [16, [[1, 28]]] } },
  3: { ecc: { L: [15, [[1, 55]]], M: [26, [[1, 44]]] } },
  4: { ecc: { L: [20, [[1, 80]]], M: [18, [[2, 32]]] } },
  5: { ecc: { L: [26, [[1, 108]]], M: [24, [[2, 43]]] } },
  6: { ecc: { L: [18, [[2, 68]]], M: [16, [[4, 27]]] } },
  7: { ecc: { L: [20, [[2, 78]]], M: [18, [[4, 31]]] } },
  8: {
    ecc: {
      L: [24, [[2, 97]]],
      M: [
        22,
        [
          [2, 38],
          [2, 39],
        ],
      ],
    },
  },
  9: {
    ecc: {
      L: [30, [[2, 116]]],
      M: [
        22,
        [
          [3, 36],
          [2, 37],
        ],
      ],
    },
  },
  10: {
    ecc: {
      L: [
        18,
        [
          [2, 68],
          [2, 69],
        ],
      ],
      M: [
        26,
        [
          [4, 43],
          [1, 44],
        ],
      ],
    },
  },
};

function versionSize(v) {
  return 17 + v * 4;
}

function dataCapacityBytes(v, ecLevel) {
  const [, blocks] = VERSION_INFO[v].ecc[ecLevel];
  return blocks.reduce((s, [n, d]) => s + n * d, 0);
}

function chooseVersion(byteLen, ecLevel) {
  for (let v = 1; v <= 10; v++) {
    // overhead: mode(4) + count(8 or 16) bits → bytes; cap counts bits
    const countBits = v <= 9 ? 8 : 16;
    const capBytes = dataCapacityBytes(v, ecLevel);
    const neededBits = 4 + countBits + byteLen * 8;
    if (Math.ceil(neededBits / 8) <= capBytes) return v;
  }
  throw new Error("Data too long for QR v1-10");
}

// ---- Bit buffer ----
function makeBits() {
  const bits = [];
  return {
    put(val, len) {
      for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    },
    bits,
  };
}

function encodeData(str, v, ecLevel) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 128) bytes.push(c);
    else {
      // basic UTF-8 for non-ASCII (rare in links)
      if (c < 0x800) {
        bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      } else {
        bytes.push(
          0xe0 | (c >> 12),
          0x80 | ((c >> 6) & 0x3f),
          0x80 | (c & 0x3f)
        );
      }
    }
  }
  const countBits = v <= 9 ? 8 : 16;
  const bb = makeBits();
  bb.put(0b0100, 4); // byte mode
  bb.put(bytes.length, countBits);
  for (const b of bytes) bb.put(b, 8);

  const capBytes = dataCapacityBytes(v, ecLevel);
  const capBits = capBytes * 8;
  // terminator
  let term = Math.min(4, capBits - bb.bits.length);
  bb.put(0, term);
  // pad to byte
  while (bb.bits.length % 8 !== 0) bb.bits.push(0);
  // pad bytes
  const padBytes = [0xec, 0x11];
  let pi = 0;
  const dataCodewords = [];
  for (let i = 0; i < bb.bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bb.bits[i + j];
    dataCodewords.push(byte);
  }
  while (dataCodewords.length < capBytes)
    dataCodewords.push(padBytes[pi++ % 2]);
  return dataCodewords;
}

function buildFinalCodewords(dataCodewords, v, ecLevel) {
  const [ecPerBlock, blockSpec] = VERSION_INFO[v].ecc[ecLevel];
  const blocks = [];
  let idx = 0;
  for (const [count, dataLen] of blockSpec) {
    for (let i = 0; i < count; i++) {
      const data = dataCodewords.slice(idx, idx + dataLen);
      idx += dataLen;
      const ec = rsEncode(data, ecPerBlock);
      blocks.push({ data, ec });
    }
  }
  // interleave data
  const result = [];
  const maxData = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxData; i++)
    for (const b of blocks) if (i < b.data.length) result.push(b.data[i]);
  const maxEc = Math.max(...blocks.map((b) => b.ec.length));
  for (let i = 0; i < maxEc; i++)
    for (const b of blocks) if (i < b.ec.length) result.push(b.ec[i]);
  return result;
}

// ---- Matrix placement ----
function newMatrix(size) {
  const m = [];
  for (let i = 0; i < size; i++) m.push(new Array(size).fill(null));
  return m;
}
function placeFinder(m, r, c) {
  for (let i = -1; i <= 7; i++)
    for (let j = -1; j <= 7; j++) {
      const rr = r + i,
        cc = c + j;
      if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;
      const inRing =
        i >= 0 && i <= 6 && j >= 0 && j <= 6
          ? i === 0 || i === 6 || j === 0 || j === 6
          : false;
      const inCenter = i >= 2 && i <= 4 && j >= 2 && j <= 4;
      m[rr][cc] = inRing || inCenter ? 1 : 0;
    }
}
function placeAlignment(m, v) {
  // alignment pattern centers for v2..10 (single extra pattern)
  const POS = {
    1: [],
    2: [6, 18],
    3: [6, 22],
    4: [6, 26],
    5: [6, 30],
    6: [6, 34],
    7: [6, 22, 38],
    8: [6, 24, 42],
    9: [6, 26, 46],
    10: [6, 28, 50],
  }[v];
  if (!POS) return;
  for (const r of POS)
    for (const c of POS) {
      // skip if overlapping finders
      if (
        (r <= 8 && c <= 8) ||
        (r <= 8 && c >= m.length - 9) ||
        (r >= m.length - 9 && c <= 8)
      )
        continue;
      for (let i = -2; i <= 2; i++)
        for (let j = -2; j <= 2; j++) {
          const ring =
            i === -2 || i === 2 || j === -2 || j === 2 || (i === 0 && j === 0);
          m[r + i][c + j] = ring ? 1 : 0;
        }
    }
}
function placeTiming(m) {
  for (let i = 8; i < m.length - 8; i++) {
    if (m[6][i] === null) m[6][i] = i % 2 === 0 ? 1 : 0;
    if (m[i][6] === null) m[i][6] = i % 2 === 0 ? 1 : 0;
  }
}
function reserveFormat(m) {
  const size = m.length;
  for (let i = 0; i < 9; i++) {
    if (m[8][i] === null) m[8][i] = 2; // reserved marker
    if (m[i][8] === null) m[i][8] = 2;
  }
  for (let i = 0; i < 8; i++) {
    if (m[8][size - 1 - i] === null) m[8][size - 1 - i] = 2;
    if (m[size - 1 - i][8] === null) m[size - 1 - i][8] = 2;
  }
  m[size - 8][8] = 1; // dark module
}

function placeData(m, codewords) {
  const size = m.length;
  const bits = [];
  for (const cw of codewords)
    for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
  let bitIdx = 0;
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // skip timing column
    for (let i = 0; i < size; i++) {
      const row = up ? size - 1 - i : i;
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (m[row][cc] === null) {
          m[row][cc] = bitIdx < bits.length ? bits[bitIdx] : 0;
          bitIdx++;
        }
      }
    }
    up = !up;
  }
}

function applyMask(m, maskIdx) {
  const size = m.length;
  const masked = m.map((row) => row.slice());
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      if (m[r][c] === 2) continue; // reserved (set later)
      // only mask data/ec region — but finders/timing are fixed; we track via a function region map
      if (isFunction(m, r, c, size)) continue;
      let mask;
      switch (maskIdx) {
        case 0:
          mask = (r + c) % 2 === 0;
          break;
        case 1:
          mask = r % 2 === 0;
          break;
        case 2:
          mask = c % 3 === 0;
          break;
        case 3:
          mask = (r + c) % 3 === 0;
          break;
        case 4:
          mask = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
          break;
        case 5:
          mask = ((r * c) % 2) + ((r * c) % 3) === 0;
          break;
        case 6:
          mask = (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
          break;
        case 7:
          mask = (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
          break;
      }
      if (mask) masked[r][c] ^= 1;
    }
  return masked;
}

// Determine if a cell belongs to a function pattern (finders/timing/align/format/dark).
// We mark function cells by reconstructing their positions.
let FUNC_MAP = null;
function buildFuncMap(v) {
  const size = versionSize(v);
  const fm = newMatrix(size).map((r) => r.map(() => false));
  const mark = (r, c) => {
    if (r >= 0 && c >= 0 && r < size && c < size) fm[r][c] = true;
  };
  // finders + separators
  const corners = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];
  for (const [br, bc] of corners)
    for (let i = -1; i <= 7; i++)
      for (let j = -1; j <= 7; j++) mark(br + i, bc + j);
  // timing
  for (let i = 0; i < size; i++) {
    mark(6, i);
    mark(i, 6);
  }
  // format
  for (let i = 0; i < 9; i++) {
    mark(8, i);
    mark(i, 8);
  }
  for (let i = 0; i < 8; i++) {
    mark(8, size - 1 - i);
    mark(size - 1 - i, 8);
  }
  // alignment
  const POS = {
    1: [],
    2: [6, 18],
    3: [6, 22],
    4: [6, 26],
    5: [6, 30],
    6: [6, 34],
    7: [6, 22, 38],
    8: [6, 24, 42],
    9: [6, 26, 46],
    10: [6, 28, 50],
  }[v];
  if (POS)
    for (const r of POS)
      for (const c of POS) {
        if (
          (r <= 8 && c <= 8) ||
          (r <= 8 && c >= size - 9) ||
          (r >= size - 9 && c <= 8)
        )
          continue;
        for (let i = -2; i <= 2; i++)
          for (let j = -2; j <= 2; j++) mark(r + i, c + j);
      }
  return fm;
}
function isFunction(m, r, c, size) {
  return FUNC_MAP[r][c];
}

// Format info bits (EC level + mask) with BCH
const ECL_BITS = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };
function formatBits(ecLevel, maskIdx) {
  const data = (ECL_BITS[ecLevel] << 3) | maskIdx;
  let d = data << 10;
  const g = 0b10100110111;
  for (let i = 4; i >= 0; i--) if ((d >> (i + 10)) & 1) d ^= g << i;
  let bits = ((data << 10) | d) ^ 0b101010000010010;
  return bits & 0x7fff;
}
function placeFormat(m, ecLevel, maskIdx) {
  const size = m.length;
  const bits = formatBits(ecLevel, maskIdx);
  const get = (i) => (bits >> i) & 1;
  // around top-left + split top-right/bottom-left
  const coords1 = [
    [8, 0],
    [8, 1],
    [8, 2],
    [8, 3],
    [8, 4],
    [8, 5],
    [8, 7],
    [8, 8],
    [7, 8],
    [5, 8],
    [4, 8],
    [3, 8],
    [2, 8],
    [1, 8],
    [0, 8],
  ];
  for (let i = 0; i < 15; i++) {
    const [r, c] = coords1[i];
    m[r][c] = get(i);
  }
  for (let i = 0; i < 8; i++) m[size - 1 - i][8] = get(i);
  for (let i = 0; i < 7; i++) m[8][size - 7 + i] = get(8 + i);
}

function penalty(m) {
  const size = m.length;
  let p = 0;
  // rule 1: runs
  for (let r = 0; r < size; r++) {
    let run = 1;
    for (let c = 1; c < size; c++) {
      if (m[r][c] === m[r][c - 1]) {
        run++;
        if (run === 5) p += 3;
        else if (run > 5) p += 1;
      } else run = 1;
    }
  }
  for (let c = 0; c < size; c++) {
    let run = 1;
    for (let r = 1; r < size; r++) {
      if (m[r][c] === m[r - 1][c]) {
        run++;
        if (run === 5) p += 3;
        else if (run > 5) p += 1;
      } else run = 1;
    }
  }
  return p;
}

function generateQR(text, ecLevel = "M") {
  const byteLen = (() => {
    let n = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      n += c < 128 ? 1 : c < 0x800 ? 2 : 3;
    }
    return n;
  })();
  const v = chooseVersion(byteLen, ecLevel);
  const size = versionSize(v);
  FUNC_MAP = buildFuncMap(v);

  const dataCw = encodeData(text, v, ecLevel);
  const finalCw = buildFinalCodewords(dataCw, v, ecLevel);

  const base = newMatrix(size);
  placeFinder(base, 0, 0);
  placeFinder(base, 0, size - 7);
  placeFinder(base, size - 7, 0);
  placeAlignment(base, v);
  placeTiming(base);
  // separators (white) around finders
  const clearSep = (br, bc) => {
    for (let i = -1; i <= 7; i++)
      for (let j = -1; j <= 7; j++) {
        const rr = br + i,
          cc = bc + j;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        if (base[rr][cc] === null) base[rr][cc] = 0;
      }
  };
  clearSep(0, 0);
  clearSep(0, size - 7);
  clearSep(size - 7, 0);
  reserveFormat(base);
  placeData(base, finalCw);

  // try all masks, pick lowest penalty
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const cand = applyMask(base, mask);
    placeFormat(cand, ecLevel, mask);
    // normalize reserved 2s to 0
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) if (cand[r][c] === 2) cand[r][c] = 0;
    const pen = penalty(cand);
    if (!best || pen < best.pen) best = { matrix: cand, pen, mask };
  }
  return best.matrix.map((row) => row.map((x) => x === 1));
}

export { generateQR };
