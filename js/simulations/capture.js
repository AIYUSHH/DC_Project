/**
 * sample packet captures and the display-filter engine
 *
 * buildCapture() creates three scripted captures (page load, page load with loss, DNS failure) out of
 * real packet bytes; analyzeCapture() dissects every packet and flags TCP retransmissions; compileFilter()
 * turns a Wireshark-style filter string such as "tcp.port==80 && tcp.len>0" into a predicate function.
 *
 * Imports:
 *   - ../core/addressing.js (IPv4/IPv6 address and CIDR calculations): ip2b, p4
 *   - ../core/encoding.js (bytes, hex, bits and UTF-8 helpers): bytesOf
 *   - ./packet-builders.js (byte-accurate Ethernet / IPv4 / TCP / UDP builders): FL, MAC, ethFrame, ipv4Packet, tcpSegment, udpDatagram
 *   - ./dns-wire.js (DNS message encoding and decoding (wire format)): dnsQuery, dnsResponse
 *   - ./dissector.js (packet dissector: bytes -> layers, fields and integrity checks): parseFrame
 *
 * Exports: analyzeCapture, buildCapture, compileFilter
 *
 * Used by: modules/advanced/packet-capture.js
 */

import { ip2b, p4 } from '../core/addressing.js';
import { bytesOf } from '../core/encoding.js';
import { parseFrame } from './dissector.js';
import { dnsQuery, dnsResponse } from './dns-wire.js';
import { ethFrame, FL, ipv4Packet, MAC, tcpSegment, udpDatagram } from './packet-builders.js';

/**
 * Creates a scripted packet capture.
 *
 * @param {'web'|'loss'|'dns'} kind - page load, page load with a lost segment, or a DNS failure.
 * @returns {Array<{t:number, bytes:number[]}>} timestamped raw frames built with the real builders, so every checksum is valid.
 */
export function buildCapture(kind = 'web') {
  const cip = p4('10.0.0.2'),
    dnsIp = p4('8.8.8.8'),
    sip = p4('93.184.216.34');
  const out = [];
  let t = 0,
    ipid = 0x4a10;
  const add = (dt, dir, proto, l4, src, dst) => {
    t += dt;
    const pk = ipv4Packet({
      src: dir === 'out' ? src : dst,
      dst: dir === 'out' ? dst : src,
      proto,
      id: ipid++,
      ttl: dir === 'out' ? 64 : 53,
      payload: l4,
    });
    const fr = ethFrame({
      dst: dir === 'out' ? MAC.gw : MAC.client,
      src: dir === 'out' ? MAC.client : MAC.gw,
      payload: pk,
    });
    out.push({ t, bytes: fr.bytes });
  };
  const dnsRun = (name, type, id, port, answerIps, rcode) => {
    add(
      0,
      'out',
      17,
      udpDatagram({ src: cip, dst: dnsIp, sp: port, dp: 53, payload: dnsQuery(id, name, type) }),
      cip,
      dnsIp
    );
    const ans = answerIps.map(ip => ({ type: 1, ttl: 300, rdata: ip2b(p4(ip)) }));
    add(
      21,
      'in',
      17,
      udpDatagram({
        src: dnsIp,
        dst: cip,
        sp: 53,
        dp: port,
        payload: dnsResponse(id, name, type, ans, rcode),
      }),
      cip,
      dnsIp
    );
  };
  if (kind === 'dns') {
    dnsRun('exmaple.com', 'A', 0x1a01, 50211, [], 3);
    t += 900;
    dnsRun('exmaple.com', 'AAAA', 0x1a02, 50212, [], 3);
    t += 400;
    dnsRun('example.com', 'A', 0x1a03, 50213, ['93.184.216.34'], 0);
    return out;
  }
  dnsRun('example.com', 'A', 0x3a7e, 51234, ['93.184.216.34'], 0);
  let cs = 0x1a2b3c4d,
    ss = 0x7c5e9a10;
  const cp = 49732;
  const tc = (dt, dir, flags, payload = [], opts = []) => {
    const p =
      dir === 'out'
        ? tcpSegment({
            src: cip,
            dst: sip,
            sp: cp,
            dp: 80,
            seq: cs,
            ack: flags & FL.ACK ? ss : 0,
            flags,
            payload,
            opts,
          })
        : tcpSegment({
            src: sip,
            dst: cip,
            sp: 80,
            dp: cp,
            seq: ss,
            ack: cs,
            flags,
            payload,
            opts,
          });
    add(dt, dir, 6, p, cip, sip);
    const adv = payload.length + (flags & (FL.SYN | FL.FIN) ? 1 : 0);
    if (dir === 'out') cs = (cs + adv) >>> 0;
    else ss = (ss + adv) >>> 0;
  };
  const mss = [2, 4, 0x05, 0xb4];
  tc(3, 'out', FL.SYN, [], mss);
  tc(24, 'in', FL.SYN | FL.ACK, [], mss);
  tc(0.2, 'out', FL.ACK);
  const req = bytesOf(
    'GET / HTTP/1.1\r\nHost: example.com\r\nUser-Agent: DataCommsLab/2.0\r\nAccept: text/html\r\nConnection: close\r\n\r\n'
  );
  tc(1, 'out', FL.PSH | FL.ACK, req);
  tc(24, 'in', FL.ACK);
  const body =
    '<!doctype html><title>Example Domain</title><h1>Example Domain</h1><p>This domain is for use in examples.</p>';
  const res = bytesOf(
    `HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n${body}`
  );
  const resStart = { cs, ss };
  tc(8, 'in', FL.PSH | FL.ACK, res);
  if (kind === 'loss') {
    const keep = { cs, ss };
    cs = resStart.cs;
    ss = resStart.ss;
    tc(200, 'in', FL.PSH | FL.ACK, res);
    cs = keep.cs;
    ss = keep.ss;
  }
  tc(0.6, 'out', FL.ACK);
  tc(1, 'out', FL.FIN | FL.ACK);
  tc(23, 'in', FL.FIN | FL.ACK);
  tc(0.3, 'out', FL.ACK);
  return out;
}

/* flag retransmissions and relative sequence numbers */
/**
 * Dissects every packet of a capture and adds analysis flags (TCP retransmissions are detected by seeing the same sequence number with data twice).
 */
export function analyzeCapture(raw) {
  const seen = new Set(),
    first = {};
  return raw.map((p, i) => {
    const r = parseFrame(p.bytes);
    r.no = i + 1;
    r.t = p.t;
    r.bytes = p.bytes;
    r.notes = [];
    if (r.seqKey && r.f['tcp.len'] > 0) {
      if (seen.has(r.seqKey)) {
        r.f['tcp.analysis.retransmission'] = true;
        r.notes.push('TCP retransmission');
        r.info = '[TCP Retransmission] ' + r.info;
      }
      seen.add(r.seqKey);
    }
    return r;
  });
}

/**
 * Compiles a display-filter string into a predicate.
 *
 * Supports: protocol names (tcp, dns), comparisons (== != > < >= <= contains) on fields like tcp.port or ip.addr, negation with !, && / and, || / or. "||" binds weaker than "&&", exactly like Wireshark.
 * @param {string} src
 * @returns {(packet:Object)=>boolean}
 */
export function compileFilter(src) {
  const s = src.trim();
  if (!s) return () => true;
  const atom = a => {
    a = a.trim();
    let neg = false;
    if (a.startsWith('!')) {
      neg = true;
      a = a.slice(1).trim();
    }
    const m = a.match(/^([a-z0-9_.]+)\s*(==|!=|>=|<=|>|<|contains)\s*(.+)$/i);
    let fn;
    if (m) {
      const [, k, op, raw] = m,
        val = raw.replace(/^"|"$/g, '');
      const isIp = k === 'ip.addr';
      fn = p => {
        const get = key => (key === 'ip.addr' ? [p.f['ip.src'], p.f['ip.dst']] : p.f[key]);
        let v = get(k);
        if (v === undefined) return false;
        const vs = Array.isArray(v) ? v : [v];
        const test = x => {
          const xn = typeof x === 'number' ? x : Number(x),
            vn = Number(val);
          switch (op) {
            case '==':
              return String(x) === val || (!isNaN(vn) && xn === vn);
            case '!=':
              return String(x) !== val && !(!isNaN(vn) && xn === vn);
            case '>':
              return xn > vn;
            case '<':
              return xn < vn;
            case '>=':
              return xn >= vn;
            case '<=':
              return xn <= vn;
            case 'contains':
              return String(x).toLowerCase().includes(val.toLowerCase());
          }
          return false;
        };
        return op === '!=' ? vs.every(test) : vs.some(test) && (isIp || true);
      };
    } else {
      const key = a.toLowerCase();
      fn = p => p.protos.has(key) || !!p.f[key];
    }
    return neg ? p => !fn(p) : fn;
  };
  const andOf = t => {
    const parts = t.split(/&&|\band\b/i).map(atom);
    return p => parts.every(f => f(p));
  };
  const orParts = s.split(/\|\||\bor\b/i).map(andOf);
  return p => orParts.some(f => f(p));
}
