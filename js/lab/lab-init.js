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
  let textPayloadSize = $('#ps').value;
  let imageReadToken = 0;
  const setMode = mode => {
    imageReadToken++;
    const previousMode = S.dataType;
    S.dataType = mode;
    $('#textInput').hidden = mode !== 'text';
    $('#presets').hidden = mode !== 'text';
    $('#imageInput').hidden = mode !== 'image';
    $('#textMode').classList.toggle('active', mode === 'text');
    $('#imageMode').classList.toggle('active', mode === 'image');
    $('#textMode').classList.toggle('ghost', mode !== 'text');
    $('#imageMode').classList.toggle('ghost', mode !== 'image');
    $('#textMode').setAttribute('aria-pressed', String(mode === 'text'));
    $('#imageMode').setAttribute('aria-pressed', String(mode === 'image'));
    $('#resultTitle').textContent = mode === 'image' ? 'Reconstructed image' : 'Reassembled message';
    if (mode === 'text') { S.imageMimeType = null; S.imageName = null; S.imageSize = 0; $('#ps').min = '1'; $('#ps').max = '8'; $('#ps').step = '1'; $('#ps').value = textPayloadSize; encodeMsg(); labSplit(); }
    else {
      if (previousMode !== 'image') textPayloadSize = $('#ps').value;
      $('#ps').min = '256'; $('#ps').max = '1200'; $('#ps').step = '16'; $('#ps').value = '1200';
      S.bytes = [];
      $('#bytes').innerHTML = '<p class="hint">Choose an image to inspect its binary data.</p>';
      $('#bsum').textContent = 'No image selected.';
      $('#mstats').innerHTML = '';
      labSplit();
    }
  };
  $('#textMode').onclick = () => setMode('text');
  $('#imageMode').onclick = () => setMode('image');
  $('#imageFile').addEventListener('change', async event => {
    const readToken = ++imageReadToken;
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { alert('Choose a PNG, JPG, or WebP image.'); event.target.value = ''; return; }
    if (file.size > 2 * 1024 * 1024) { alert('For this animated lab, choose an image no larger than 2 MB. Image transfers use larger payloads and batched animation.'); event.target.value = ''; return; }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (readToken !== imageReadToken || S.dataType !== 'image') return;
      if (S.imageUrl) URL.revokeObjectURL(S.imageUrl);
      S.imageUrl = URL.createObjectURL(file);
      S.imageMimeType = file.type; S.imageName = file.name; S.imageSize = file.size;
      S.bytes = Array.from(bytes); S.run = null;
      $('#imagePreview').replaceChildren();
      const img = document.createElement('img'); img.src = S.imageUrl; img.alt = 'Selected original image';
      const meta = document.createElement('p'); meta.textContent = file.name + ' · ' + (file.size / 1024).toFixed(2) + ' KB';
      $('#imagePreview').append(img, meta);
      encodeMsg(); labSplit();
    } catch (error) { console.error('Image read failed', error); alert('The selected image could not be read.'); }
  });
  $('#presets').innerHTML = PRESETS.map(
    p => `<button class="chipbtn" type="button">${esc(p)}</button>`
  ).join('');
  $('#presets').onclick = e => {
    const b = e.target.closest('.chipbtn');
    if (b) {
      $('#msg').value = b.textContent;
      encodeMsg();
      labSplit();
    }
  };
  $('#msg').oninput = () => { S.dataType = 'text'; encodeMsg(); labSplit(); };
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
  setMode('text');
  encodeMsg();
}
