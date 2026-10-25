/**
 * learning module: IP headers and fragments
 *
 * IPv4 header builder with a real checksum, IPv6 notation, fragmentation, and TTL/traceroute.
 *
 * This file registers one learning module with regMod(). Its mount(root) function builds the screen inside
 * `root` and attaches event handlers; the function mount() returns (if any) is its cleanup, called by the router
 * when the learner leaves, so timers and listeners do not outlive the screen. The protocol logic lives in
 * ../../simulations/ and ../../core/; this file is the user interface for it.
 *
 * Imports:
 *   - ../../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): chipRow, hdrDiagram, hn, panel, sel, tabset, tbl, vd
 *   - ../../core/utils.js (tiny DOM, math and timing helpers): $, $$, clamp
 *   - ../../core/addressing.js (IPv4/IPv6 address and CIDR calculations): b2ip, compressV6, expandV6, p4
 *   - ../../core/checksums.js (parity-free error-detection math: Internet checksum, CRC-8, CRC-32): cksum, sum16
 *   - ../../core/encoding.js (bytes, hex, bits and UTF-8 helpers): hex, rd16
 *   - ../../simulations/packet-builders.js (byte-accurate Ethernet / IPv4 / TCP / UDP builders): PROTO, ipv4Packet
 *   - ../registry.js (learning-module registry and group definitions): regMod
 *
 * Exports: (none)
 *
 * Used by: (imported only for its side effects by app.js)
 */

import { b2ip, compressV6, expandV6, p4 } from '../../core/addressing.js';
import { cksum, sum16 } from '../../core/checksums.js';
import { hex, rd16 } from '../../core/encoding.js';
import { chipRow, hdrDiagram, hn, panel, sel, tabset, tbl, vd } from '../../core/ui-helpers.js';
import { $, $$, clamp } from '../../core/utils.js';
import { ipv4Packet, PROTO } from '../../simulations/packet-builders.js';
import { regMod } from '../registry.js';

/* Register "IP headers and fragments". The router calls mount(root) when the learner opens #/m/ipheaders and calls the returned function (if any) when they leave. */
regMod({
  id: 'ipheaders',
  group: 'net',
  title: 'IP headers and fragments',
  desc: 'Build real IPv4 and IPv6 headers, verify the checksum, fragment a packet and watch TTL run out.',
  obj: [
    'Fill in the IPv4 header and see its bytes and header checksum.',
    'Change TTL like a router does and watch the checksum change.',
    'Fragment a packet across a small MTU and reassemble it, or lose a piece.',
  ],
  mount(root) {
    let h = {
      src: '10.0.0.2',
      dst: '10.0.1.9',
      ttl: 64,
      proto: 6,
      id: 0x1c46,
      df: true,
      mf: false,
      off: 0,
      plen: 1460,
    };
    root.innerHTML = '<div id="iptabs"></div>';
    const tabs = tabset(
      $('#iptabs', root),
      [
        {
          label: 'IPv4 header',
          render(p) {
            p.innerHTML =
              panel(
                'Fields',
                `<div class="controls">
          <div class="field"><label for="hs">Source</label><input id="hs" type="text" value="${h.src}" spellcheck="false"></div>
          <div class="field"><label for="hd">Destination</label><input id="hd" type="text" value="${h.dst}" spellcheck="false"></div>
          <div class="field"><label for="ht">TTL</label><input id="ht" type="number" min="0" max="255" value="${h.ttl}"></div>
          <div class="field"><label for="hp">Protocol</label>${sel(
            'hp',
            [
              [6, 'TCP (6)'],
              [17, 'UDP (17)'],
              [1, 'ICMP (1)'],
            ],
            h.proto
          )}</div>
          <div class="field"><label for="hl">Payload (bytes)</label><input id="hl" type="number" min="0" max="65515" value="${h.plen}"></div>
          <div class="field"><label for="hid">Identification</label><input id="hid" type="number" min="0" max="65535" value="${h.id}"></div></div>
          <label class="check"><input type="checkbox" id="hdf" ${h.df ? 'checked' : ''}> Don’t Fragment (DF)</label> <label class="check"><input type="checkbox" id="hmf" ${h.mf ? 'checked' : ''}> More Fragments (MF)</label>
          <div class="btnrow wrap"><button class="btn sm" id="hrt">Router hop: TTL − 1</button><button class="btn ghost sm" id="hbit">Flip a bit in transit</button><button class="btn ghost sm" id="hfix">Undo damage</button></div>`
              ) + '<div id="hout"></div>';
            let dmg = -1;
            const f = () => {
              h.src = $('#hs', p).value;
              h.dst = $('#hd', p).value;
              h.ttl = clamp(+$('#ht', p).value || 0, 0, 255);
              h.proto = +$('#hp', p).value;
              h.plen = clamp(+$('#hl', p).value || 0, 0, 65515);
              h.id = clamp(+$('#hid', p).value || 0, 0, 65535);
              h.df = $('#hdf', p).checked;
              h.mf = $('#hmf', p).checked;
              const s = p4(h.src),
                d = p4(h.dst);
              if (s === null || d === null) {
                $('#hout', p).innerHTML = vd(
                  'bad',
                  'Invalid address.',
                  'Use dotted decimal like 10.0.0.2.'
                );
                return;
              }
              const pk = ipv4Packet({
                src: s,
                dst: d,
                proto: h.proto,
                ttl: h.ttl,
                id: h.id,
                df: h.df,
                mf: h.mf,
                off: h.off,
                payload: Array(Math.min(h.plen, 60)).fill(0),
              });
              const hd = pk.slice(0, 20);
              hd[2] = ((20 + h.plen) >> 8) & 255;
              hd[3] = (20 + h.plen) & 255;
              hd[10] = 0;
              hd[11] = 0;
              const c = cksum(hd);
              hd[10] = c >> 8;
              hd[11] = c & 255;
              const rx = hd.slice();
              if (dmg >= 0) rx[dmg >> 3] ^= 0x80 >> (dmg & 7);
              const okc = sum16(rx) === 0xffff;
              const w = i => '0x' + rd16(rx, i).toString(16).padStart(4, '0');
              $('#hout', p).innerHTML =
                panel(
                  'Header layout (32 bits wide)',
                  hdrDiagram([
                    [
                      ['Version', 4, rx[0] >> 4],
                      ['IHL', 4, (rx[0] & 15) + ' words'],
                      ['DSCP/ECN', 8, rx[1]],
                      ['Total length', 16, rd16(rx, 2)],
                    ],
                    [
                      ['Identification', 16, w(4)],
                      [
                        'Flags',
                        3,
                        (rx[6] & 0x40 ? 'DF ' : '') + (rx[6] & 0x20 ? 'MF' : '') || '–',
                        'c3',
                      ],
                      ['Fragment offset', 13, rd16(rx, 6) & 0x1fff],
                    ],
                    [
                      ['TTL', 8, rx[8], 'c1'],
                      ['Protocol', 8, `${rx[9]} ${PROTO[rx[9]] || ''}`, 'c2'],
                      ['Header checksum', 16, w(10), okc ? 'c2' : 'c1'],
                    ],
                    [['Source address', 32, b2ip(rx, 12), 'c3']],
                    [['Destination address', 32, b2ip(rx, 16), 'c3']],
                  ])
                ) +
                panel(
                  'Bytes and verification',
                  hn(
                    'The 20 header bytes as sent' +
                      (dmg >= 0 ? ', with one bit flipped in transit' : '')
                  ) +
                    chipRow(rx.map(hex), i =>
                      dmg >= 0 && i === dmg >> 3
                        ? 'c1'
                        : i === 10 || i === 11
                          ? 'c2'
                          : i === 8
                            ? 'c1'
                            : 'c0'
                    ) +
                    (okc
                      ? vd(
                          'ok',
                          'Header checksum valid.',
                          'Summing all ten 16-bit words, with carries folded back in, gives 0xFFFF. A router would forward this packet.'
                        )
                      : vd(
                          'bad',
                          'Header checksum FAILED.',
                          `The words add up to 0x${sum16(rx).toString(16)} instead of 0xFFFF, so the router discards the packet.`
                        )) +
                    `<p class="hint">Computed checksum for the undamaged header: 0x${c.toString(16).padStart(4, '0')}. Every router lowers the TTL, so it must recompute this checksum at every hop.</p>`
                );
            };
            $$('input,select', p).forEach(e => {
              e.oninput = f;
              e.onchange = f;
            });
            $('#hrt', p).onclick = () => {
              $('#ht', p).value = Math.max(0, +$('#ht', p).value - 1);
              dmg = -1;
              f();
            };
            $('#hbit', p).onclick = () => {
              dmg = 64 + Math.floor(Math.random() * 32);
              f();
            };
            $('#hfix', p).onclick = () => {
              dmg = -1;
              f();
            };
            f();
          },
        },
        {
          label: 'IPv6 header',
          render(p) {
            p.innerHTML =
              panel(
                'IPv6 fixed header',
                `<div class="controls"><div class="field grow"><label for="v6s">Source</label><input id="v6s" type="text" value="2001:db8::2" spellcheck="false"></div>
          <div class="field grow"><label for="v6d">Destination</label><input id="v6d" type="text" value="2001:db8:1::9" spellcheck="false"></div>
          <div class="field"><label for="v6h">Hop limit</label><input id="v6h" type="number" min="0" max="255" value="64"></div>
          <div class="field"><label for="v6n">Next header</label>${sel(
            'v6n',
            [
              [6, 'TCP (6)'],
              [17, 'UDP (17)'],
              [58, 'ICMPv6 (58)'],
            ],
            6
          )}</div></div><div id="v6o"></div>`
              ) +
              panel(
                'IPv4 compared with IPv6',
                tbl(
                  ['Feature', 'IPv4', 'IPv6'],
                  [
                    ['Address size', '32 bits', '128 bits'],
                    ['Base header', '20 bytes plus options', 'fixed 40 bytes'],
                    [
                      'Header checksum',
                      'yes, recomputed every hop',
                      'none (link and transport layers check)',
                    ],
                    ['Fragmentation', 'routers may fragment', 'only the sender fragments'],
                    ['TTL field', 'TTL', 'Hop limit'],
                    ['Typical notation', '192.168.1.10', '2001:db8::2'],
                  ]
                )
              );
            const f = () => {
              const s = expandV6($('#v6s', p).value),
                d = expandV6($('#v6d', p).value);
              if (!s || !d) {
                $('#v6o', p).innerHTML = vd(
                  'bad',
                  'Invalid IPv6 address.',
                  'Use up to eight groups of hex digits and at most one “::”.'
                );
                return;
              }
              $('#v6o', p).innerHTML =
                hdrDiagram([
                  [
                    ['Version', 4, 6],
                    ['Traffic class', 8, 0],
                    ['Flow label', 20, '0x00000'],
                  ],
                  [
                    ['Payload length', 16, 1460],
                    ['Next header', 8, $('#v6n', p).value, 'c2'],
                    ['Hop limit', 8, $('#v6h', p).value, 'c1'],
                  ],
                  [['Source address (128 bits)', 32, s.join(':'), 'c3']],
                  [['Destination address (128 bits)', 32, d.join(':'), 'c3']],
                ]) +
                `<p class="hint">Compressed forms: source <code>${compressV6(s)}</code>, destination <code>${compressV6(d)}</code>. A leading run of zeros in a group can be dropped, and one run of all-zero groups becomes “::”.</p>`;
            };
            $$('input,select', p).forEach(e => {
              e.oninput = f;
              e.onchange = f;
            });
            f();
          },
        },
        {
          label: 'Fragmentation',
          render(p) {
            p.innerHTML = panel(
              'Send a large packet over a small link',
              `<div class="controls"><div class="field"><label for="fz">Packet size (bytes, header included)</label><input id="fz" type="number" min="21" max="65535" value="4000"></div>
          <div class="field"><label for="fm">Link MTU (bytes)</label><input id="fm" type="number" min="68" max="9000" value="1500"></div>
          <div class="field"><label for="fdf">Don’t Fragment</label>${sel(
            'fdf',
            [
              [0, 'Off'],
              [1, 'On'],
            ],
            0
          )}</div>
          <div class="field"><label for="fdrop">Lose a fragment</label>${sel('fdrop', [[0, 'None']], 0)}</div></div><div id="fo"></div>`
            );
            const f = () => {
              const z = +$('#fz', p).value,
                m = +$('#fm', p).value,
                df = +$('#fdf', p).value;
              if (!(z > 20 && m >= 68)) {
                $('#fo', p).innerHTML = vd(
                  'bad',
                  'Check the numbers.',
                  'Packet size must exceed 20 bytes and the MTU must be at least 68.'
                );
                return;
              }
              if (z <= m) {
                $('#fo', p).innerHTML = vd(
                  'ok',
                  'No fragmentation needed.',
                  `The ${z}-byte packet fits within the ${m}-byte MTU.`
                );
                return;
              }
              if (df) {
                $('#fo', p).innerHTML = vd(
                  'bad',
                  'Dropped.',
                  `The packet is larger than the MTU and DF is set, so the router discards it and returns an ICMP “fragmentation needed” message. Path MTU discovery uses exactly this reply.`
                );
                return;
              }
              const d = z - 20,
                mx = Math.floor((m - 20) / 8) * 8,
                fr = [];
              let o = 0;
              while (o < d) {
                const l = Math.min(mx, d - o);
                fr.push({ off: o / 8, len: l, mf: o + l < d, tot: l + 20 });
                o += l;
              }
              const fd = $('#fdrop', p),
                cur = +fd.value;
              if (fd.options.length !== fr.length + 1)
                fd.innerHTML =
                  '<option value="0">None</option>' +
                  fr.map((_, i) => `<option value="${i + 1}">Fragment ${i + 1}</option>`).join('');
              const lost = fd.options.length === fr.length + 1 ? +fd.value : 0;
              void cur;
              const total = fr.reduce((s, x) => s + x.len, 0);
              $('#fo', p).innerHTML =
                hn(
                  `${fr.length} fragments, each with the same identification. All but the last carry a multiple of 8 data bytes (${mx}).`
                ) +
                `<div class="fragstrip">${fr.map((x, i) => `<div class="frag c${i % 4}${lost === i + 1 ? ' lostf' : ''}" style="flex:${x.len}"><b>#${i + 1}</b><small>${x.len} B</small></div>`).join('')}</div>` +
                tbl(
                  ['Fragment', 'Total length', 'Data bytes', 'Offset (8-byte units)', 'MF flag'],
                  fr.map((x, i) => [i + 1, x.tot, x.len, x.off, x.mf ? 1 : 0])
                ) +
                (lost
                  ? vd(
                      'bad',
                      'Reassembly fails.',
                      `Fragment ${lost} never arrived. The receiver holds the others until a timer expires, then discards them all, so the whole ${z}-byte packet is lost. This is why fragmentation hurts reliability.`
                    )
                  : vd(
                      'ok',
                      'Reassembly succeeds.',
                      `The receiver orders fragments by offset, checks that the one with MF = 0 has arrived and that ${total} data bytes are contiguous, then rebuilds the original ${z}-byte packet.`
                    ));
            };
            $$('input,select', p).forEach(e => {
              e.oninput = f;
              e.onchange = f;
            });
            f();
          },
        },
        {
          label: 'TTL and traceroute',
          render(p) {
            const R = [
              ['10.0.1.1', 'gateway.lan'],
              ['172.16.8.1', 'edge1.isp.net'],
              ['198.51.100.9', 'core2.isp.net'],
              ['203.0.113.17', 'peer.ix.net'],
              ['192.0.2.33', 'edge.dest.net'],
              ['93.184.216.34', 'destination'],
            ];
            p.innerHTML =
              panel(
                'Hop limit in action',
                `<div class="controls"><div class="field"><label for="tt">Initial TTL</label>${sel(
                  'tt',
                  [1, 2, 3, 4, 5, 8, 64].map(x => [x, x]),
                  4
                )}</div><div class="field"><label for="th">Routers on the path</label>${sel(
                  'th',
                  [2, 3, 4, 5].map(x => [x, x]),
                  4
                )}</div></div><div id="to"></div>`
              ) +
              panel(
                'Traceroute',
                `<p class="hint">Traceroute sends probes with TTL 1, 2, 3 … Each router that drops a probe replies “time exceeded”, which reveals the path.</p><div id="tr"></div>`
              );
            const f = () => {
              const ttl = +$('#tt', p).value,
                n = +$('#th', p).value;
              let t = ttl,
                rows = [],
                died = -1;
              for (let i = 0; i < n; i++) {
                t--;
                rows.push([`Router ${i + 1}`, R[i][0], t, t <= 0 ? 'dropped' : 'forwarded']);
                if (t <= 0) {
                  died = i;
                  break;
                }
              }
              $('#to', p).innerHTML =
                `<div class="ttlmeter">${Array.from({ length: n + 1 }, (_, i) => `<div class="hop ${died === i ? 'dead' : died >= 0 && i > died ? 'off' : ''}"><b>${i === 0 ? 'Sender' : i === n ? 'Destination' : 'R' + i}</b><small>TTL ${i === 0 ? ttl : died >= 0 && i > died + 0 ? '–' : Math.max(0, ttl - i)}</small></div>`).join('')}</div>` +
                tbl(['Hop', 'Address', 'TTL after decrement', 'Action'], rows) +
                (died >= 0
                  ? vd(
                      'bad',
                      `Dropped at router ${died + 1}.`,
                      `The TTL reached 0, so ${R[died][0]} discards the packet and sends an ICMP “time exceeded” message back. This stops packets circling forever in a routing loop.`
                    )
                  : vd(
                      'ok',
                      'Delivered.',
                      `The packet arrived with TTL ${Math.max(0, ttl - n)} left.`
                    ));
              const tr = [];
              for (let k = 1; k <= n + 1; k++)
                tr.push([
                  k,
                  k <= n ? R[k - 1][0] : R[5][0],
                  k <= n ? R[k - 1][1] : R[5][1],
                  `${4 + k * 6 + ((k * 37) % 9)} ms`,
                  k <= n ? 'time exceeded (type 11)' : 'echo reply',
                ]);
              $('#tr', p).innerHTML = tbl(
                ['TTL', 'Replied from', 'Name', 'Round trip', 'Reply'],
                tr
              );
            };
            $$('select', p).forEach(e => {
              e.onchange = f;
            });
            f();
          },
        },
      ],
      0
    );
    return () => tabs.destroy();
  },
});
