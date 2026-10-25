/**
 * bytes, hex, bits and UTF-8 helpers
 *
 * Converts between text, bytes (arrays of numbers 0-255), hexadecimal and bit strings, and
 * reads/writes 16- and 32-bit big-endian numbers (network byte order: most significant byte first).
 * These are pure functions: they take values and return values and never touch the DOM.
 *
 * Imports:
 *   - ./state.js (shared in-memory state): S
 *
 * Exports: be16, be32, bin8, bitsOf, bytesOf, dec, enc, hex, hexs, msgBytes, parseHex, rd16, rd32
 *
 * Used by: 24 files (core/ x1, lab/ x5, modules/ x11, simulations/ x7)
 */

import { S } from './state.js';

/**
 * One byte as two hexadecimal digits.
 *
 * @param {number} b - 0..255.
 * @returns {string} e.g. 10 -> "0a".
 */
export const hex = b => b.toString(16).padStart(2, '0');

/**
 * One byte as eight binary digits.
 *
 * @param {number} b - 0..255.
 * @returns {string} e.g. 5 -> "00000101".
 */
export const bin8 = b => b.toString(2).padStart(8, '0');

/**
 * A byte array as hex text.
 *
 * @param {number[]} a
 * @param {string} [sep=' '] - separator between bytes.
 */
export const hexs = (a, sep = ' ') => a.map(hex).join(sep);

/**
 * Shared UTF-8 encoder: text -> Uint8Array.
 *
 * UTF-8 stores each character as 1 to 4 bytes. ASCII characters take one byte, so UTF-8 text that is plain English is identical to ASCII.
 */
export const enc = new TextEncoder();

/**
 * Shared UTF-8 decoder: bytes -> text.
 *
 * Invalid or cut-off byte sequences decode to the replacement character U+FFFD.
 */
export const dec = new TextDecoder();

/**
 * Text -> array of UTF-8 bytes.
 *
 * @param {string} s
 * @returns {number[]}
 */
export const bytesOf = s => Array.from(enc.encode(s));

/**
 * 16-bit number -> two bytes, big-endian.
 *
 * Big-endian ("network byte order") puts the most significant byte first. ">> 8" moves the high byte into the low position; "& 255" keeps only the low 8 bits.
 */
export const be16 = n => [(n >> 8) & 255, n & 255];

/**
 * 32-bit number -> four bytes, big-endian.
 *
 * ">>>" is the unsigned right shift, so values above 2^31 do not turn negative.
 */
export const be32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

/**
 * Reads a big-endian 16-bit number from a byte array.
 *
 * @param {number[]} a
 * @param {number} i - index of the high byte.
 */
export const rd16 = (a, i) => (a[i] << 8) | a[i + 1];

/**
 * Reads a big-endian 32-bit number from a byte array.
 *
 * The final ">>> 0" converts the result to an unsigned number.
 */
export const rd32 = (a, i) => ((a[i] << 24) | (a[i + 1] << 16) | (a[i + 2] << 8) | a[i + 3]) >>> 0;

/**
 * Byte array -> string of 0s and 1s.
 */
export const bitsOf = a => a.map(bin8).join('');

/**
 * The current message as bytes.
 *
 * Uses S.bytes when the core lab has produced them, otherwise encodes S.msg. Other modules use this to "send the learner's own message".
 */
export const msgBytes = () => (S.bytes.length ? S.bytes : bytesOf(S.msg || 'Hello'));

/**
 * Parses text like "7e 41 0a" into bytes.
 *
 * @param {string} str - hex pairs separated by spaces or commas.
 * @returns {?number[]} the bytes, [] for empty input, or null when something is not valid hex.
 */
export function parseHex(str) {
  const t = str
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (!t.length) return [];
  if (t.some(x => !/^[0-9a-f]{1,2}$/i.test(x))) return null;
  return t.map(x => parseInt(x, 16));
}
