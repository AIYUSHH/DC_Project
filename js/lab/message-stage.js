/**
 * core lab stage 1: message -> UTF-8 bytes
 *
 * Reads the text box, encodes it to UTF-8 and draws one card per byte showing its character, hex,
 * decimal and bit pattern. It stores the result in S.bytes, from which every later stage works.
 *
 * Imports:
 *   - ../core/utils.js (tiny DOM, math and timing helpers): $, esc
 *   - ../core/state.js (shared in-memory state): S
 *   - ../core/encoding.js (bytes, hex, bits and UTF-8 helpers): bin8, enc, hex
 *   - ../app/progress.js (achievements, flags and statistics): flag
 *   - ./top-stats.js (top-bar counters): setTop
 *
 * Exports: encodeMsg
 *
 * Used by: lab/lab-init.js
 */

import { bin8, enc, hex } from '../core/encoding.js';
import { S } from '../core/state.js';
import { $, esc } from '../core/utils.js';
import { flag } from '../app/progress.js';
import { setTop } from './top-stats.js';

/**
 * Stage 1: encodes the message box to UTF-8, stores S.bytes and draws the byte cards.
 *
 * Side effects: updates S.msg and S.bytes, the DOM, the top-bar counters, and records the "typed" flag.
 */
export function encodeMsg() {
  const text = $('#msg').value,
    // Array.from splits by Unicode code point; text.split("") would cut emoji and other astral
    // characters in half.
    chars = Array.from(text);
  S.msg = text;
  S.bytes = [];
  let h = '';
  chars.forEach(c => {
    // UTF-8 encode one character: 1 byte for ASCII, up to 4 bytes for others. Bytes after the
    // first are "continuation" bytes.
    const bs = Array.from(enc.encode(c));
    bs.forEach((b, j) => {
      S.bytes.push(b);
      const label = j === 0 ? esc(c === ' ' ? '␠' : c) : `part ${j + 1}`;
      h += `<div class="by" title="${j === 0 ? 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') : 'continuation byte'}"><div class="g${j ? ' c' : ''}">${label}</div><div class="h">${hex(b)}</div><div class="dec">decimal ${b}</div><div class="bits">${bin8(
        b
      )
        .split('')
        .map(x => `<i class="${x === '1' ? 'on' : ''}"></i>`)
        .join('')}</div></div>`;
    });
  });
  $('#bytes').innerHTML = h || '<p class="hint">Type a message above to see its bytes.</p>';
  const multi = chars.filter(c => enc.encode(c).length > 1).length;
  $('#bsum').textContent = chars.length
    ? `${chars.length} character${chars.length > 1 ? 's' : ''} became ${S.bytes.length} byte${S.bytes.length > 1 ? 's' : ''}.${multi ? ` ${multi} of them needed more than one byte.` : ' All of them fit in a single byte.'}`
    : 'The message is empty.';
  $('#mstats').innerHTML = [
    [chars.length, 'characters'],
    [S.bytes.length, 'bytes'],
    [chars.length ? (S.bytes.length / chars.length).toFixed(2) : '0', 'bytes per char'],
    [multi, 'multi-byte chars'],
  ]
    .map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`)
    .join('');
  setTop(S.bytes.length);
  flag('typed');
}
