/**
 * learning module: End-to-end journey
 *
 * Follows the learner's own message through all 13 stages using real bytes.
 *
 * This file registers one learning module with regMod(). Its mount(root) function builds the screen inside
 * `root` and attaches event handlers; the function mount() returns (if any) is its cleanup, called by the router
 * when the learner leaves, so timers and listeners do not outlive the screen. The protocol logic lives in
 * ../../simulations/ and ../../core/; this file is the user interface for it.
 *
 * Imports:
 *   - ../../core/state.js (shared in-memory state): S
 *   - ../../core/encoding.js (bytes, hex, bits and UTF-8 helpers): bin8, bytesOf, hex, hexs, rd16
 *   - ../../core/utils.js (tiny DOM, math and timing helpers): $, REDUCE, esc
 *   - ../../core/addressing.js (IPv4/IPv6 address and CIDR calculations): p4
 *   - ../../core/checksums.js (parity-free error-detection math: Internet checksum, CRC-8, CRC-32): crc32
 *   - ../../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): chipRow, hn, kb, on, panel
 *   - ../../simulations/packetization.js (packet layout of the core lab): packetBytes, packetCrc
 *   - ../../simulations/packet-builders.js (byte-accurate Ethernet / IPv4 / TCP / UDP builders): FL, MAC, ethFrame, ipv4Packet, macStr, tcpSegment
 *   - ../../simulations/dissector.js (packet dissector: bytes -> layers, fields and integrity checks): parseFrame
 *   - ../registry.js (learning-module registry and group definitions): regMod
 *
 * Exports: (none)
 *
 * Used by: (imported only for its side effects by app.js)
 */

import { p4 } from '../../core/addressing.js';
import { crc32 } from '../../core/checksums.js';
import { bin8, bytesOf, hex, hexs, rd16 } from '../../core/encoding.js';
import { S } from '../../core/state.js';
import { chipRow, hn, kb, on, panel } from '../../core/ui-helpers.js';
import { $, esc, REDUCE } from '../../core/utils.js';
import { parseFrame } from '../../simulations/dissector.js';
import {
  ethFrame,
  FL,
  ipv4Packet,
  MAC,
  macStr,
  tcpSegment,
} from '../../simulations/packet-builders.js';
import { packetBytes, packetCrc } from '../../simulations/packetization.js';
import { regMod } from '../registry.js';

/**
 * Builds the 13 stages of the end-to-end journey from the learner's own message.
 *
 * Reads the current message, byte stream and payload size, then builds a real TCP segment, IPv4 packet and Ethernet frames (before and after a router) with the packet builders, so every number shown is computed, not hard-coded.
 * @returns {Array<{n:string,r:string,s:string,e:string,b:Array,bytes:?number[]}>} stage name, representation, size, explanation, block items, bytes.
 */
function journeyData() {
  const m = (S.msg || '').trim() || 'Hi',
    B = S.bytes.length ? S.bytes : bytesOf(m),
    n = +($('#ps') && $('#ps').value) || 3;
  const pk = B.slice(0, n),
    np = Math.max(1, Math.ceil(B.length / n)),
    labPkt = [...packetBytes(0, pk), packetCrc(0, pk)];
  const si = p4('10.0.0.2'),
    di = p4('93.184.216.34');
  const tcp = tcpSegment({
    src: si,
    dst: di,
    sp: 49732,
    dp: 80,
    seq: 1000,
    ack: 5000,
    flags: FL.PSH | FL.ACK,
    payload: labPkt,
  });
  const ip = ipv4Packet({ src: si, dst: di, proto: 6, ttl: 64, payload: tcp }),
    eth = ethFrame({ dst: MAC.gw, src: MAC.client, payload: ip });
  const ip2 = ipv4Packet({ src: si, dst: di, proto: 6, ttl: 63, payload: tcp }),
    eth2 = ethFrame({ dst: [0x00, 0x1b, 0x44, 0x20, 0x8c, 0x02], src: MAC.gw, payload: ip2 });
  const pr = parseFrame(eth2.bytes),
    chars = Array.from(m),
    t = m.length > 16 ? m.slice(0, 16) + '…' : m;
  const cu = c => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'),
    hx = hexs(B.slice(0, 10)) + (B.length > 10 ? ' …' : ''),
    pl = hexs(pk);
  const w = (a, i) => '0x' + rd16(a, i).toString(16).padStart(4, '0');
  const f32 = x => (x >>> 0).toString(16).padStart(8, '0');
  const showBytes = a => a;
  return [
    {
      n: 'Message',
      r: `Text: ${t}`,
      s: `${chars.length} characters`,
      e: 'You type a message. The network does not know about letters yet, only bytes.',
      b: [['Message', t, 'c0']],
    },
    {
      n: 'Encoding',
      r: 'Code points',
      s: `${chars.length} code points`,
      e: 'Each character has a Unicode code point. UTF-8 turns each code point into one to four bytes.',
      b: chars.slice(0, 5).map(c => [c, cu(c), 'c0']),
    },
    {
      n: 'Byte stream',
      r: hx,
      s: `${B.length} bytes`,
      e: 'The message is now a plain sequence of bytes. This is the only thing the lower layers carry.',
      b: [['Bytes', hx, 'c0']],
      bytes: B.slice(0, 32),
    },
    {
      n: 'Packetization',
      r: `Packet 1 of ${np}`,
      s: `${pk.length} payload bytes + 3`,
      e: 'The stream is cut into packets. Each gets a sequence number and length in its header and a CRC-8 trailer so the receiver can detect damage.',
      b: [
        ['Header', `seq 1 of ${np}, len ${pk.length}`, 'c3'],
        ['Payload', pl, 'c0'],
        ['CRC-8', hex(packetCrc(0, pk)), 'c3'],
      ],
      bytes: labPkt,
    },
    {
      n: 'Transport',
      r: 'TCP segment',
      s: `${tcp.length} bytes`,
      e: 'Ports say which application gets the data. The TCP checksum covers the header, the data and the IP addresses.',
      b: [
        ['Ports', '49732 → 80', 'c2'],
        ['Sequence', '1000', 'c2'],
        ['Checksum', w(tcp, 16), 'c2'],
        ['Data', 'packet 1', 'c0'],
      ],
      bytes: tcp,
    },
    {
      n: 'Network',
      r: 'IPv4 packet',
      s: `${ip.length} bytes`,
      e: 'Addresses say which machine the data is for. The TTL starts at 64 and the header has its own checksum.',
      b: [
        ['Addresses', '10.0.0.2 → 93.184.216.34', 'c1'],
        ['TTL', '64', 'c1'],
        ['Header checksum', w(ip, 10), 'c1'],
        ['Segment', 'TCP', 'c2'],
      ],
      bytes: ip,
    },
    {
      n: 'Link frame',
      r: 'Ethernet frame',
      s: `${eth.bytes.length} bytes`,
      e: 'The frame carries the packet across one link. It adds MAC addresses for the next hop, padding if needed and a CRC-32.',
      b: [
        ['MACs', `${macStr(MAC.client)} → ${macStr(MAC.gw)}`, 'c3'],
        ['IP packet', `${ip.length} bytes`, 'c1'],
        ['FCS', f32(crc32(eth.bytes.slice(0, -4))), 'c3'],
      ],
      bytes: eth.bytes,
    },
    {
      n: 'Transmission',
      r: 'Signal on the wire',
      s: `${eth.bytes.length * 8} bits`,
      e: 'The frame becomes bits travelling over the link as voltage, light or radio.',
      b: [['First bits', eth.bytes.slice(0, 4).map(bin8).join(' ') + ' …', 'c0']],
    },
    {
      n: 'Router',
      r: 'At a router',
      s: 'TTL 64 → 63',
      e: 'The router checks and strips the frame, lowers the TTL, recomputes the IP checksum and builds a brand-new frame with new MAC addresses. The IP addresses and TCP segment do not change.',
      b: [
        ['TTL', '64 → 63', 'c1'],
        ['IP checksum', `${w(ip, 10)} → ${w(ip2, 10)}`, 'c1'],
        [
          'New MACs',
          `${macStr(eth2.bytes.slice(6, 12))} → ${macStr(eth2.bytes.slice(0, 6))}`,
          'c3',
        ],
        ['New FCS', f32(crc32(eth2.bytes.slice(0, -4))), 'c3'],
      ],
      bytes: eth2.bytes,
    },
    {
      n: 'Receiver checks',
      r: 'Unwrapping',
      s: 'headers removed',
      e: 'Each layer verifies its own check, then strips its header and passes the rest up. If any check fails, the data is dropped and TCP’s timer will eventually trigger a retransmission.',
      b: pr.checks.map(c => [c.layer, c.ok ? 'valid' : 'BAD', c.ok ? 'c2' : 'c1']),
    },
    {
      n: 'Reassembly',
      r: `${np} of ${np} slots filled`,
      s: `${B.length} bytes`,
      e: 'Packets are placed into slots by sequence number, so out-of-order arrival does not matter.',
      b: [
        ['Slots', `${np} of ${np} filled`, 'c2'],
        ['Packet 1', pl, 'c2'],
      ],
    },
    {
      n: 'Decoding',
      r: 'UTF-8 decode',
      s: `${chars.length} characters`,
      e: 'The bytes are decoded back into code points and then into characters.',
      b: [
        ['Bytes', hx, 'c0'],
        ['Characters', t, 'c2'],
      ],
    },
    {
      n: 'Original',
      r: `Text: ${t}`,
      s: `${chars.length} characters`,
      e: 'The message arrives unchanged. Every layer did its job, and every layer only had to trust the one below it.',
      b: [['Message', t, 'c2']],
    },
  ].map(x => Object.assign({ bytes: null }, x, { bytes: x.bytes ? showBytes(x.bytes) : null }));
}

/* Register "End-to-end journey". The router calls mount(root) when the learner opens #/m/journey and calls the returned function (if any) when they leave. */
regMod({
  id: 'journey',
  group: 'learn',
  title: 'End-to-end journey',
  desc: 'Follow your own message from words to bytes, packets, frames and back, with the real bytes at every stage.',
  obj: [
    'Name every stage between keyboard and receiver.',
    'Inspect the bytes each layer produces.',
    'See what a router changes and what it leaves alone.',
  ],
  mount(root) {
    const JD = journeyData();
    let i = 0,
      timer = null;
    root.innerHTML =
      panel(
        'Stage timeline',
        '<p class="hint" id="jc"></p><div class="bar"><i id="jb"></i></div><div class="lpath" id="jt"></div>'
      ) +
      '<div class="panel"><h3 id="jn"></h3><p class="hint" id="jr"></p><div id="jv"></div><div id="jbytes"></div></div>' +
      '<div class="cols2"><div class="panel"><h3>Representation inspector</h3><ul class="ul" id="ji"></ul></div><div class="panel"><h3>What is happening</h3><p id="je" class="lead"></p></div></div>' +
      '<div class="foot"><div class="btnrow"><button class="btn ghost" id="jp">← Previous</button><button class="btn ghost" id="jpl">Play</button></div><button class="btn" id="jx">Next stage →</button></div>';
    const render = () => {
      const j = JD[i];
      $('#jt', root).innerHTML = JD.map(
        (x, k) =>
          `<button class="step${k < i ? ' done' : k === i ? ' cur' : ''}" data-j="${k}">${x.n}</button>`
      ).join('');
      $('#jc', root).textContent = `Stage ${i + 1} of ${JD.length}`;
      $('#jb', root).style.width = ((i + 1) / JD.length) * 100 + '%';
      $('#jn', root).textContent = j.n;
      $('#jr', root).textContent = j.r;
      $('#jv', root).innerHTML = kb(j.b);
      $('#jbytes', root).innerHTML = j.bytes
        ? hn(`${j.bytes.length} bytes${j.bytes.length > 64 ? ' (first 64 shown)' : ''}`) +
          chipRow(j.bytes.slice(0, 64).map(hex), () => 'c0')
        : '';
      $('#ji', root).innerHTML =
        `<li>Layer: ${j.n}</li><li>Representation: ${esc(j.r)}</li><li>Size: ${esc(j.s)}</li>`;
      $('#je', root).textContent = j.e;
      $('#jp', root).toggleAttribute('disabled', i === 0);
      $('#jx', root).toggleAttribute('disabled', i === JD.length - 1);
    };
    on(root, 'click', '[data-j]', (e, b) => {
      i = +b.dataset.j;
      render();
    });
    $('#jp', root).onclick = () => {
      if (i > 0) {
        i--;
        render();
      }
    };
    $('#jx', root).onclick = () => {
      if (i < JD.length - 1) {
        i++;
        render();
      }
    };
    $('#jpl', root).onclick = () => {
      clearInterval(timer);
      i = 0;
      render();
      timer = setInterval(
        () => {
          if (i >= JD.length - 1) clearInterval(timer);
          else {
            i++;
            render();
          }
        },
        REDUCE ? 40 : 1300
      );
    };
    render();
    // Cleanup: stop the auto-play timer if the learner leaves mid-play.
    return () => clearInterval(timer);
  },
});
