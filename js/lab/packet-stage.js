/**
 * core lab stage 2: cut the byte stream into packets
 *
 * Slices S.bytes into packets of the chosen payload size, stores them in S.P and draws the colour-coded
 * packet cards and byte stream. It also clears an old run when the data being sent has changed.
 *
 * Imports:
 *   - ../core/utils.js (tiny DOM, math and timing helpers): $
 *   - ../core/state.js (shared in-memory state): S
 *   - ../core/encoding.js (bytes, hex, bits and UTF-8 helpers): hex, hexs
 *   - ../simulations/packetization.js (packet layout of the core lab): HDR, TRL, packetCrc
 *   - ../app/progress.js (achievements, flags and statistics): flag
 *   - ./top-stats.js (top-bar counters): setTop
 *
 * Exports: hoverPacket, labSplit
 *
 * Used by: app/router.js, lab/lab-init.js, lab/transmission-stage.js
 */

import { hex, hexs } from '../core/encoding.js';
import { S } from '../core/state.js';
import { $ } from '../core/utils.js';
import { HDR, packetCrc, TRL } from '../simulations/packetization.js';
import { flag } from '../app/progress.js';
import { setTop } from './top-stats.js';

// header bytes (seq, len) and CRC-8 trailer
/**
 * Fingerprint (payload size + bytes) of what was last packetized, used to discard a stale run.
 */
let labSig = '';

/**
 * Stage 2: cuts S.bytes into packets of the chosen size and draws them.
 *
 * Side effects: replaces S.P; clears S.run if the data or size changed; records flags for the p1/p8 experiments.
 */
export function labSplit() {
  const n = +$('#ps').value;
  $('#psv').textContent = n;
  if (n === 1) flag('p1');
  if (n === 8) flag('p8');
  if (n !== 3) flag('psMoved');
  S.P = [];
  // Walk the byte stream n bytes at a time; the last packet may be shorter.
  for (let i = 0; i < S.bytes.length; i += n) S.P.push(S.bytes.slice(i, i + n));
  // Fingerprint of what is about to be sent. If it differs from last time, any earlier
  // transmission result no longer matches the data and is discarded.
  const sig = n + ':' + S.bytes.join(',');
  if (sig !== labSig) {
    S.run = null;
    labSig = sig;
  }
  $('#pstream').innerHTML = S.P.length
    ? S.P.map((p, i) =>
        p.map(x => `<span class="chip c${i % 4}" data-p="${i}">${hex(x)}</span>`).join('')
      ).join('')
    : '<p class="hint">No bytes yet. Type a message first.</p>';
  $('#pk').innerHTML = S.P.map(
    (p, i) =>
      `<div class="pk c${i % 4}" tabindex="0" data-p="${i}"><div class="t"><span>Packet ${i + 1}</span><span>${p.length} B</span></div><div class="s"><b>Header</b>seq ${i + 1}, length ${p.length}</div><div class="s"><b>Payload</b><span>${hexs(p)}</span></div><div class="s"><b>CRC-8 trailer</b><span>${hex(packetCrc(i, p))}</span></div></div>`
  ).join('');
  const over = S.P.length * (HDR + TRL),
    tot = S.bytes.length + over;
  $('#pstats').innerHTML = [
    [S.P.length, 'packets'],
    [S.bytes.length, 'payload bytes'],
    [over, 'overhead bytes'],
    [tot ? Math.round((S.bytes.length / tot) * 100) + '%' : '0%', 'efficiency'],
  ]
    .map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`)
    .join('');
  setTop(undefined, S.P.length, S.run ? S.run.retries : 0);
}

/**
 * Highlights, in the byte stream, the bytes belonging to the packet under the mouse or keyboard focus.
 */
export function hoverPacket(e) {
  const c = e.target.closest('.pk'),
    s = $('#pstream');
  s.classList.toggle('dim', !!c);
  s.querySelectorAll('.chip').forEach(x =>
    x.classList.toggle('hl', !!c && x.dataset.p === c.dataset.p)
  );
}
