/**
 * learning module: Encapsulation stack
 *
 * Wrap and unwrap one message through nine steps, with options that damage it on the way.
 *
 * This file registers one learning module with regMod(). Its mount(root) function builds the screen inside
 * `root` and attaches event handlers; the function mount() returns (if any) is its cleanup, called by the router
 * when the learner leaves, so timers and listeners do not outlive the screen. The protocol logic lives in
 * ../../simulations/ and ../../core/; this file is the user interface for it.
 *
 * Imports:
 *   - ../../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): chipRow, hn, panel, sel, statRow, vd
 *   - ../../core/utils.js (tiny DOM, math and timing helpers): $, esc
 *   - ../../core/state.js (shared in-memory state): S
 *   - ../../core/checksums.js (parity-free error-detection math: Internet checksum, CRC-8, CRC-32): crc32
 *   - ../../core/encoding.js (bytes, hex, bits and UTF-8 helpers): bin8, hex
 *   - ../../simulations/encapsulation.js (builds the layered data unit used by the encapsulation module): buildStack
 *   - ../../simulations/dissector.js (packet dissector: bytes -> layers, fields and integrity checks): parseFrame
 *   - ../registry.js (learning-module registry and group definitions): regMod
 *
 * Exports: (none)
 *
 * Used by: (imported only for its side effects by app.js)
 */

import { crc32 } from '../../core/checksums.js';
import { bin8, hex } from '../../core/encoding.js';
import { S } from '../../core/state.js';
import { chipRow, hn, panel, sel, statRow, vd } from '../../core/ui-helpers.js';
import { $, esc } from '../../core/utils.js';
import { parseFrame } from '../../simulations/dissector.js';
import { buildStack } from '../../simulations/encapsulation.js';
import { regMod } from '../registry.js';

/* Register "Encapsulation stack". The router calls mount(root) when the learner opens #/m/encap and calls the returned function (if any) when they leave. */
regMod({
  id: 'encap',
  group: 'adv',
  title: 'Encapsulation stack',
  desc: 'Wrap your data in a TCP header, an IP header and an Ethernet frame with real bytes, then unwrap and verify it at the receiver.',
  obj: [
    'See exactly which bytes each layer adds.',
    'Compare the overhead of headers against the data they carry.',
    'Damage the packet and see which layer’s check catches it.',
  ],
  mount(root) {
    let step = 0;
    root.innerHTML =
      panel(
        'Data to send',
        `<div class="controls"><div class="field grow"><label for="en">Application data</label><input id="en" type="text" maxlength="200" value="${esc((S.msg || 'Hello').slice(0, 40))}" spellcheck="false"></div>
      <div class="field"><label for="ew">Damage</label>${sel(
        'ew',
        [
          ['none', 'None'],
          ['wire-data', 'Flip a data bit on the wire'],
          ['rtr-data', 'Flip a data bit inside a router'],
          ['rtr-ip', 'Flip a header bit inside a router'],
        ],
        'none'
      )}</div></div>`,
        'A flip on the wire is caught by the Ethernet FCS. A flip inside a router happens after the FCS was checked, so only the IP or TCP checksum can notice it.'
      ) +
      `<div class="panel"><div class="controls"><div class="btnrow"><button class="btn ghost sm" id="eprev">← Back</button><button class="btn" id="enext">Next step →</button><button class="btn ghost sm" id="ereset">Reset</button></div><span class="hint" id="ecnt"></span></div><div id="estack"></div></div><div id="edump"></div>`;
    const STEPS = [
      'Application data',
      'Add the TCP header',
      'Add the IP header',
      'Add the Ethernet header and FCS',
      'Bits on the wire',
      'Receiver checks the Ethernet FCS',
      'Receiver checks the IP header',
      'Receiver checks the TCP segment',
      'Data delivered to the application',
    ];
    const render = () => {
      const text = $('#en', root).value || ' ',
        st = buildStack(text),
        mode = $('#ew', root).value;
      let fr = st.eth.slice();
      if (mode !== 'none') {
        const idx = mode === 'rtr-ip' ? 14 + 8 : 14 + 20 + 20 + st.app.length - 1;
        fr[idx] ^= 1;
        if (mode.startsWith('rtr')) {
          const f = crc32(fr.slice(0, -4));
          fr = [...fr.slice(0, -4), f & 255, (f >>> 8) & 255, (f >>> 16) & 255, (f >>> 24) & 255];
        }
      }
      const pr = parseFrame(fr),
        chk = Object.fromEntries(pr.checks.map(c => [c.layer, c]));
      const nApp = st.app.length,
        hdrE = 14,
        hdrI = 20,
        hdrT = 20,
        fcs = 4;
      const parts = [
        ['Ethernet', hdrE, 'c3', 3],
        ['IP', hdrI, 'c1', 2],
        ['TCP', hdrT, 'c2', 1],
        ['Data', nApp, 'c0', 0],
      ];
      const visible = step <= 3 ? step : 3;
      const layers = [['Application data', nApp, 'c0']];
      if (step >= 1) layers.unshift(['TCP header', hdrT, 'c2']);
      if (step >= 2) layers.unshift(['IP header', hdrI, 'c1']);
      if (step >= 3) layers.unshift(['Ethernet header', hdrE, 'c3']);
      const seg = [],
        endSeg = [];
      if (step >= 3)
        endSeg.push(...(st.pad ? [['padding', st.pad, 'c4']] : []), ['FCS', fcs, 'c3']);
      const total =
        nApp +
        (step >= 1 ? hdrT : 0) +
        (step >= 2 ? hdrI : 0) +
        (step >= 3 ? hdrE + fcs + st.pad : 0);
      void parts;
      void visible;
      void seg;
      const bar = [...layers, ...endSeg]
        .map(
          ([n, b, c]) =>
            `<div class="seg ${c}" style="flex:${Math.max(b, 3)}" title="${n}: ${b} bytes"><b>${n}</b><small>${b} B</small></div>`
        )
        .join('');
      // unwrap state
      let bad = null;
      if (step >= 5) {
        if (!chk['Ethernet FCS'].ok) bad = 5;
      }
      if (!bad && step >= 6 && chk['IPv4 header checksum'] && !chk['IPv4 header checksum'].ok)
        bad = 6;
      if (!bad && step >= 7 && chk['TCP checksum'] && !chk['TCP checksum'].ok) bad = 7;
      const failed = bad !== null && step >= bad;
      $('#ecnt', root).textContent = `Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`;
      $('#estack', root).innerHTML =
        `<div class="segbar">${bar}</div>` +
        statRow([
          [nApp, 'data bytes'],
          [step >= 1 ? total : nApp, 'bytes at this stage'],
          [
            step >= 3
              ? hdrE + hdrI + hdrT + fcs + st.pad
              : step >= 2
                ? hdrI + hdrT
                : step >= 1
                  ? hdrT
                  : 0,
            'overhead bytes',
          ],
          [step >= 1 ? Math.round(((total - nApp) / total) * 100) + '%' : '0%', 'overhead share'],
        ]);
      let note = '';
      if (step === 0)
        note = vd(
          'info',
          'Start with your data.',
          `${nApp} bytes of UTF-8. TCP will number them, IP will address them, and Ethernet will frame them.`
        );
      else if (step === 1)
        note = vd(
          'info',
          'Transport layer.',
          'Ports say which application, the sequence number orders the bytes, and the checksum covers header, data and a pseudo-header with the IP addresses.'
        );
      else if (step === 2)
        note = vd(
          'info',
          'Network layer.',
          'Source and destination addresses, TTL and a header checksum. Routers read this layer.'
        );
      else if (step === 3)
        note =
          vd(
            'info',
            'Link layer.',
            `MAC addresses for the next hop, EtherType 0x0800, ${st.pad ? st.pad + ' padding bytes to reach the 46-byte minimum, ' : ''}and a CRC-32 trailer.`
          ) +
          (st.ip.length > 1500
            ? vd(
                'warn',
                'Too big for one frame.',
                'The IP packet exceeds the 1500-byte MTU, so TCP would really split this into segments of at most 1460 bytes.'
              )
            : '');
      else if (step === 4)
        note =
          vd(
            'info',
            'On the wire.',
            `Preamble and inter-frame gap add 20 more byte-times. The first bytes as bits: ${fr.slice(0, 6).map(bin8).join(' ')} …`
          ) +
          (mode === 'wire-data'
            ? vd('warn', 'A bit flipped in transit.', 'Noise on the cable changed one data bit.')
            : mode.startsWith('rtr')
              ? vd(
                  'warn',
                  'A bit flipped inside a router.',
                  'The router’s memory corrupted the packet after it checked the frame, then built a fresh FCS around the damage.'
                )
              : '');
      else if (step === 5)
        note = chk['Ethernet FCS'].ok
          ? vd(
              'ok',
              'FCS valid.',
              `Stored ${chk['Ethernet FCS'].detail}. The frame header and trailer are removed.`
            )
          : vd(
              'bad',
              'FCS check failed: frame discarded.',
              chk['Ethernet FCS'].detail + '. Nothing above this layer ever sees the damaged data.'
            );
      else if (step === 6)
        note = failed
          ? bad === 5
            ? vd('bad', 'Never reached.', 'The frame was already discarded.')
            : vd(
                'bad',
                'IP header checksum failed: packet discarded.',
                'A router or host drops it silently.'
              )
          : vd(
              'ok',
              'IP header checksum valid.',
              `The destination address matches this host. The IP header is removed. Protocol field: ${pr.f['ip.proto']} (TCP).`
            );
      else if (step === 7)
        note = failed
          ? bad === 7
            ? vd(
                'bad',
                'TCP checksum failed: segment discarded.',
                'The data was damaged after the link-layer checks. TCP drops the segment and the sender will retransmit after a timeout.'
              )
            : vd('bad', 'Never reached.', 'An earlier layer already discarded the data.')
          : vd(
              'ok',
              'TCP checksum valid.',
              'Header, pseudo-header and data add up correctly. The sequence number is in order, so the bytes can be delivered.'
            );
      else
        note = failed
          ? vd(
              'bad',
              'Nothing delivered.',
              'A check failed on the way up, so the application receives nothing and TCP will retransmit.'
            )
          : vd('ok', 'Delivered.', `The application reads: “${esc(text)}”.`);
      $('#estack', root).insertAdjacentHTML('beforeend', note);
      const show = step >= 3 ? fr : step >= 2 ? st.ip : step >= 1 ? st.tcp : st.app,
        lim = 96;
      const cls = i => {
        if (step >= 3) {
          if (i < 14) return 'c3';
          if (i >= show.length - 4) return 'c3';
          if (i < 34) return 'c1';
          if (i < 54) return 'c2';
          return i < 54 + nApp ? 'c0' : 'c4';
        }
        if (step >= 2) return i < 20 ? 'c1' : i < 40 ? 'c2' : 'c0';
        if (step >= 1) return i < 20 ? 'c2' : 'c0';
        return 'c0';
      };
      $('#edump', root).innerHTML = panel(
        'Bytes at this stage',
        chipRow(show.slice(0, lim).map(hex), cls) +
          (show.length > lim
            ? hn(`… and ${show.length - lim} more bytes (${show.length} in total)`)
            : '') +
          `<div class="legend"><span class="c3"><i></i>Ethernet</span><span class="c1"><i></i>IP</span><span class="c2"><i></i>TCP</span><span class="c0"><i></i>data</span><span class="c4"><i></i>padding</span></div>`
      );
      $('#eprev', root).toggleAttribute('disabled', step === 0);
      $('#enext', root).toggleAttribute('disabled', step >= STEPS.length - 1);
    };
    $('#enext', root).onclick = () => {
      step++;
      render();
    };
    $('#eprev', root).onclick = () => {
      step--;
      render();
    };
    $('#ereset', root).onclick = () => {
      step = 0;
      render();
    };
    $('#en', root).oninput = render;
    $('#ew', root).onchange = render;
    render();
  },
});
