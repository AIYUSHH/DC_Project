/**
 * error-check definitions used by the error-detection module
 *
 * Lists the four error-detection methods compared in the module (parity, Internet checksum, CRC-8,
 * CRC-32), computes all of them for a set of bytes, and formats a check value for display.
 *
 * Imports:
 *   - ../core/encoding.js (bytes, hex, bits and UTF-8 helpers): bin8, hex
 *   - ../core/checksums.js (parity-free error-detection math: Internet checksum, CRC-8, CRC-32): cksum, crc32, crc8
 *
 * Exports: ERR_METHODS, errChecks, fmtCheck
 *
 * Used by: modules/link-layer/error-detection.js
 */

import { adler32, cksum, crc16, crc32, crc32c, crc8, fletcher16 } from '../core/checksums.js';
import { bin8, hex } from '../core/encoding.js';

/**
 * The four error-detection methods compared by the module.
 */
export const ERR_METHODS = [
  { id: 'parity', name: 'Parity bit' },
  { id: 'sum', name: 'Internet checksum (16-bit)' },
  { id: 'crc8', name: 'CRC-8 (x^8+x^2+x+1)' },
  { id: 'crc32', name: 'CRC-32 (Ethernet)' },
  { id: 'crc16', name: 'CRC-16/CCITT-FALSE' },
  { id: 'crc32c', name: 'CRC-32C (Castagnoli)' },
  { id: 'fletcher16', name: 'Fletcher-16' },
  { id: 'adler32', name: 'Adler-32' },
];

/**
 * Computes every check value for a set of bytes.
 *
 * @param {number[]} bytes
 * @param {boolean} odd - use odd parity instead of even.
 * @returns {{parity:number, sum:number, crc8:number, crc32:number}}
 */
export function errChecks(bytes, odd) {
  const ones = bytes.reduce((n, b) => n + bin8(b).split('1').length - 1, 0);
  return {
    parity: (ones + (odd ? 1 : 0)) % 2,
    sum: cksum(bytes),
    crc8: crc8(bytes),
    crc32: crc32(bytes),
    crc16: crc16(bytes),
    crc32c: crc32c(bytes),
    fletcher16: fletcher16(bytes),
    adler32: adler32(bytes),
  };
}

/**
 * Formats a check value for display (parity as 0/1, others as zero-padded hex).
 */
export const fmtCheck = (id, v) =>
  id === 'parity'
    ? String(v)
    : id === 'sum'
      ? '0x' + v.toString(16).padStart(4, '0')
      : id === 'crc8'
        ? '0x' + hex(v)
        : id === 'crc16' || id === 'fletcher16'
          ? '0x' + v.toString(16).padStart(4, '0')
          : '0x' + v.toString(16).padStart(8, '0');
