/**
 * wires up the core-lab controls
 *
 * Called once at start-up. Fills the sample-message buttons and attaches the event handlers for the
 * message box, payload slider, Transmit and Stop buttons and the link-up/link-down switch.
 *
 * Imports:
 *   - ../core/utils.js (tiny DOM, math and timing helpers): $, esc
 *   - ../core/state.js (shared in-memory state): S
 *   - ../core/encoding.js (bytes, hex, bits and UTF-8 helpers): enc
 *   - ./message-stage.js (core lab stage 1: message -> UTF-8 bytes): encodeMsg
 *   - ./packet-stage.js (core lab stage 2: cut the byte stream into packets): hoverPacket, labSplit
 *   - ./transmission-stage.js (core lab stage 3: stop-and-wait delivery over a lossy link): syncGo, transmit
 *
 * Exports: labInit
 *
 * Used by: app.js
 */

import { enc } from '../core/encoding.js';
import { S } from '../core/state.js';
import { $, esc } from '../core/utils.js';
import { encodeMsg } from './message-stage.js';
import { hoverPacket, labSplit } from './packet-stage.js';
import { syncGo, transmit } from './transmission-stage.js';

/**
 * Sample messages offered as buttons on stage 1.
 */
const PRESETS = ['Hello, 世界', 'Café ☕', 'Hi 👋', 'The quick brown fox', 'é€𝄞'];

/**
 * Start-up wiring of the core-lab controls (see file header).
 */
export function labInit() {
  $('#msg').value = S.msg;
  $('#presets').innerHTML = PRESETS.map(
    p => `<button class="chipbtn" type="button">${esc(p)}</button>`
  ).join('');
  $('#presets').onclick = e => {
    const b = e.target.closest('.chipbtn');
    if (b) {
      $('#msg').value = b.textContent;
      encodeMsg();
    }
  };
  $('#msg').oninput = encodeMsg;
  $('#ps').oninput = labSplit;
  $('#pk').addEventListener('mouseover', hoverPacket);
  $('#pk').addEventListener('focusin', hoverPacket);
  $('#pk').addEventListener('mouseleave', () => $('#pstream').classList.remove('dim'));
  $('#pk').addEventListener('focusout', () => $('#pstream').classList.remove('dim'));
  $('#go').onclick = transmit;
  $('#stop').onclick = () => {
    S.stopTok = S.tok;
    S.tok++;
  };
  $('#lb').onclick = () => {
    S.up = !S.up;
    $('#link').classList.toggle('off', !S.up);
    $('#ls').textContent = S.up ? 'Link is up' : 'Link is down';
    $('#lb').textContent = S.up ? 'Take link down' : 'Bring link up';
    $('#lb').setAttribute('aria-pressed', !S.up);
    syncGo();
  };
  encodeMsg();
  S.bytes = Array.from(enc.encode($('#msg').value));
}
