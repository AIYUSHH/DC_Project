/**
 * DNS message encoding and decoding (wire format)
 *
 * Builds and parses DNS messages exactly as they travel on the network (RFC 1035): a 12-byte header,
 * length-prefixed name labels, and name compression pointers. dnsQuery/dnsResponse produce bytes; parseDns turns
 * bytes back into fields the capture explorer can display.
 *
 * Imports:
 *   - ../core/encoding.js (bytes, hex, bits and UTF-8 helpers): be16, be32, bytesOf, rd16, rd32
 *
 * Exports: dnsQuery, dnsResponse, parseDns
 *
 * Used by: modules/application-layer/dns.js, simulations/capture.js, simulations/dissector.js
 */

import { be16, be32, bytesOf, rd16, rd32 } from '../core/encoding.js';

/**
 * DNS record type names -> numeric type codes.
 */
const QT = { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28 };

/**
 * The reverse of QT: numeric code -> type name.
 */
const QTN = Object.fromEntries(Object.entries(QT).map(([k, v]) => [v, k]));

/**
 * Encodes a domain name as DNS labels: each label is preceded by its length and the name ends with a 0 byte ("www.example.com" -> 3 www 7 example 3 com 0).
 */
function dnsName(n) {
  const out = [];
  n.split('.')
    .filter(Boolean)
    .forEach(l => {
      // Each label is preceded by its length (at most 63).
      out.push(l.length, ...bytesOf(l));
    });
  out.push(0);
  return out;
}

/**
 * Builds a DNS query message (standard query, recursion desired, one question).
 */
export const dnsQuery = (id, name, type = 'A') => [
  ...be16(id),
  0x01,
  0x00,
  0,
  1,
  0,
  0,
  0,
  0,
  0,
  0,
  ...dnsName(name),
  ...be16(QT[type]),
  0,
  1,
];

/**
 * Builds a DNS response with answer records.
 *
 * Each answer starts with 0xC00C, a compression pointer to the name at offset 12 (the question), instead of repeating it.
 */
export function dnsResponse(id, name, type, answers, rcode = 0) {
  const out = [
    ...be16(id),
    0x81,
    0x80 | rcode,
    0,
    1,
    ...be16(answers.length),
    0,
    0,
    0,
    0,
    ...dnsName(name),
    ...be16(QT[type]),
    0,
    1,
  ];
  // Each answer begins with 0xC00C: a compression pointer to offset 12, where the question wrote
  // the name, so the name is not repeated.
  answers.forEach(a =>
    out.push(0xc0, 0x0c, ...be16(a.type), 0, 1, ...be32(a.ttl), ...be16(a.rdata.length), ...a.rdata)
  );
  return out;
}

/**
 * Reads a possibly compressed DNS name.
 *
 * A length byte with its top two bits set (0xC0) is a pointer: the next 14 bits give the offset where the name continues. A guard counter stops malicious pointer loops.
 * @returns {[string, number]} the name and the offset just after it.
 */
function readName(b, i) {
  const labels = [];
  let jumped = false,
    ret = i,
    guard = 0;
  while (guard++ < 40) {
    const l = b[i];
    if (l === undefined) break;
    if (l === 0) {
      i++;
      break;
    }
    // Top two bits set = compression pointer (RFC 1035 section 4.1.4): the name continues at an
    // earlier offset given by the next 14 bits.
    if ((l & 0xc0) === 0xc0) {
      const p = ((l & 0x3f) << 8) | b[i + 1];
      // After the first jump, the caller resumes just after the 2-byte pointer, not after the name
      // it points to.
      if (!jumped) ret = i + 2;
      jumped = true;
      i = p;
      continue;
    }
    labels.push(String.fromCharCode(...b.slice(i + 1, i + 1 + l)));
    i += 1 + l;
  }
  if (!jumped) ret = i;
  return [labels.join('.') || '.', ret];
}

/**
 * Decodes a DNS message into displayable fields with byte offsets.
 */
export function parseDns(b, base) {
  const F = [],
    id = rd16(b, 0),
    fl = rd16(b, 2),
    qd = rd16(b, 4),
    an = rd16(b, 6);
  // DNS flags: the top bit says query (0) or response (1); the low 4 bits are the response code.
  const qr = fl >> 15,
    rcode = fl & 15;
  F.push({ k: 'Transaction ID', v: '0x' + id.toString(16).padStart(4, '0'), off: base, len: 2 });
  F.push({
    k: 'Flags',
    v: `0x${fl.toString(16).padStart(4, '0')}  (${qr ? 'response' : 'query'}${fl & 0x100 ? ', recursion desired' : ''}${fl & 0x80 ? ', recursion available' : ''}${qr ? ', rcode ' + ['NOERROR', 'FORMERR', 'SERVFAIL', 'NXDOMAIN', 'NOTIMP', 'REFUSED'][rcode] : ''})`,
    off: base + 2,
    len: 2,
  });
  F.push({ k: 'Questions / Answers', v: `${qd} / ${an}`, off: base + 4, len: 6 });
  let i = 12,
    qname = '',
    qtype = 'A';
  for (let q = 0; q < qd; q++) {
    const s = i;
    const [nm, ni] = readName(b, i);
    i = ni;
    const t = rd16(b, i);
    i += 4;
    qname = nm;
    qtype = QTN[t] || t;
    F.push({ k: 'Question', v: `${nm}  type ${QTN[t] || t}  class IN`, off: base + s, len: i - s });
  }
  const answers = [];
  for (let a = 0; a < an; a++) {
    const s = i;
    const [nm, ni] = readName(b, i);
    i = ni;
    const t = rd16(b, i),
      ttl = rd32(b, i + 4),
      rl = rd16(b, i + 8);
    i += 10;
    let v = '';
    if (t === 1) v = b.slice(i, i + 4).join('.');
    else if (t === 28) {
      const g = [];
      for (let k = 0; k < 16; k += 2) g.push(rd16(b, i + k).toString(16));
      v = g.join(':');
    } else if (t === 5 || t === 2) v = readName(b, i)[0];
    else if (t === 15) v = rd16(b, i) + ' ' + readName(b, i + 2)[0];
    else if (t === 16) v = '"' + String.fromCharCode(...b.slice(i + 1, i + rl)) + '"';
    i += rl;
    answers.push({ name: nm, type: QTN[t] || t, ttl, v });
    F.push({
      k: 'Answer',
      v: `${nm}  ${QTN[t] || t}  TTL ${ttl}  ${v}`,
      off: base + s,
      len: i - s,
    });
  }
  return { fields: F, id, qr, rcode, qname, qtype, answers };
}
