/**
 * Reed-Solomon RS(15,11) teaching implementation over GF(256).
 * Four parity symbols (generator roots alpha^0..alpha^3) correct up to
 * two unknown symbol errors. Codewords are systematic: 11 data + 4 parity.
 */
const EXP = new Uint8Array(512);
const LOG = new Int16Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const mul = (a, b) => (!a || !b ? 0 : EXP[LOG[a] + LOG[b]]);
const div = (a, b) => {
  if (!b) throw new Error('Division by zero in GF(256).');
  return !a ? 0 : EXP[(LOG[a] - LOG[b] + 255) % 255];
};
const alpha = n => EXP[((n % 255) + 255) % 255];
const evalPoly = (poly, x) => poly.reduce((v, c) => mul(v, x) ^ c, 0);

function generator() {
  let g = [1];
  for (let i = 0; i < 4; i++) {
    const next = Array(g.length + 1).fill(0);
    g.forEach((v, j) => { next[j] ^= v; next[j + 1] ^= mul(v, alpha(i)); });
    g = next;
  }
  return g;
}
const GEN = generator();

export function encodeRS1511(data) {
  const bytes = Array.from(data || []);
  if (bytes.length !== 11 || bytes.some(x => !Number.isInteger(x) || x < 0 || x > 255))
    throw new Error('RS(15,11) requires exactly 11 bytes (0–255).');
  const work = bytes.concat([0, 0, 0, 0]);
  for (let i = 0; i < 11; i++) {
    const lead = work[i];
    if (lead) for (let j = 0; j < GEN.length; j++) work[i + j] ^= mul(GEN[j], lead);
  }
  return bytes.concat(work.slice(11));
}

export function decodeRS1511(received) {
  const code = Array.from(received || []);
  if (code.length !== 15 || code.some(x => !Number.isInteger(x) || x < 0 || x > 255))
    throw new Error('RS(15,11) requires exactly 15 bytes (0–255).');
  const syndromes = [0, 1, 2, 3].map(i => evalPoly(code, alpha(i)));
  if (syndromes.every(x => x === 0))
    return { status: 'No symbol errors detected', corrected: code, data: code.slice(0, 11), positions: [], syndromes };

  // For up to two errors, solve their magnitudes for each candidate location
  // and verify against all four syndromes before accepting a correction.
  for (let p = 0; p < 15; p++) {
    const X = alpha(14 - p);
    const magnitude = syndromes[0];
    if (magnitude && [0,1,2,3].every(k => mul(magnitude, alpha(k * (14 - p))) === syndromes[k])) {
      const fixed = code.slice(); fixed[p] ^= magnitude;
      return { status: 'One symbol error corrected', corrected: fixed, data: fixed.slice(0, 11), positions: [p], syndromes };
    }
  }
  for (let p = 0; p < 15; p++) for (let q = p + 1; q < 15; q++) {
    const X = alpha(14 - p), Y = alpha(14 - q);
    const denominator = X ^ Y;
    const a = div(syndromes[1] ^ mul(syndromes[0], Y), denominator);
    const b = syndromes[0] ^ a;
    if (!a || !b) continue;
    const valid = [0,1,2,3].every(k =>
      (mul(a, alpha(k * (14 - p))) ^ mul(b, alpha(k * (14 - q)))) === syndromes[k]
    );
    if (valid) {
      const fixed = code.slice(); fixed[p] ^= a; fixed[q] ^= b;
      return { status: 'Two symbol errors corrected', corrected: fixed, data: fixed.slice(0, 11), positions: [p, q], syndromes };
    }
  }
  return { status: 'More than two errors or an uncorrectable pattern', corrected: code, data: code.slice(0, 11), positions: [], syndromes };
}
