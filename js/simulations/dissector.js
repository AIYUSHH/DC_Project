/**
 * packet dissector: bytes -> layers, fields and integrity checks
 *
 * parseFrame() reads a raw Ethernet frame and decodes it layer by layer (Ethernet, IPv4, TCP/UDP,
 * DNS, HTTP payload), recording for every field its name, value and exact byte offset and length so the UI can highlight
 * the matching bytes. It also verifies the Ethernet FCS, IPv4 header checksum and TCP/UDP checksums.
 *
 * Imports:
 *   - ../core/encoding.js (bytes, hex, bits and UTF-8 helpers): hexs, rd16, rd32
 *   - ../core/checksums.js (parity-free error-detection math: Internet checksum, CRC-8, CRC-32): crc32, sum16
 *   - ../core/addressing.js (IPv4/IPv6 address and CIDR calculations): b2ip, p4
 *   - ./packet-builders.js (byte-accurate Ethernet / IPv4 / TCP / UDP builders): PROTO, flagNames, macStr, pseudoHdr
 *   - ./dns-wire.js (DNS message encoding and decoding (wire format)): parseDns
 *
 * Exports: parseFrame
 *
 * Used by: modules/advanced/encapsulation.js, modules/learning/journey.js, simulations/capture.js
 */

import { b2ip, p4 } from '../core/addressing.js';
import { crc32, sum16 } from '../core/checksums.js';
import { hexs, rd16, rd32 } from '../core/encoding.js';
import { parseDns } from './dns-wire.js';
import { flagNames, macStr, PROTO, pseudoHdr } from './packet-builders.js';

/**
 * Dissects an Ethernet frame into layers.
 *
 * @param {number[]} b - the frame bytes.
 * @returns {{layers:Array, proto:string, info:string, src:string, dst:string, len:number, checks:Array, f:Object, protos:Set<string>}} where `f` maps Wireshark-style field names (e.g. "tcp.port") to values for the display filter, and `checks` lists each layer's integrity verdict.
 */
export function parseFrame(b) {
  const r = {
    layers: [],
    proto: 'Ethernet',
    info: '',
    src: macStr(b.slice(6, 12)),
    dst: macStr(b.slice(0, 6)),
    len: b.length,
    checks: [],
    f: {},
    protos: new Set(['eth']),
  };
  if (b.length < 18) {
    r.info = 'Runt frame';
    return r;
  }
  const n = b.length,
    type = rd16(b, 12);
  const fcs = (b[n - 4] | (b[n - 3] << 8) | (b[n - 2] << 16) | (b[n - 1] << 24)) >>> 0,
    calc = crc32(b.slice(0, n - 4));
  r.checks.push({
    layer: 'Ethernet FCS',
    ok: fcs === calc,
    detail: `stored ${fcs.toString(16).padStart(8, '0')}, computed ${calc.toString(16).padStart(8, '0')}`,
  });
  r.layers.push({
    name: 'Ethernet II',
    summary: `${macStr(b.slice(6, 12))} → ${macStr(b.slice(0, 6))}`,
    off: 0,
    len: 14,
    fields: [
      { k: 'Destination', v: macStr(b.slice(0, 6)), off: 0, len: 6 },
      { k: 'Source', v: macStr(b.slice(6, 12)), off: 6, len: 6 },
      {
        k: 'Type',
        v: '0x' + type.toString(16).padStart(4, '0') + (type === 0x0800 ? ' (IPv4)' : ''),
        off: 12,
        len: 2,
      },
      {
        k: 'Frame check sequence',
        v: fcs.toString(16).padStart(8, '0') + (fcs === calc ? ' (valid)' : ' (BAD)'),
        off: n - 4,
        len: 4,
      },
    ],
  });
  if (type !== 0x0800 || n < 14 + 20 + 4) {
    r.info = 'Ethernet type 0x' + type.toString(16);
    return r;
  }
  const ihl = (b[14] & 15) * 4,
    total = rd16(b, 16),
    ff = rd16(b, 20),
    proto = b[23];
  const hdr = b.slice(14, 14 + ihl),
    hok = sum16(hdr) === 0xffff;
  r.checks.push({
    layer: 'IPv4 header checksum',
    ok: hok,
    detail: `field 0x${rd16(b, 24).toString(16).padStart(4, '0')}`,
  });
  const sip = b2ip(b, 26),
    dip = b2ip(b, 30);
  r.src = sip;
  r.dst = dip;
  r.proto = PROTO[proto] || 'IP';
  r.protos.add('ip');
  Object.assign(r.f, {
    'ip.src': sip,
    'ip.dst': dip,
    'ip.ttl': b[22],
    'ip.proto': proto,
    'frame.len': n,
  });
  r.layers.push({
    name: 'Internet Protocol v4',
    summary: `${sip} → ${dip}`,
    off: 14,
    len: ihl,
    fields: [
      { k: 'Version / header length', v: `${b[14] >> 4} / ${ihl} bytes`, off: 14, len: 1 },
      { k: 'Total length', v: total, off: 16, len: 2 },
      { k: 'Identification', v: '0x' + rd16(b, 18).toString(16).padStart(4, '0'), off: 18, len: 2 },
      {
        k: 'Flags / fragment offset',
        v: `${ff & 0x4000 ? 'DF ' : ''}${ff & 0x2000 ? 'MF ' : ''}offset ${(ff & 0x1fff) * 8}`,
        off: 20,
        len: 2,
      },
      { k: 'Time to live', v: b[22], off: 22, len: 1 },
      { k: 'Protocol', v: `${proto} (${PROTO[proto] || '?'})`, off: 23, len: 1 },
      {
        k: 'Header checksum',
        v: '0x' + rd16(b, 24).toString(16).padStart(4, '0') + (hok ? ' (valid)' : ' (BAD)'),
        off: 24,
        len: 2,
      },
      { k: 'Source', v: sip, off: 26, len: 4 },
      { k: 'Destination', v: dip, off: 30, len: 4 },
    ],
  });
  const l4 = b.slice(14 + ihl, 14 + total),
    o4 = 14 + ihl;
  const pseudo = pseudoHdr(p4(sip), p4(dip), proto, l4.length);
  if (proto === 6 && l4.length >= 20) {
    const sp = rd16(l4, 0),
      dp = rd16(l4, 2),
      seq = rd32(l4, 4),
      ack = rd32(l4, 8),
      hl = (l4[12] >> 4) * 4,
      fl = l4[13],
      win = rd16(l4, 14);
    const payload = l4.slice(hl),
      ok = sum16([...pseudo, ...l4]) === 0xffff,
      names = flagNames(fl);
    r.checks.push({
      layer: 'TCP checksum',
      ok,
      detail: `field 0x${rd16(l4, 16).toString(16).padStart(4, '0')}`,
    });
    r.protos.add('tcp');
    Object.assign(r.f, {
      'tcp.srcport': sp,
      'tcp.dstport': dp,
      'tcp.port': [sp, dp],
      'tcp.seq': seq,
      'tcp.ack': ack,
      'tcp.len': payload.length,
      'tcp.flags.syn': !!(fl & 2),
      'tcp.flags.ack': !!(fl & 16),
      'tcp.flags.fin': !!(fl & 1),
      'tcp.flags.rst': !!(fl & 4),
      'tcp.flags.push': !!(fl & 8),
    });
    r.layers.push({
      name: 'Transmission Control Protocol',
      summary: `${sp} → ${dp} [${names.join(', ')}]`,
      off: o4,
      len: hl,
      fields: [
        { k: 'Source port', v: sp, off: o4, len: 2 },
        { k: 'Destination port', v: dp, off: o4 + 2, len: 2 },
        { k: 'Sequence number', v: seq, off: o4 + 4, len: 4 },
        { k: 'Acknowledgment number', v: ack, off: o4 + 8, len: 4 },
        { k: 'Header length', v: hl + ' bytes', off: o4 + 12, len: 1 },
        { k: 'Flags', v: names.join(', ') || 'none', off: o4 + 13, len: 1 },
        { k: 'Window', v: win, off: o4 + 14, len: 2 },
        {
          k: 'Checksum',
          v: '0x' + rd16(l4, 16).toString(16).padStart(4, '0') + (ok ? ' (valid)' : ' (BAD)'),
          off: o4 + 16,
          len: 2,
        },
      ],
    });
    r.info = `${sp} → ${dp} [${names.join(', ')}] Seq=${seq} Ack=${ack} Win=${win} Len=${payload.length}`;
    r.seqKey = `${sip}>${dip}:${sp}>${dp}:${seq}:${payload.length}`;
    if (payload.length) {
      const txt = String.fromCharCode(
        ...payload.slice(0, 600).map(x => ((x >= 32 && x < 127) || x === 10 || x === 13 ? x : 63))
      );
      const isReq = /^(GET|POST|PUT|DELETE|HEAD) /.test(txt),
        isRes = /^HTTP\/1\.[01] /.test(txt);
      if (isReq || isRes) {
        const lines = txt.split('\r\n'),
          first = lines[0];
        r.protos.add('http');
        r.proto = 'HTTP';
        r.info = first;
        r.f['http.request.method'] = isReq ? first.split(' ')[0] : undefined;
        r.f['http.response.code'] = isRes ? +first.split(' ')[1] : undefined;
        const hdrEnd = txt.indexOf('\r\n\r\n');
        r.layers.push({
          name: 'Hypertext Transfer Protocol',
          summary: first,
          off: o4 + hl,
          len: payload.length,
          fields: lines
            .slice(0, hdrEnd < 0 ? lines.length : txt.slice(0, hdrEnd).split('\r\n').length)
            .map(x => ({
              k: x.includes(':') ? x.split(':')[0] : 'Line',
              v: x.includes(':') ? x.slice(x.indexOf(':') + 1).trim() : x,
              off: o4 + hl,
              len: payload.length,
            })),
        });
      } else
        r.layers.push({
          name: 'Payload',
          summary: `${payload.length} bytes`,
          off: o4 + hl,
          len: payload.length,
          fields: [
            {
              k: 'Data',
              v: hexs(payload.slice(0, 24)) + (payload.length > 24 ? ' …' : ''),
              off: o4 + hl,
              len: payload.length,
            },
          ],
        });
    }
  } else if (proto === 17 && l4.length >= 8) {
    const sp = rd16(l4, 0),
      dp = rd16(l4, 2),
      ul = rd16(l4, 4),
      payload = l4.slice(8);
    const stored = rd16(l4, 6),
      ok = stored === 0 || sum16([...pseudo, ...l4]) === 0xffff;
    r.checks.push({
      layer: 'UDP checksum',
      ok,
      detail: `field 0x${stored.toString(16).padStart(4, '0')}`,
    });
    r.protos.add('udp');
    Object.assign(r.f, { 'udp.srcport': sp, 'udp.dstport': dp, 'udp.port': [sp, dp] });
    r.layers.push({
      name: 'User Datagram Protocol',
      summary: `${sp} → ${dp}`,
      off: o4,
      len: 8,
      fields: [
        { k: 'Source port', v: sp, off: o4, len: 2 },
        { k: 'Destination port', v: dp, off: o4 + 2, len: 2 },
        { k: 'Length', v: ul, off: o4 + 4, len: 2 },
        {
          k: 'Checksum',
          v: '0x' + stored.toString(16).padStart(4, '0') + (ok ? ' (valid)' : ' (BAD)'),
          off: o4 + 6,
          len: 2,
        },
      ],
    });
    r.info = `${sp} → ${dp} Len=${payload.length}`;
    if (sp === 53 || dp === 53) {
      const d = parseDns(payload, o4 + 8);
      r.protos.add('dns');
      r.proto = 'DNS';
      r.f['dns.qry.name'] = d.qname;
      r.f['dns.flags.rcode'] = d.rcode;
      r.layers.push({
        name: 'Domain Name System',
        summary: d.qr ? 'response' : 'query',
        off: o4 + 8,
        len: payload.length,
        fields: d.fields,
      });
      r.info = d.qr
        ? `Standard query response 0x${d.id.toString(16)} ${d.qtype} ${d.qname}${d.rcode ? ' No such name' : ' ' + d.answers.map(a => a.v).join(', ')}`
        : `Standard query 0x${d.id.toString(16)} ${d.qtype} ${d.qname}`;
    }
  }
  return r;
}
