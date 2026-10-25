/**
 * byte-accurate Ethernet / IPv4 / TCP / UDP builders
 *
 * Build real protocol headers as arrays of bytes, including the checksums and the Ethernet CRC-32.
 * They are the "write" side of the packet capture and encapsulation modules; simulations/dissector.js is the
 * "read" side that parses the same bytes back.
 *
 * Imports:
 *   - ../core/encoding.js (bytes, hex, bits and UTF-8 helpers): be16, be32, hex
 *   - ../core/checksums.js (parity-free error-detection math: Internet checksum, CRC-8, CRC-32): cksum, crc32
 *
 * Exports: FL, MAC, PROTO, ethFrame, flagNames, ipv4Packet, macStr, pseudoHdr, tcpSegment, udpDatagram
 *
 * Used by: 7 files (modules/ x3, simulations/ x4)
 */

import { cksum, crc32 } from '../core/checksums.js';
import { be16, be32, hex } from '../core/encoding.js';

/**
 * Fixed example hardware addresses for the client and its gateway.
 */
export const MAC = {
  client: [0x3c, 0x22, 0xfb, 0x1a, 0x2b, 0x3c],
  gw: [0x00, 0x1b, 0x44, 0x11, 0x3a, 0xb7],
};

/**
 * MAC address bytes -> "aa:bb:cc:dd:ee:ff".
 */
export const macStr = a => a.map(hex).join(':');

/**
 * IP protocol numbers -> names (carried in the IPv4 "protocol" field).
 */
export const PROTO = { 1: 'ICMP', 6: 'TCP', 17: 'UDP' };

/**
 * TCP flag bits. A segment's flags byte is these values ORed together, e.g. SYN|ACK = 0x12.
 */
export const FL = { FIN: 1, SYN: 2, RST: 4, PSH: 8, ACK: 16, URG: 32 };

/**
 * Flags byte -> list of flag names that are set.
 */
export const flagNames = f => Object.keys(FL).filter(k => f & FL[k]);

/**
 * Builds an Ethernet II frame.
 *
 * Layout: destination MAC (6) + source MAC (6) + EtherType (2) + payload + FCS (4). Payloads shorter than 46 bytes are zero-padded (the minimum frame is 64 bytes), and the FCS is the CRC-32 of everything before it, stored least-significant byte first.
 * @returns {{bytes:number[], pad:number}} the frame and how many padding bytes were added.
 */
export function ethFrame({ dst, src, type = 0x0800, payload }) {
  const pl = payload.slice();
  // Ethernet needs at least 46 bytes of payload (a 64-byte minimum frame including header and
  // FCS).
  const pad = Math.max(0, 46 - pl.length);
  for (let i = 0; i < pad; i++) pl.push(0);
  const body = [...dst, ...src, ...be16(type), ...pl];
  // The frame check sequence is the CRC-32 of everything before it.
  const f = crc32(body);
  // The FCS goes on the wire least-significant byte first (unlike most protocol fields).
  return { bytes: [...body, f & 255, (f >>> 8) & 255, (f >>> 16) & 255, (f >>> 24) & 255], pad };
}

/**
 * Builds an IPv4 packet (20-byte header, no options).
 *
 * Byte 0 is 0x45: version 4, header length 5 words. Flags and fragment offset share one 16-bit field: 0x4000 = Don't Fragment, 0x2000 = More Fragments, low 13 bits = offset in 8-byte units. The header checksum is computed with its own field set to 0 and then written into bytes 10-11.
 * @returns {number[]} header + payload.
 */
export function ipv4Packet({
  src,
  dst,
  proto,
  ttl = 64,
  id = 0x1c46,
  df = true,
  mf = false,
  off = 0,
  tos = 0,
  payload,
}) {
  const len = 20 + payload.length;
  // Flags and fragment offset share 16 bits: DF = 0x4000, MF = 0x2000, offset = low 13 bits
  // (counted in 8-byte units).
  const ff = (df ? 0x4000 : 0) | (mf ? 0x2000 : 0) | (off & 0x1fff);
  // IPv4 header, field by field: version+header length (0x45), type of service, total length,
  // identification, flags+offset, TTL, protocol, checksum (0,0 for now), source, destination.
  const h = [
    0x45,
    tos,
    ...be16(len),
    ...be16(id),
    ...be16(ff),
    ttl,
    proto,
    0,
    0,
    ...be32(src),
    ...be32(dst),
  ];
  // The checksum is computed with its own field set to zero, then written into bytes 10-11.
  const c = cksum(h);
  h[10] = c >> 8;
  h[11] = c & 255;
  return [...h, ...payload];
}

/**
 * The TCP/UDP "pseudo header": source and destination IP, a zero byte, protocol and length.
 *
 * It is included in the checksum (but not transmitted) so a segment delivered to the wrong IP address is detected.
 */
export const pseudoHdr = (src, dst, proto, len) => [
  ...be32(src),
  ...be32(dst),
  0,
  proto,
  ...be16(len),
];

/**
 * Builds a TCP segment with a valid checksum.
 *
 * The data-offset byte holds the header length in 32-bit words in its upper 4 bits ("(hl / 4) << 4"). The checksum covers pseudo header + segment and is written into bytes 16-17.
 */
export function tcpSegment({
  src,
  dst,
  sp,
  dp,
  seq,
  ack,
  flags,
  win = 64240,
  payload = [],
  opts = [],
}) {
  // Header length in bytes: 20 plus any options.
  const hl = 20 + opts.length;
  const seg = [
    ...be16(sp),
    ...be16(dp),
    ...be32(seq >>> 0),
    ...be32(ack >>> 0),
    // Data offset = header length in 32-bit words, stored in the upper four bits of this byte.
    (hl / 4) << 4,
    flags,
    ...be16(win),
    0,
    0,
    0,
    0,
    ...opts,
    ...payload,
  ];
  // The TCP checksum covers the pseudo header plus the whole segment (with its checksum field
  // still zero).
  const c = cksum([...pseudoHdr(src, dst, 6, seg.length), ...seg]);
  seg[16] = c >> 8;
  seg[17] = c & 255;
  return seg;
}

/**
 * Builds a UDP datagram (8-byte header) with a valid checksum.
 *
 * A computed checksum of 0 is sent as 0xFFFF because 0 means "no checksum" in UDP.
 */
export function udpDatagram({ src, dst, sp, dp, payload }) {
  const len = 8 + payload.length;
  const seg = [...be16(sp), ...be16(dp), ...be16(len), 0, 0, ...payload];
  let c = cksum([...pseudoHdr(src, dst, 17, len), ...seg]);
  // In UDP a checksum of 0 means "not computed", so a genuine 0 is sent as 0xFFFF (the same value
  // in ones'-complement arithmetic).
  if (c === 0) c = 0xffff;
  seg[6] = c >> 8;
  seg[7] = c & 255;
  return seg;
}
