/**
 * learning module: TCP and UDP
 *
 * Side-by-side TCP and UDP comparison, a segment builder, and a "pick the protocol" scenario game.
 *
 * This file registers one learning module with regMod(). Its mount(root) function builds the screen inside
 * `root` and attaches event handlers; the function mount() returns (if any) is its cleanup, called by the router
 * when the learner leaves, so timers and listeners do not outlive the screen. The protocol logic lives in
 * ../../simulations/ and ../../core/; this file is the user interface for it.
 *
 * Imports:
 *   - ../../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): chipRow, hdrDiagram, hn, on, panel, sel, statRow, tabset, tbl, vd
 *   - ../../core/utils.js (tiny DOM, math and timing helpers): $, $$, clamp
 *   - ../../core/addressing.js (IPv4/IPv6 address and CIDR calculations): p4
 *   - ../../core/encoding.js (bytes, hex, bits and UTF-8 helpers): bytesOf, hex, rd16, rd32
 *   - ../../core/checksums.js (parity-free error-detection math: Internet checksum, CRC-8, CRC-32): sum16
 *   - ../../simulations/transport.js (TCP/UDP header layouts, example scenarios and handshake steps): SCENARIOS, TCP_HDR, UDP_HDR, blankHdr
 *   - ../../simulations/packet-builders.js (byte-accurate Ethernet / IPv4 / TCP / UDP builders): FL, flagNames, pseudoHdr, tcpSegment, udpDatagram
 *   - ../registry.js (learning-module registry and group definitions): regMod
 *
 * Exports: (none)
 *
 * Used by: (imported only for its side effects by app.js)
 */

import { p4 } from '../../core/addressing.js';
import { sum16 } from '../../core/checksums.js';
import { bytesOf, hex, rd16, rd32 } from '../../core/encoding.js';
import {
  chipRow,
  hdrDiagram,
  hn,
  on,
  panel,
  sel,
  statRow,
  tabset,
  tbl,
  vd,
} from '../../core/ui-helpers.js';
import { $, $$, clamp } from '../../core/utils.js';
import {
  FL,
  flagNames,
  pseudoHdr,
  tcpSegment,
  udpDatagram,
} from '../../simulations/packet-builders.js';
import { blankHdr, SCENARIOS, TCP_HDR, UDP_HDR } from '../../simulations/transport.js';
import { regMod } from '../registry.js';

/* Register "TCP and UDP". The router calls mount(root) when the learner opens #/m/tcpudp and calls the returned function (if any) when they leave. */
regMod({
  id: 'tcpudp',
  group: 'trn',
  title: 'TCP and UDP',
  desc: 'Compare segments and datagrams, build real headers with checksums, and pick the right protocol.',
  obj: [
    'Spot the differences between the TCP and UDP headers.',
    'Build a segment and see the checksum over the pseudo-header and payload.',
    'Choose the right protocol for common applications.',
  ],
  mount(root) {
    root.innerHTML = '<div id="tutabs"></div>';
    const tabs = tabset(
      $('#tutabs', root),
      [
        {
          label: 'Compare',
          render(p) {
            p.innerHTML =
              panel(
                'At a glance',
                tbl(
                  ['Feature', 'TCP', 'UDP'],
                  [
                    ['Connection', 'Yes: three-way handshake first', 'None: just send'],
                    ['Delivery', 'Acknowledged and retransmitted', 'Best effort, may be lost'],
                    ['Ordering', 'Guaranteed by sequence numbers', 'Not guaranteed'],
                    ['Header size', '20 bytes or more', '8 bytes'],
                    ['Flow control', 'Receiver window', 'None'],
                    ['Congestion control', 'Yes (slow start, AIMD)', 'None built in'],
                    ['Data model', 'Continuous byte stream', 'Separate datagrams with boundaries'],
                    [
                      'Typical uses',
                      'Web, email, SSH, file transfer',
                      'DNS, voice and video, games, QUIC',
                    ],
                  ]
                )
              ) +
              `<div class="cols2"><div class="panel"><h3>TCP header (20 bytes)</h3>${hdrDiagram(blankHdr(TCP_HDR, ['src', 'dst', 'seq', 'ack', 'hl', 'flags', 'win', 'sum']).map(r => r.map(x => [x[0], x[1], '', x[3]])))}</div>
          <div class="panel"><h3>UDP header (8 bytes)</h3>${hdrDiagram(blankHdr(UDP_HDR, []).map(r => r.map(x => [x[0], x[1], '', 'c0'])))}<p class="hint">UDP leaves out everything about connections, reliability and flow, so it adds almost nothing to the data.</p></div></div>`;
          },
        },
        {
          label: 'Build a segment',
          render(p) {
            p.innerHTML =
              panel(
                'Fields',
                `<div class="controls"><div class="field"><label for="tp">Protocol</label>${sel(
                  'tp',
                  [
                    ['tcp', 'TCP'],
                    ['udp', 'UDP'],
                  ],
                  'tcp'
                )}</div>
          <div class="field"><label for="tsi">Source IP</label><input id="tsi" type="text" value="10.0.0.2"></div><div class="field"><label for="tdi">Destination IP</label><input id="tdi" type="text" value="93.184.216.34"></div>
          <div class="field"><label for="tsp">Source port</label><input id="tsp" type="number" min="0" max="65535" value="49732"></div><div class="field"><label for="tdp">Destination port</label><input id="tdp" type="number" min="0" max="65535" value="80"></div></div>
          <div class="controls tcponly"><div class="field"><label for="tsq">Sequence number</label><input id="tsq" type="number" min="0" value="1000"></div><div class="field"><label for="tak">Acknowledgment number</label><input id="tak" type="number" min="0" value="5000"></div>
          <div class="field"><label for="twn">Window</label><input id="twn" type="number" min="0" max="65535" value="64240"></div></div>
          <div class="tcponly"><span class="hint">Flags:</span> ${['SYN', 'ACK', 'PSH', 'FIN', 'RST'].map(f => `<label class="check"><input type="checkbox" class="tf" value="${f}" ${f === 'ACK' || f === 'PSH' ? 'checked' : ''}> ${f}</label>`).join(' ')}</div>
          <div class="field"><label for="tpl">Payload text</label><input id="tpl" type="text" value="GET / HTTP/1.1" spellcheck="false"></div>
          <div class="btnrow wrap"><button class="btn ghost sm" id="tcor">Corrupt a payload bit</button><button class="btn ghost sm" id="tfix">Undo damage</button></div>`
              ) + '<div id="tout"></div>';
            let dmg = false;
            const f = () => {
              const udp = $('#tp', p).value === 'udp',
                si = p4($('#tsi', p).value),
                di = p4($('#tdi', p).value),
                sp = clamp(+$('#tsp', p).value || 0, 0, 65535),
                dp = clamp(+$('#tdp', p).value || 0, 0, 65535);
              $$('.tcponly', p).forEach(e => {
                e.hidden = udp;
              });
              if (si === null || di === null) {
                $('#tout', p).innerHTML = vd(
                  'bad',
                  'Invalid IP address.',
                  'The checksum needs both addresses.'
                );
                return;
              }
              const payload = bytesOf($('#tpl', p).value).slice(0, 120),
                fl = $$('.tf:checked', p).reduce((a, c) => a | FL[c.value], 0);
              const seg = udp
                ? udpDatagram({ src: si, dst: di, sp, dp, payload })
                : tcpSegment({
                    src: si,
                    dst: di,
                    sp,
                    dp,
                    seq: +$('#tsq', p).value || 0,
                    ack: +$('#tak', p).value || 0,
                    flags: fl,
                    win: clamp(+$('#twn', p).value || 0, 0, 65535),
                    payload,
                  });
              const rx = seg.slice();
              if (dmg && payload.length) rx[rx.length - 1] ^= 1;
              const okc = sum16([...pseudoHdr(si, di, udp ? 17 : 6, rx.length), ...rx]) === 0xffff,
                hl = udp ? 8 : 20,
                w = i => '0x' + rd16(rx, i).toString(16).padStart(4, '0');
              const diag = udp
                ? hdrDiagram([
                    [
                      ['Source port', 16, sp],
                      ['Destination port', 16, dp],
                    ],
                    [
                      ['Length', 16, rd16(rx, 4)],
                      ['Checksum', 16, w(6), okc ? 'c2' : 'c1'],
                    ],
                  ])
                : hdrDiagram([
                    [
                      ['Source port', 16, sp],
                      ['Destination port', 16, dp],
                    ],
                    [['Sequence number', 32, rd32(rx, 4), 'c3']],
                    [['Acknowledgment number', 32, rd32(rx, 8), 'c3']],
                    [
                      ['Offset', 4, rx[12] >> 4],
                      ['Reserved', 3, 0],
                      ['Flags', 9, flagNames(rx[13]).join(' ') || '–', 'c2'],
                      ['Window', 16, rd16(rx, 14), 'c1'],
                    ],
                    [
                      ['Checksum', 16, w(16), okc ? 'c2' : 'c1'],
                      ['Urgent pointer', 16, 0],
                    ],
                  ]);
              $('#tout', p).innerHTML =
                panel('Header', diag) +
                panel(
                  'Bytes and checksum',
                  hn('Header bytes in blue shades, checksum in green, payload in grey') +
                    chipRow(rx.map(hex), i =>
                      i >= hl
                        ? 'c4'
                        : (udp ? i === 6 || i === 7 : i === 16 || i === 17)
                          ? 'c2'
                          : 'c0'
                    ) +
                    statRow([
                      [hl, 'header bytes'],
                      [payload.length, 'payload bytes'],
                      [rx.length, 'segment bytes'],
                      [Math.round((hl / rx.length) * 100) + '%', 'header share'],
                    ]) +
                    (okc
                      ? vd(
                          'ok',
                          'Checksum valid.',
                          'The receiver adds a pseudo-header (source IP, destination IP, protocol, length), the header and the payload. A result of 0xFFFF means nothing changed.'
                        )
                      : vd(
                          'bad',
                          'Checksum FAILED.',
                          'One payload bit changed in transit. TCP would silently drop the segment and the sender would retransmit it; UDP would drop the datagram with no retransmission.'
                        ))
                );
            };
            $$('input,select', p).forEach(e => {
              e.oninput = f;
              e.onchange = f;
            });
            $('#tcor', p).onclick = () => {
              dmg = true;
              f();
            };
            $('#tfix', p).onclick = () => {
              dmg = false;
              f();
            };
            f();
          },
        },
        {
          label: 'Pick the protocol',
          render(p) {
            let i = 0,
              score = 0,
              answered = false;
            p.innerHTML = panel(
              'Which protocol fits?',
              '<div id="pq"></div><div id="pf"></div>',
              'Eight real-world situations. Choose the transport protocol you would use.'
            );
            const show = () => {
              if (i >= SCENARIOS.length) {
                $('#pq', p).innerHTML =
                  `<div class="quizq"><p class="big">${score} of ${SCENARIOS.length} correct</p></div><button class="btn" id="pr">Try again</button>`;
                $('#pf', p).innerHTML = '';
                $('#pr', p).onclick = () => {
                  i = 0;
                  score = 0;
                  show();
                };
                return;
              }
              answered = false;
              $('#pq', p).innerHTML =
                `<div class="quizq"><small>Question ${i + 1} of ${SCENARIOS.length}</small><p class="big">${SCENARIOS[i][0]}</p><div class="btnrow"><button class="btn" data-a="TCP">TCP</button><button class="btn" data-a="UDP">UDP</button></div></div>`;
              $('#pf', p).innerHTML = '';
            };
            on(p, 'click', '[data-a]', (e, b) => {
              if (answered) return;
              answered = true;
              const ok = b.dataset.a === SCENARIOS[i][1];
              if (ok) score++;
              $('#pf', p).innerHTML =
                (ok
                  ? vd('ok', 'Correct.', SCENARIOS[i][2])
                  : vd('bad', `Not quite, it is ${SCENARIOS[i][1]}.`, SCENARIOS[i][2])) +
                '<div class="btnrow"><button class="btn" id="pn">Next</button></div>';
              $('#pn', p).onclick = () => {
                i++;
                show();
              };
            });
            show();
          },
        },
      ],
      0
    );
    return () => tabs.destroy();
  },
});
