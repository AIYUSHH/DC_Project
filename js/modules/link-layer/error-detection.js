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
import { encode2DParity, correct2DError } from '../../simulations/two-dimensional-parity.js';
import { encodeRS1511, decodeRS1511 } from '../../simulations/reed-solomon.js';
import { ERROR_PATTERNS, corruptBytes } from '../../simulations/error-injection.js';
import { regMod } from '../registry.js';
import { flag } from '../../app/progress.js';
import { mountAlgorithmWorking } from '../../core/algorithm-working.js';

/* Register "Error detection". The router calls mount(root) when the learner opens #/m/errors and calls the returned function (if any) when they leave. */
regMod({
  id: 'errors',
  group: 'link',
  title: 'Error detection & correction',
  desc: 'Detect transmission errors and recover corrupted data with Hamming, 2D parity and Reed–Solomon codes.',
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
        'Start here — a 2-minute guide',
        '<ol class="hint"><li>Start with the examples already filled in.</li><li>In Error detection, click a bit or inject an error, then compare sender and receiver checks.</li><li>In Error correction, encode the data, introduce an error, and decode it to see what can be recovered.</li></ol><p class="hint">Detection tells you that data changed. Correction tries to restore the original data without asking for it again.</p>'
      ) +
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
        )}<button class="btn sm" id="einj">Inject</button><button class="btn ghost sm" id="equick1">Quick: 1-bit error</button><button class="btn ghost sm" id="equick2">Quick: 2-bit error</button>
        <select id="epattern" aria-label="Error pattern">${ERROR_PATTERNS.map(p => `<option value="${p.id}">${p.label}</option>`).join('')}</select><button class="btn ghost sm" id="epatterngo">Inject pattern</button><button class="btn ghost sm" id="eadj">Flip two adjacent bits</button><button class="btn ghost sm" id="eswap">Swap first two bytes</button><button class="btn ghost sm" id="ereset">Reset</button></div>`
      ) +
      panel('Receiver verdict', '<div id="etab"></div><div id="enote"></div>') +
      panel('1. Hamming code — correct a flipped bit',
        '<p class="hint">Try the example: encode 1011, flip one position in the received codeword, then decode. SECDED corrects one flipped bit and detects (but cannot correct) two.</p>' +
        '<div class="controls"><div class="field grow"><label for="ehdata">4 data bits</label><input id="ehdata" value="1011" maxlength="4"></div><button class="btn sm" id="ehencode">Encode</button></div><div id="ehencoded"></div>' +
        '<div class="controls"><div class="field grow"><label for="ehrecv">Received 8-bit codeword</label><input id="ehrecv" value="01100110" maxlength="8" inputmode="numeric" autocomplete="off"></div><button class="btn sm" id="ehflip">Flip a random bit</button><button class="btn sm" id="ehdecode">Decode / correct</button><button class="btn ghost sm" id="ehreset">Restore encoded word</button></div><div id="ehresult"></div>') +
      panel('2. Two-dimensional parity — locate and fix one bit',
        '<p class="hint">The sender keeps the original data as a reference. Change one bit in the received matrix, then check it. The row and column that fail meet at the damaged bit.</p>' +
        '<div class="controls"><div class="field grow"><label for="e2ddata">Original data (one binary row per line)</label><textarea id="e2ddata" rows="3">1011\n0110\n1100</textarea><small class="hint">Keep this unchanged — it represents the sender\'s copy.</small></div><div class="field grow"><label for="e2drecv">Received data</label><textarea id="e2drecv" rows="3">1011\n0010\n1100</textarea><small class="hint">Edit one 0 or 1 here to simulate a transmission error.</small></div></div><div class="btnrow wrap"><button class="btn sm" id="e2ddamage">1. Damage one bit</button><button class="btn sm" id="e2dcheck">2. Find and correct</button><button class="btn ghost sm" id="e2dreset">Reset example</button></div><div id="e2dresult"></div>') +
      panel('3. Reed–Solomon — repair up to 2 damaged bytes',
        '<p class="hint">This advanced example uses 11 data bytes plus 4 check bytes. You do not need to type these numbers: press Encode, then use the error buttons to simulate damage.</p><div class="controls"><div class="field grow"><label for="ersdata">Data (11 decimal byte values, 0–255)</label><input id="ersdata" value="72,101,108,108,111,32,87,111,114,108,100" inputmode="numeric"></div><button class="btn sm" id="ersencode">1. Encode example</button></div><div id="ersencoded"></div><div class="field"><label for="ersrecv">Received codeword (15 decimal byte values)</label><textarea id="ersrecv" rows="3" placeholder="Press Encode example first"></textarea></div><div class="btnrow"><button class="btn ghost sm" id="ersdamage1">Damage 1 byte</button><button class="btn ghost sm" id="ersdamage2">Damage 2 bytes</button><button class="btn sm" id="ersdecode">Decode / correct</button><button class="btn ghost sm" id="ersreset">Reset example</button></div><div id="ersresult"></div>') +
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
    $('#equick1',root).onclick=()=>{flips.clear();flips.add(Math.floor(Math.random()*(sent().length*8)));swap=false;refresh();};
    $('#equick2',root).onclick=()=>{flips.clear();const total=sent().length*8;const first=Math.floor(Math.random()*total);let second;do{second=Math.floor(Math.random()*total);}while(second===first);flips.add(first);flips.add(second);swap=false;refresh();};
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
    let lastHammingCode = '';
    $('#ehencode', root).onclick = () => {
      const data = $('#ehdata', root).value;
      if (!/^[01]{4}$/.test(data)) { $('#ehencoded', root).innerHTML = vd('warn', 'Enter exactly four binary digits.'); return; }
      lastHammingCode = encodeSecded(data);
      $('#ehrecv', root).value = lastHammingCode;
      $('#ehencoded', root).innerHTML = vd('ok', 'Encoded codeword: ' + lastHammingCode, 'Seven Hamming bits plus one overall parity bit.');
      $('#ehresult', root).innerHTML = '';
    };
    $('#ehflip', root).onclick = () => {
      const value=$('#ehrecv',root).value;
      if(!/^[01]{8}$/.test(value)){ $('#ehresult',root).innerHTML=vd('warn','Encode a valid 4-bit message first.'); return; }
      const i=Math.floor(Math.random()*8),bits=value.split('');
      bits[i]=bits[i]==='0'?'1':'0';$('#ehrecv',root).value=bits.join('');
      $('#ehresult',root).innerHTML=vd('info','Bit '+(i+1)+' flipped.','Now choose Decode / correct to see how SECDED repairs it.');
    };
    $('#ehreset',root).onclick=()=>{const value=lastHammingCode||encodeSecded($('#ehdata',root).value);$('#ehrecv',root).value=value;$('#ehresult',root).innerHTML=vd('info','Original codeword restored.');};
    $('#ehdecode', root).onclick = () => {
      const code = $('#ehrecv', root).value;
      if (!/^[01]{8}$/.test(code)) { $('#ehresult', root).innerHTML = vd('warn', 'Enter exactly eight binary digits.'); return; }
      const x = decodeSecded(code); const good=x.status.includes('corrected')||x.status==='No error detected';
      $('#ehresult', root).innerHTML = vd(good?'ok':'warn',x.status,'Received: '+x.received+' → Corrected: '+x.corrected+' · Recovered data: '+x.data+' · Syndrome: '+x.syndrome+(x.correctedBit?' · Corrected bit: '+x.correctedBit:''))+'<p class="hint">SECDED corrects one bit. It detects two-bit errors but does not guess a correction.</p>';
    };
    const encodeRsFromInput = () => {
      const values=$('#ersdata',root).value.split(',').map(x=>Number(x.trim()));
      const code=encodeRS1511(values);$('#ersrecv',root).value=code.join(',');
      $('#ersencoded',root).innerHTML=vd('ok','Codeword ready.','11 original bytes + 4 parity bytes. Use Damage 1 byte or Damage 2 bytes, then decode.');
      $('#ersresult',root).innerHTML='';
    };
    const damageRs = count => {
      try {
        const values=$('#ersrecv',root).value.split(',').map(x=>Number(x.trim()));
        if(values.length!==15)throw new Error('Press Encode example first.');
        const positions=new Set();
        while(positions.size<count)positions.add(Math.floor(Math.random()*15));
        positions.forEach((p,i)=>{values[p]^=(37+((p*29)%190));});
        $('#ersrecv',root).value=values.join(', ');
        $('#ersresult',root).innerHTML=vd('info',count+' byte(s) changed.','Now choose Decode / correct to recover the original data.');
      } catch(e) { $('#ersresult',root).innerHTML=vd('warn',esc(e.message)); }
    };
    $('#ersencode',root).onclick=()=>{try{encodeRsFromInput();}catch(e){$('#ersencoded',root).innerHTML=vd('warn',esc(e.message));}};
    $('#ersdamage1',root).onclick=()=>damageRs(1);
    $('#ersdamage2',root).onclick=()=>damageRs(2);
    $('#ersreset',root).onclick=()=>{try{encodeRsFromInput();$('#ersresult',root).innerHTML=vd('info','Original codeword restored.');}catch(e){$('#ersencoded',root).innerHTML=vd('warn',esc(e.message));}};
    $('#ersdecode',root).onclick=()=>{try{const values=$('#ersrecv',root).value.split(',').map(x=>Number(x.trim())),x=decodeRS1511(values),good=x.positions.length>0||x.status==='No symbol errors detected';$('#ersresult',root).innerHTML=vd(good?'ok':'warn',x.status,'Corrected codeword: '+x.corrected.join(', ')+' · Recovered data: '+x.data.join(', ')+(x.positions.length?' · Corrected byte positions: '+x.positions.map(p=>p+1).join(', '):''));if(good)$('#ersrecv',root).value=x.corrected.join(',');}catch(e){$('#ersresult',root).innerHTML=vd('warn',esc(e.message));}};
    $('#e2ddamage',root).onclick=()=>{try{const rows=encode2DParity($('#e2ddata',root).value.split(/\n/)).matrix.map(r=>r.join(''));if(!rows.length)throw new Error('Enter a valid original matrix first.');const r=Math.floor(Math.random()*rows.length),col=Math.floor(Math.random()*rows[0].length),bits=rows[r].split('');bits[col]=bits[col]==='0'?'1':'0';rows[r]=bits.join('');$('#e2drecv',root).value=rows.join('\n');$('#e2dresult',root).innerHTML=vd('info','One bit was changed.','Now press Find and correct to let the receiver locate and repair it.');}catch(e){$('#e2dresult',root).innerHTML=vd('warn',esc(e.message));}};
    $('#e2dreset',root).onclick=()=>{ $('#e2drecv',root).value=$('#e2ddata',root).value; $('#e2dresult',root).innerHTML=vd('info','Received data reset to match the sender.'); };
    $('#e2dcheck', root).onclick = () => {
      try {
        const original = encode2DParity($('#e2ddata', root).value.split(/\n/));
        const received = $('#e2drecv', root).value.split(/\n/).map(x => x.trim()).filter(Boolean);
        if (received.length !== original.matrix.length || received.some(x => !new RegExp('^[01]{' + original.matrix[0].length + '}$').test(x)))
          throw new Error('Received data must be a rectangular binary matrix with the same dimensions as the original.');
        const result = correct2DError(received, original.matrix.map(row => row.join('')));
        const fixed = result.corrected.map(row => row.join('')).join('\n');
        $('#e2dresult', root).innerHTML = vd(
          result.status.includes('corrected') || result.status === 'No error detected' ? 'ok' : 'warn',
          result.status,
          result.correctedBit
            ? 'Located row ' + (result.correctedBit.row + 1) + ', column ' + (result.correctedBit.column + 1) + '. Corrected matrix: ' + fixed
            : 'Rows: ' + result.badRows.map(x => x + 1).join(', ') + ' · Columns: ' + result.badCols.map(x => x + 1).join(', ') + ' · Matrix unchanged: ' + fixed
        );
        if (result.status.includes('corrected')) $('#e2drecv', root).value = fixed;
      } catch (e) {
        $('#e2dresult', root).innerHTML = vd('warn', esc(e.message));
      }
    };
    refresh();
    mountAlgorithmWorking(root);
  },
});