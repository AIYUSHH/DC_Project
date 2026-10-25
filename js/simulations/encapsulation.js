/**
 * builds the layered data unit used by the encapsulation module
 *
 * Wraps application text in a TCP segment, an IPv4 packet and an Ethernet frame, and returns each layer
 * so the UI can show how every layer adds its own header (and trailer) around the one above.
 *
 * Imports:
 *   - ../core/addressing.js (IPv4/IPv6 address and CIDR calculations): p4
 *   - ../core/encoding.js (bytes, hex, bits and UTF-8 helpers): bytesOf
 *   - ./packet-builders.js (byte-accurate Ethernet / IPv4 / TCP / UDP builders): FL, MAC, ethFrame, ipv4Packet, tcpSegment
 *
 * Exports: buildStack
 *
 * Used by: modules/advanced/encapsulation.js
 */

import { p4 } from '../core/addressing.js';
import { bytesOf } from '../core/encoding.js';
import { ethFrame, FL, ipv4Packet, MAC, tcpSegment } from './packet-builders.js';

/**
 * Builds the layered data unit for the encapsulation module.
 *
 * @param {string} text - application data (first 400 bytes used).
 * @param {Object} [o] - optional src, dst, sp, dp, ttl.
 * @returns {{app:number[], tcp:number[], ip:number[], eth:number[], pad:number}} each layer's bytes, innermost first; pad is the Ethernet padding added.
 */
export function buildStack(text, o = {}) {
  const si = p4(o.src || '10.0.0.2'),
    di = p4(o.dst || '93.184.216.34');
  const app = bytesOf(text).slice(0, 400);
  const tcp = tcpSegment({
    src: si,
    dst: di,
    sp: o.sp || 49732,
    dp: o.dp || 80,
    seq: 1000,
    ack: 5000,
    flags: FL.PSH | FL.ACK,
    payload: app,
  });
  const ip = ipv4Packet({ src: si, dst: di, proto: 6, ttl: o.ttl || 64, payload: tcp });
  const eth = ethFrame({ dst: MAC.gw, src: MAC.client, payload: ip });
  return { app, tcp, ip, eth: eth.bytes, pad: eth.pad };
}
