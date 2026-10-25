/**
 * parity-free error-detection math: Internet checksum, CRC-8, CRC-32
 *
 * The error-detection algorithms used by the protocols in this lab. All are pure functions of a
 * byte array:
 *   - sum16 / cksum: the 16-bit ones'-complement Internet checksum (IPv4, TCP, UDP);
 *   - crc8:  the small CRC used by the core lab's packets (polynomial x^8 + x^2 + x + 1);
 *   - crc32: the CRC used by Ethernet frames (polynomial 0x04C11DB7, reflected as 0xEDB88320).
 *
 * Imports:
 *   (none)
 *
 * Exports: cksum, crc32, crc8, sum16
 *
 * Used by: 8 files (modules/ x4, simulations/ x4)
 */

/**
 * 16-bit ones'-complement sum (the core of the Internet checksum).
 *
 * Adds the data as 16-bit words (an odd final byte is padded with zero). Any carry out of bit 16 is added back in ("end-around carry"), which is what makes it a ones'-complement sum.
 * @param {number[]} a - bytes.
 * @returns {number} 0..65535.
 */
export function sum16(a) {
  let s = 0;
  // Join two bytes into one 16-bit word (high byte first). A missing last byte counts as 0x00.
  for (let i = 0; i < a.length; i += 2) s += (a[i] << 8) | (a[i + 1] || 0);
  // End-around carry: while the sum needs more than 16 bits, fold the overflow back into the low
  // 16 bits.
  while (s >> 16) s = (s & 0xffff) + (s >> 16);
  return s;
}

/**
 * Internet checksum: the bitwise complement of sum16.
 *
 * The sender stores this value; the receiver sums everything including it and expects 0xFFFF.
 */
// ~ flips all 32 bits JavaScript works with; "& 0xffff" keeps only the 16 that matter.
export const cksum = a => ~sum16(a) & 0xffff;

/**
 * CRC-8 with polynomial x^8 + x^2 + x + 1 (0x07).
 *
 * A CRC treats the data as one long binary number and keeps the remainder of a polynomial division. Each byte is XORed into the register, then the register is shifted 8 times; whenever a 1 falls off the top, the polynomial (0x07) is XORed in.
 * @param {number[]} a - bytes.
 * @returns {number} 0..255.
 */
export function crc8(a) {
  let c = 0;
  for (const b of a) {
    // Mix the next data byte into the CRC register.
    c ^= b;
    // Process the byte one bit at a time. If the top bit is 1, shift left and XOR with the
    // polynomial (0x07 = x^8+x^2+x+1 without its x^8 term); otherwise just shift. "& 255" discards
    // bits shifted out of the 8-bit register.
    for (let i = 0; i < 8; i++) c = c & 128 ? ((c << 1) ^ 7) & 255 : (c << 1) & 255;
  }
  return c;
}

/**
 * Lookup table for CRC-32: the effect of each possible byte, computed once at start-up.
 *
 * Using a table lets crc32() process one byte per step instead of eight.
 */
const CRC32T = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    // Reflected CRC: shift right, and if the bit that fell off was 1, XOR in the reflected
    // polynomial 0xEDB88320.
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

/**
 * CRC-32 as used by Ethernet, zip and PNG.
 *
 * Starts with all bits set, uses the reflected polynomial 0xEDB88320 and inverts the result. Computing it over a frame (without its FCS) and comparing with the stored FCS tells the receiver whether the frame was damaged.
 * @param {number[]} a - bytes.
 * @returns {number} unsigned 32-bit value.
 */
export function crc32(a) {
  // CRC-32 starts with all ones so that leading zero bytes still affect the result.
  let c = 0xffffffff;
  // One table lookup replaces eight bit-steps: the low byte of (register XOR data byte) picks the
  // precomputed effect, which is combined with the register shifted down one byte.
  for (const b of a) c = CRC32T[(c ^ b) & 255] ^ (c >>> 8);
  // Final inversion, then ">>> 0" so the result is an unsigned number.
  return (c ^ 0xffffffff) >>> 0;
}
