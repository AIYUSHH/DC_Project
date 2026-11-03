/**
 * learning module: Error detection
 *
 * Flip bits and watch parity, checksum, CRC-8 and CRC-32 decide whether the error is noticed; includes a 2,000-trial detection-rate experiment.
 *
 * This file registers one learning module with regMod(). Its mount(root) function builds the screen inside
 * `root` and attaches event handlers; the function mount() returns (if any) is its cleanup, called by the router
 * when the learner leaves, so timers and listeners do not outlive the screen. The protocol logic lives in
 * ../../simulations/ and ../../core/; this file is the user interface for it.
 *
 * Imports:
 *   - ../../core/state.js (shared in-memory state): S
 *   - ../../core/encoding.js (bytes, hex, bits and UTF-8 helpers): bin8, bytesOf, hex
 *   - ../../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): hn, on, panel, sel, tbl, vd
 *   - ../../core/utils.js (tiny DOM, math and timing helpers): $, esc
 *   - ../../simulations/error-detection.js (error-check definitions used by the error-detection module): ERR_METHODS, errChecks, fmtCheck
 *   - ../registry.js (learning-module registry and group definitions): regMod
 *   - ../../app/progress.js (achievements, flags and statistics): flag
 *
 * Exports: (none)
 *
 * Used by: (imported only for its side effects by app.js)
 */

import { bin8, bytesOf, hex } from '../../core/encoding.js';
import { S } from '../../core/state.js';
import { hn, on, panel, sel, vd } from '../../core/ui-helpers.js';
import { $, esc } from '../../core/utils.js';
import { ERR_METHODS, errChecks, fmtCheck } from '../../simulations/error-detection.js';
import { encodeSecded, decodeSecded } from '../../simulations/hamming-code.js';
import { encode2DParity } from '../../simulations/two-dimensional-parity.js';
import { ERROR_PATTERNS, corruptBytes } from '../../simulations/error-injection.js';
import { regMod } from '../registry.js';
import { flag } from '../../app/progress.js';

/* Register "Error detection". The router calls mount(root) when the learner opens #/m/errors and calls the returned function (if any) when they leave. */
regMod({
  id: 'errors',
  group: 'link',
  title: 'Error detection',
  desc: 'Add parity, a checksum or a CRC, then corrupt the data and see which method notices.',
  obj: [
    'Compute parity, an Internet checksum and CRCs on real data.',
    'Flip bits by hand and read the pass or fail result of each method.',
    'Find the errors that parity and checksums miss but a CRC catches.',
  ],
  mount(root) {
    let text = (S.msg || 'Hello').slice(0, 6),
      flips = new Set(),
      swap = false,
      odd = false;
    const sent = () => bytesOf(text).slice(0, 8);
    const recvBytes = () => {
      const b = sent().slice();
      flips.forEach(i => {
        b[i >> 3] ^= 0x80 >> (i & 7);
      });
      if (swap && b.length > 1) {
        const t = b[0];
        b[0] = b[1];
        b[1] = t;
      }
      return b;
    };
    root.innerHTML =
      panel(
        'Data to protect',
        `
      <div class="controls"><div class="field grow"><label for="etext">Text (first 8 bytes are used)</label><input id="etext" type="text" maxlength="8" value="${esc(text)}" spellcheck="false" autocomplete="off"></div>
      <div class="field"><label for="epar">Parity type</label>${sel(
        'epar',
        [
          ['even', 'Even'],
          ['odd', 'Odd'],
        ],
        'even'
      )}</div></div>`
      ) +
      panel(
        'Corrupt the data',
        `<p class="hint">Click any bit to flip it, or use the buttons. The check values stay as the sender computed them.</p><div id="egrid" class="bitgrid"></div>
        <div class="btnrow wrap"><label class="inl" for="ecount">Flip</label>${sel(
          'ecount',
          [
            [1, '1 random bit'],
            [2, '2 random bits'],
            [3, '3 random bits'],
            [4, '4 random bits'],
            [8, 'a burst of 8'],
            [16, 'a burst of 16'],
          ],
          1
        )}<button class="btn sm" id="einj">Inject</button>
        <select id="epattern" aria-label="Error pattern">${ERROR_PATTERNS.map(p => `<option value="${p.id}">${p.label}</option>`).join('')}</select><button class="btn ghost sm" id="epatterngo">Inject pattern</button><button class="btn ghost sm" id="eadj">Flip two adjacent bits</button><button class="btn ghost sm" id="eswap">Swap first two bytes</button><button class="btn ghost sm" id="ereset">Reset</button></div>`
      ) +
      panel('Receiver verdict', '<div id="etab"></div><div id="enote"></div>') +
      panel('Hamming code — detect and correct',
        '<p class="hint">Extended Hamming (8,4) can correct one flipped bit and detect (but not correct) two flipped bits.</p>' +
        '<div class="controls"><div class="field grow"><label for="ehdata">4 data bits</label><input id="ehdata" value="1011" maxlength="4"></div><button class="btn sm" id="ehencode">Encode</button></div><div id="ehencoded"></div>' +
        '<div class="controls"><div class="field grow"><label for="ehrecv">Received 8-bit codeword</label><input id="ehrecv" value="10110100" maxlength="8"></div><button class="btn sm" id="ehdecode">Decode / correct</button></div><div id="ehresult"></div>') +
      panel('Two-dimensional parity',
        '<p class="hint">Row and column parity can locate a single flipped data bit at their intersection.</p>' +
        '<div class="controls"><div class="field grow"><label for="e2ddata">Original data (one binary row per line)</label><textarea id="e2ddata" rows="3">1011\n0110\n1100</textarea></div><div class="field grow"><label for="e2drecv">Received data</label><textarea id="e2drecv" rows="3">1011\n0010\n1100</textarea></div></div><button class="btn sm" id="e2dcheck">Check parity</button><div id="e2dresult"></div>') +
      panel(
        'How often does each method notice?',
        `<p class="hint">Corrupt random bits many times and count how often each method detects it. This uses your current data.</p>
        <div class="controls"><div class="field"><label for="etk">Bits flipped per trial</label>${sel(
          'etk',
          [
            [1, '1'],
            [2, '2'],
            [3, '3'],
            [4, '4'],
            [5, '5'],
            [8, '8'],
          ],
          2
        )}</div><div class="btnrow"><button class="btn" id="etrial">Run 2,000 trials</button></div></div><div id="eres"></div>`
      );
    const renderGrid = () => {
      const s = sent(),
        r = recvBytes();
      $('#egrid', root).innerHTML = s
        .map(
          (b, k) =>
            `<div class="brow"><code>${hex(b)}</code>${bin8(r[k])
              .split('')
              .map((x, j) => {
                const i = k * 8 + j,
                  f = flips.has(i);
                return `<button class="chip bt ${f ? 'c1' : 'c0'}" data-i="${i}" aria-pressed="${f}" aria-label="Byte ${k} bit ${j}, value ${x}">${x}</button>`;
              })
              .join(
                ''
              )}<code class="arrow">→</code><code class="${r[k] !== b ? 'bad' : ''}">${hex(r[k])}</code></div>`
        )
        .join('');
    };
    const verdicts = () => {
      const s = sent(),
        r = recvBytes(),
        cs = errChecks(s, odd),
        cr = errChecks(r, odd);
      const changed = s.some((b, i) => b !== r[i]);
      const rows = ERR_METHODS.map(m => {
        const det = cs[m.id] !== cr[m.id];
        return {
          id: m.id,
          name: m.name,
          sent: fmtCheck(m.id, cs[m.id]),
          calc: fmtCheck(m.id, cr[m.id]),
          det,
        };
      });
      $('#etab', root).innerHTML =
        '<div class="err-method-grid">' +
        rows.map(x => `
          <article class="err-method-card ${changed ? (x.det ? 'is-detected' : 'is-missed') : 'is-idle'}">
            <div class="err-method-head">
              <strong>${esc(x.name)}</strong>
              <span class="err-status ${changed ? (x.det ? 'is-detected' : 'is-missed') : 'is-idle'}">${!changed ? 'Waiting' : x.det ? 'Detected' : 'Missed'}</span>
            </div>
            <div class="err-check-values">
              <div><small>Sender check</small><code>${x.sent}</code></div>
              <div><small>Receiver check</small><code>${x.calc}</code></div>
            </div>
          </article>`).join('') +
        '</div>';
      let note = '';
      if (changed) {
        flag('errflip');
        const missed = rows.filter(x => !x.det).map(x => x.name);
        if (!rows[0].det) flag('parityMiss');
        if (
          (!rows[0].det && rows[3].det) ||
          (!rows[1].det && rows[3].det) ||
          (!rows[0].det && rows[2].det)
        )
          flag('crcCatch');
        note = missed.length
          ? vd(
              'warn',
              `${missed.length === rows.length ? 'Every method' : missed.join(' and ')} missed this error.`,
              missed.length < rows.length
                ? 'The stronger methods still caught it, which is why Ethernet uses a CRC.'
                : 'The corruption happens to produce the same check value. This is rare for CRCs.'
            )
          : vd(
              'ok',
              `All ${rows.length} methods caught the error.`,
              'The receiver would discard this frame and wait for a retransmission.'
            );
      } else
        note = vd(
          'info',
          'No error injected yet.',
          'Flip a bit above. Try two adjacent bits to beat parity, or swap two bytes to beat the checksum.'
        );
      $('#enote', root).innerHTML = note;
    };
    const refresh = () => {
      renderGrid();
      verdicts();
    };
    $('#etext', root).oninput = e => {
      text = e.target.value || 'A';
      flips.clear();
      swap = false;
      refresh();
    };
    $('#epar', root).onchange = e => {
      odd = e.target.value === 'odd';
      verdicts();
    };
    on(root, 'click', '#egrid [data-i]', (e, b) => {
      const i = +b.dataset.i;
      flips.has(i) ? flips.delete(i) : flips.add(i);
      refresh();
    });
    $('#einj', root).onclick = () => {
      const n = +$('#ecount', root).value,
        total = sent().length * 8;
      if (n === 8 || n === 16) {
        const width = Math.min(n, total);
        const st = Math.floor(Math.random() * (total - width + 1));
        for (let i = 0; i < width; i++) flips.add(st + i);
      } else {
        let g = 0;
        const want = flips.size + n;
        while (flips.size < Math.min(want, total) && g++ < 99)
          flips.add(Math.floor(Math.random() * total));
      }
      refresh();
    };
    $('#eadj', root).onclick = () => {
      const st = Math.floor(Math.random() * (sent().length * 8 - 1));
      [st, st + 1].forEach(i => {
        flips.has(i) ? flips.delete(i) : flips.add(i);
      });
      refresh();
    };
    $('#eswap', root).onclick = () => {
      swap = !swap;
      refresh();
    };
    $('#ereset', root).onclick = () => {
      flips.clear();
      swap = false;
      refresh();
    };
    $('#etrial', root).onclick = () => {
      const k = +$('#etk', root).value,
        s = sent(),
        total = s.length * 8,
        cs = errChecks(s, odd),
        TR = 2000,
        _f = flag('trials'),
        hit = Object.fromEntries(ERR_METHODS.map(m => [m.id, 0]));
      if (k > total) {
        $('#eres', root).innerHTML = vd('warn', 'Not enough bits.', 'Use longer text.');
        return;
      }
      for (let t = 0; t < TR; t++) {
        const set = new Set();
        while (set.size < k) set.add(Math.floor(Math.random() * total));
        const r = s.slice();
        set.forEach(i => {
          r[i >> 3] ^= 0x80 >> (i & 7);
        });
        const cr = errChecks(r, odd);
        Object.keys(hit).forEach(m => {
          if (cs[m] !== cr[m]) hit[m]++;
        });
      }
      $('#eres', root).innerHTML =
        `<div class="rates">${ERR_METHODS.map(m => {
          const pct = (hit[m.id] / TR) * 100;
          return `<div class="rate"><span>${m.name}</span><div class="bar"><i style="width:${pct}%"></i></div><b>${pct.toFixed(1)}%</b></div>`;
        }).join('')}</div>` +
        hn(
          k % 2 === 0
            ? 'An even number of flipped bits leaves a parity bit unchanged, so parity detects 0% of these errors.'
            : 'Parity catches every odd number of flips, but misses all even numbers.'
        );
    };
    $('#epatterngo', root).onclick = () => {
      const result = corruptBytes(sent(), $('#epattern', root).value);
      flips.clear(); swap = false;
      result.indexes.forEach(i => flips.add(i));
      refresh();
    };
    $('#ehencode', root).onclick = () => {
      const data = $('#ehdata', root).value;
      if (!/^[01]{4}$/.test(data)) { $('#ehencoded', root).innerHTML = vd('warn', 'Enter exactly four binary digits.'); return; }
      const code = encodeSecded(data); $('#ehrecv', root).value = code;
      $('#ehencoded', root).innerHTML = vd('ok', 'Encoded SECDED codeword: ' + code, 'The eighth bit is overall parity.');
    };
    $('#ehdecode', root).onclick = () => {
      const code = $('#ehrecv', root).value;
      if (!/^[01]{8}$/.test(code)) { $('#ehresult', root).innerHTML = vd('warn', 'Enter exactly eight binary digits.'); return; }
      const x = decodeSecded(code);
      $('#ehresult', root).innerHTML = vd(x.status.includes('corrected') || x.status === 'No error detected' ? 'ok' : 'warn', x.status, 'Corrected: ' + x.corrected + ' · Data: ' + x.data + ' · Syndrome: ' + x.syndrome);
    };
    $('#e2dcheck', root).onclick = () => {
      try {
        const original = encode2DParity($('#e2ddata', root).value.split(/\n/));
        const received = $('#e2drecv', root).value.split(/\n/).map(row => row.replace(/[^01]/g, ''));
        if (received.length !== original.matrix.length || received.some(row => row.length !== original.matrix[0].length)) throw new Error('Received data must have the same dimensions as the original.');
        const badRows = received.map((row, i) => row.split('').reduce((a, b) => a ^ Number(b), 0) ^ original.rowParity[i]).map((v, i) => v ? i : -1).filter(i => i >= 0);
        const badCols = original.colParity.map((p, col) => received.reduce((a, row) => a ^ Number(row[col]), 0) ^ p).map((v, i) => v ? i : -1).filter(i => i >= 0);
        const single = badRows.length === 1 && badCols.length === 1;
        $('#e2dresult', root).innerHTML = single ? vd('warn', 'Single-bit error located at row ' + (badRows[0] + 1) + ', column ' + (badCols[0] + 1) + '.', 'Multi-bit errors can be ambiguous.') : (badRows.length || badCols.length) ? vd('warn', 'Parity mismatch: rows ' + badRows.map(x => x + 1).join(', ') + '; columns ' + badCols.map(x => x + 1).join(', ')) : vd('ok', 'No parity mismatch detected.');
      } catch (e) { $('#e2dresult', root).innerHTML = vd('warn', esc(e.message)); }
    };
    refresh();
  },
});
