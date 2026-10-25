/**
 * learning module: Framing and stuffing
 *
 * Frame boundaries: length count, byte stuffing and bit stuffing, with a receiver that recovers the frames.
 *
 * This file registers one learning module with regMod(). Its mount(root) function builds the screen inside
 * `root` and attaches event handlers; the function mount() returns (if any) is its cleanup, called by the router
 * when the learner leaves, so timers and listeners do not outlive the screen. The protocol logic lives in
 * ../../simulations/ and ../../core/; this file is the user interface for it.
 *
 * Imports:
 *   - ../../core/encoding.js (bytes, hex, bits and UTF-8 helpers): bitsOf, hex, hexs, msgBytes, parseHex
 *   - ../../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): bitRow, chipRow, hn, on, panel, statRow, tabset, tbl, vd
 *   - ../../core/utils.js (tiny DOM, math and timing helpers): $
 *   - ../../simulations/framing.js (byte stuffing and bit stuffing (data-link framing)): ESC, FLAG, FLAGBITS, bitScan, bitStuff, byteScan, byteStuff
 *   - ../registry.js (learning-module registry and group definitions): regMod
 *
 * Exports: (none)
 *
 * Used by: (imported only for its side effects by app.js)
 */

import { bitsOf, hex, hexs, msgBytes, parseHex } from '../../core/encoding.js';
import { bitRow, chipRow, hn, on, panel, statRow, tabset, tbl, vd } from '../../core/ui-helpers.js';
import { $ } from '../../core/utils.js';
import {
  bitScan,
  bitStuff,
  byteScan,
  byteStuff,
  ESC,
  FLAG,
  FLAGBITS,
} from '../../simulations/framing.js';
import { regMod } from '../registry.js';

/* Register "Framing and stuffing". The router calls mount(root) when the learner opens #/m/framing and calls the returned function (if any) when they leave. */
regMod({
  id: 'framing',
  group: 'link',
  title: 'Framing and stuffing',
  desc: 'Mark where one frame ends and the next begins, then see what happens when a boundary is damaged.',
  obj: [
    'Compare length-count, byte-stuffing and bit-stuffing framing.',
    'See exactly which bytes or bits are added to protect the data.',
    'Learn why flag-based methods recover after an error and length counts do not.',
  ],
  mount(root) {
    let data = msgBytes().slice(0, 10),
      damage = false,
      cur = 0,
      tabs;
    const OTHER = [0x4f, 0x4b]; // second frame in the stream: "OK"
    root.innerHTML =
      panel(
        'Frame data',
        `
      <div class="controls"><div class="field grow"><label for="fdata">Data bytes (hex)</label><input id="fdata" type="text" spellcheck="false" autocomplete="off"></div></div>
      <div class="btnrow wrap"><button class="btn ghost sm" data-add="lab">Use my lab message</button><button class="btn ghost sm" data-add="7e">Add flag 7E</button><button class="btn ghost sm" data-add="7d">Add escape 7D</button><button class="btn ghost sm" data-add="ff">Add FF (eight 1s)</button></div>
      <label class="check"><input type="checkbox" id="fdmg"> Damage the first boundary marker of frame 1</label>
      <div id="ferr"></div>`,
        'Two frames are sent back to back: your data, then the bytes 4F 4B ("OK"). The receiver must split the stream again.'
      ) + '<div id="ftabs"></div><div id="fcmp"></div>';
    const inp = $('#fdata', root),
      setInp = () => {
        inp.value = hexs(data);
      };
    setInp();
    const rerender = () => {
      $('#ferr', root).innerHTML = '';
      tabs.select(cur);
      compare();
    };
    inp.oninput = () => {
      const v = parseHex(inp.value);
      if (v === null || v.length > 24) {
        $('#ferr', root).innerHTML = vd(
          'warn',
          'Check the hex.',
          'Use pairs of hex digits like 48 65 6c, up to 24 bytes.'
        );
        return;
      }
      data = v.length ? v : [0x48];
      rerender();
    };
    on(root, 'click', '[data-add]', (e, b) => {
      const k = b.dataset.add;
      if (k === 'lab') data = msgBytes().slice(0, 10);
      else if (data.length < 24) data = [...data, parseInt(k, 16)];
      setInp();
      rerender();
    });
    $('#fdmg', root).onchange = e => {
      damage = e.target.checked;
      rerender();
    };

    const ok = (got, want) =>
      got && want && got.length === want.length && got.every((b, i) => b === want[i]);
    const resultTable = (frames, want) =>
      tbl(
        ['Frame', 'Sent', 'Receiver got', 'Result'],
        want.map((w, i) => {
          const g = frames[i];
          const good = ok(g, w);
          return [
            i + 1,
            hexs(w),
            g ? (g.length ? hexs(g) : '(empty)') : '(nothing)',
            { h: `<span class="pill ${good ? 'live' : 'bad'}">${good ? 'intact' : 'lost'}</span>` },
          ];
        })
      );
    const verdictFor = (frames, want) => {
      const got = want.map((w, i) => ok(frames[i], w));
      if (got.every(Boolean))
        return vd('ok', 'Both frames arrived intact.', 'The receiver found every boundary.');
      if (!got[0] && got[1])
        return vd(
          'ok',
          'Frame 1 was lost, but the receiver recovered.',
          'It found the next flag and resynchronised, so frame 2 is fine.'
        );
      return vd(
        'bad',
        'The receiver lost synchronisation.',
        'Everything after the damaged boundary is misread.'
      );
    };
    const frameLen = () => {
      const A = [data.length, ...data],
        Bf = [OTHER.length, ...OTHER];
      const sent = [...A, ...Bf],
        rcv = sent.slice();
      if (damage) rcv[0] ^= 0x01;
      const frames = [];
      let i = 0;
      while (i < rcv.length) {
        const n = rcv[i];
        frames.push(rcv.slice(i + 1, i + 1 + n));
        i += 1 + n;
      }
      return { sent, rcv, frames, A, Bf };
    };
    const frameByte = () => {
      const sA = byteStuff(data),
        sB = byteStuff(OTHER),
        sent = [FLAG, ...sA, FLAG, ...sB, FLAG],
        rcv = sent.slice();
      if (damage) rcv[0] = 0x7f;
      return { sA, sB, sent, rcv, frames: byteScan(rcv) };
    };
    const frameBit = () => {
      const dA = bitsOf(data),
        dB = bitsOf(OTHER),
        sA = bitStuff(dA),
        sB = bitStuff(dB);
      const sent = FLAGBITS + sA + FLAGBITS + sB + FLAGBITS;
      let rcv = sent;
      if (damage) rcv = (rcv[0] === '0' ? '1' : '0') + rcv.slice(1);
      return { dA, sA, sB, sent, rcv, frames: bitScan(rcv) };
    };
    const compare = () => {
      const L = frameLen(),
        B = frameByte(),
        T = frameBit(),
        n = data.length;
      const bitOut = T.sA.length;
      $('#fcmp', root).innerHTML = panel(
        'Side by side',
        tbl(
          ['Method', 'Bytes sent for frame 1', 'Overhead', 'After a damaged boundary', 'Trade-off'],
          [
            [
              'Length count',
              n + 1,
              '+1 byte',
              'Loses sync for the rest of the stream',
              'Cheapest, but one bad count ruins everything after it',
            ],
            [
              'Byte stuffing',
              B.sA.length + 2,
              `+${B.sA.length - n + 2} bytes`,
              'Resyncs at the next flag',
              'Worst case doubles the data size',
            ],
            [
              'Bit stuffing',
              (bitOut + 16) / 8 + ' (' + (bitOut + 16) + ' bits)',
              `+${bitOut - n * 8 + 16} bits`,
              'Resyncs at the next flag',
              'About 1 extra bit per 5 ones, any bit length',
            ],
          ]
        )
      );
    };

    tabs = tabset(
      $('#ftabs', root),
      [
        {
          label: 'Length count',
          render(p) {
            cur = 0;
            const L = frameLen();
            p.innerHTML =
              hn(
                'A length field at the start says how many data bytes follow. No flag is needed, so the data can be anything.'
              ) +
              hn('Sent stream') +
              chipRow(L.sent.map(hex), i =>
                i === 0 || i === L.A.length ? 'c3' : i < L.A.length ? 'c0' : 'c4'
              ) +
              hn(
                `Received stream${damage ? ' (the first length field has one bit flipped)' : ''}`
              ) +
              chipRow(L.rcv.map(hex), i =>
                damage && i === 0
                  ? 'c1'
                  : i === 0 || i === L.A.length
                    ? 'c3'
                    : i < L.A.length
                      ? 'c0'
                      : 'c4'
              ) +
              statRow([
                [data.length, 'data bytes'],
                [data.length + 1, 'bytes sent'],
                ['+1', 'overhead'],
              ]) +
              resultTable(L.frames, [data, OTHER]) +
              verdictFor(L.frames, [data, OTHER]);
          },
        },
        {
          label: 'Byte stuffing',
          render(p) {
            cur = 1;
            const B = frameByte(),
              esc_ = B.sA.length - data.length;
            p.innerHTML =
              hn(
                'Flag bytes (7E) mark the edges. If the data itself contains a flag or an escape (7D), an escape byte is inserted and the next byte is XORed with 20, so a flag never appears inside the data.'
              ) +
              hn('Before stuffing') +
              chipRow(data.map(hex), i => (data[i] === FLAG || data[i] === ESC ? 'c3' : 'c0')) +
              hn('Sent stream: flag, frame 1, flag, frame 2, flag') +
              chipRow(B.sent.map(hex), (i, x) => {
                let c = 'c0';
                if (i === 0 || i === B.sA.length + 1 || i === B.sent.length - 1) return 'c2';
                if (i > B.sA.length + 1) return 'c4';
                if (x === ESC) return 'c1';
                const prev = B.sent[i - 1];
                return prev === ESC ? 'c1' : c;
              }) +
              (damage
                ? hn('Received: the first flag arrives as 7F') +
                  chipRow(B.rcv.map(hex), (i, x) => (i === 0 ? 'c1' : 'c0'))
                : '') +
              statRow([
                [data.length, 'bytes in'],
                [B.sA.length + 2, 'bytes out (with flags)'],
                [esc_, 'escapes added'],
              ]) +
              resultTable(B.frames, [data, OTHER]) +
              verdictFor(B.frames, [data, OTHER]);
          },
        },
        {
          label: 'Bit stuffing',
          render(p) {
            cur = 2;
            const T = frameBit(),
              added = T.sA.length - T.dA.length;
            const sentFr = T.sent;
            const cls = i => {
              const a = FLAGBITS.length,
                b = a + T.sA.length;
              if (i < a || (i >= b && i < b + a) || i >= sentFr.length - a) return 'c2';
              if (i > b + a) return 'c4';
              return 'c0';
            };
            const stuffIdx = new Set();
            {
              let run = 0;
              for (let i = 0; i < T.sA.length; i++) {
                if (run === 5) {
                  stuffIdx.add(8 + i);
                  run = 0;
                  continue;
                }
                run = T.sA[i] === '1' ? run + 1 : 0;
              }
            }
            p.innerHTML =
              hn(
                'HDLC style: the flag is 01111110. After five consecutive 1s the sender inserts a 0, so six 1s in a row can never appear inside the data. The receiver deletes the 0 that follows five 1s.'
              ) +
              hn('Before stuffing (frame 1)') +
              bitRow(T.dA, () => 'c0') +
              hn('Sent: flag, frame 1 with stuffed zeros highlighted, flag, frame 2, flag') +
              bitRow(sentFr, i => (stuffIdx.has(i) ? 'c1' : cls(i))) +
              (damage
                ? hn('Received: the first bit of the opening flag is flipped') +
                  bitRow(T.rcv, i => (i === 0 ? 'c1' : cls(i)))
                : '') +
              statRow([
                [T.dA.length, 'bits in'],
                [T.sA.length, 'bits out (no flags)'],
                ['+' + added, 'stuffed zeros'],
              ]) +
              resultTable(T.frames, [data, OTHER]) +
              verdictFor(T.frames, [data, OTHER]);
          },
        },
      ],
      0
    );
    compare();
    return () => tabs.destroy();
  },
});
