/**
 * IPv4/IPv6 address and CIDR calculations
 *
 * Pure address math: parsing dotted-quad IPv4 into a 32-bit number and back, subnet masks, network /
 * broadcast / host-range calculation (cidrInfo), address classification (private, loopback...), and IPv6
 * expansion and compression. IPv4 addresses are handled as unsigned 32-bit integers; the ">>> 0" you will see
 * forces JavaScript to treat the result as unsigned (bitwise operators otherwise return signed numbers).
 *
 * Imports:
 *   - ./encoding.js (bytes, hex, bits and UTF-8 helpers): be32
 *
 * Exports: b2ip, cidrInfo, classOf, compressV6, expandV6, ip2b, ip32, ip4, ipKind, mk, p4, parseCidr
 *
 * Used by: 11 files (modules/ x7, simulations/ x4)
 */

import { be32 } from './encoding.js';

/**
 * Parses a dotted IPv4 address into an unsigned 32-bit number.
 *
 * @param {string} s - e.g. "192.168.1.10".
 * @returns {?number} the address, or null if it is not four numbers 0-255.
 */
export function p4(s) {
  const a = String(s).trim().split('.');
  if (a.length !== 4 || a.some(x => !/^\d{1,3}$/.test(x) || +x > 255)) return null;
  // Pack four octets into one 32-bit number: shift each into position and OR them together. ">>>
  // 0" reinterprets the signed result as unsigned.
  return ((+a[0] << 24) | (+a[1] << 16) | (+a[2] << 8) | +a[3]) >>> 0;
}

/**
 * 32-bit number -> dotted IPv4 text.
 */
export const ip4 = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

/**
 * Subnet mask for a prefix length.
 *
 * A /24 mask has 24 one-bits followed by 8 zero-bits. Shifting all-ones left by (32 - prefix) produces it; ">>> 0" keeps it unsigned.
 * @param {number} p - prefix length 0..32.
 * @returns {number}
 */
export const mk = p => (p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0);

/**
 * IPv4 number -> 4 bytes.
 */
export const ip2b = n => be32(n);

/**
 * 4 bytes -> dotted IPv4 text.
 */
export const b2ip = (a, i = 0) => a.slice(i, i + 4).join('.');

/**
 * IPv4 number -> 32-character bit string.
 */
export const ip32 = n => (n >>> 0).toString(2).padStart(32, '0');

/**
 * Calculates everything about a network from an address and prefix length.
 *
 * Network address = address AND mask. Broadcast = network OR (NOT mask). Usable hosts exclude those two addresses, except for /31 (point-to-point, both usable) and /32 (single host).
 * @param {number} a - IPv4 address.
 * @param {number} p - prefix length.
 * @returns {{a:number,p:number,m:number,n:number,b:number,size:number,usable:number,first:number,last:number,wild:number}}
 */
export function cidrInfo(a, p) {
  // m = mask, n = network address (address AND mask), b = broadcast (network OR the inverted
  // mask).
  const m = mk(p),
    n = (a & m) >>> 0,
    b = (n | (~m >>> 0)) >>> 0,
    size = 2 ** (32 - p);
  const usable = p >= 31 ? (p === 31 ? 2 : 1) : size - 2;
  const first = p >= 31 ? n : n + 1,
    last = p >= 31 ? b : b - 1;
  return { a, p, m, n, b, size, usable, first, last, wild: ~m >>> 0 };
}

/**
 * Names the special range an IPv4 address belongs to (private, loopback, multicast...).
 */
export function ipKind(a) {
  const t = (net, p) => (a & mk(p)) >>> 0 === p4(net);
  if (t('10.0.0.0', 8) || t('172.16.0.0', 12) || t('192.168.0.0', 16)) return 'Private (RFC 1918)';
  if (t('127.0.0.0', 8)) return 'Loopback';
  if (t('169.254.0.0', 16)) return 'Link-local (APIPA)';
  if (t('100.64.0.0', 10)) return 'Carrier-grade NAT';
  if (t('224.0.0.0', 4)) return 'Multicast';
  if (t('240.0.0.0', 4)) return 'Reserved';
  if (t('192.0.2.0', 24) || t('198.51.100.0', 24) || t('203.0.113.0', 24)) return 'Documentation';
  return 'Public';
}

/**
 * Classful network class (A-E) from the leading bits. Historical, but still taught.
 */
export const classOf = a =>
  a >>> 31 === 0 ? 'A' : a >>> 30 === 2 ? 'B' : a >>> 29 === 6 ? 'C' : a >>> 28 === 14 ? 'D' : 'E';

/**
 * Parses "a.b.c.d/p" text.
 *
 * @returns {?{a:number,p:number}} or null when invalid.
 */
export function parseCidr(s) {
  const m = String(s)
    .trim()
    .match(/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/);
  if (!m) return null;
  const a = p4(m[1]),
    p = +m[2];
  return a === null || p > 32 ? null : { a, p };
}

/**
 * Expands an IPv6 address to its 8 full four-digit groups.
 *
 * "::" stands for one or more all-zero groups; the number of missing groups is 8 minus the groups written.
 * @returns {?string[]} eight 4-digit hex groups, or null if invalid.
 */
export function expandV6(s) {
  s = s.trim().toLowerCase();
  if (!/^[0-9a-f:]+$/.test(s) || (s.match(/::/g) || []).length > 1) return null;
  let parts;
  if (s.includes('::')) {
    const [l, r] = s.split('::'),
      L = l ? l.split(':') : [],
      R = r ? r.split(':') : [],
      // "::" stands for however many all-zero groups are missing to reach eight.
      miss = 8 - L.length - R.length;
    if (miss < 1) return null;
    parts = [...L, ...Array(miss).fill('0'), ...R];
  } else parts = s.split(':');
  if (parts.length !== 8 || parts.some(x => !/^[0-9a-f]{1,4}$/.test(x))) return null;
  return parts.map(x => x.padStart(4, '0'));
}

/**
 * Writes IPv6 groups in shortest form.
 *
 * Drops leading zeros in each group and replaces the longest run (two or more) of zero groups with "::".
 */
export const compressV6 = g => {
  const a = g.map(x => x.replace(/^0+(?=.)/, ''));
  let best = [-1, 0],
    i = 0;
  while (i < 8) {
    if (a[i] === '0') {
      let j = i;
      while (j < 8 && a[j] === '0') j++;
      if (j - i > best[1]) best = [i, j - i];
      i = j;
    } else i++;
  }
  if (best[1] < 2) return a.join(':');
  return a.slice(0, best[0]).join(':') + '::' + a.slice(best[0] + best[1]).join(':');
};
