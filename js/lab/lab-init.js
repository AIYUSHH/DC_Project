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
  let videoReadToken = 0;
  const setMode = mode => {
    imageReadToken++;
    videoReadToken++;
    const previousMode = S.dataType;
    S.dataType = mode;
    $('#textInput').hidden = mode !== 'text';
    $('#presets').hidden = mode !== 'text';
    $('#imageInput').hidden = mode !== 'image';
    $('#videoInput').hidden = mode !== 'video';
    for (const [id, active] of [['textMode', 'text'], ['imageMode', 'image'], ['videoMode', 'video']]) {
      const button = $('#' + id);
      button.classList.toggle('active', mode === active);
      button.classList.toggle('ghost', mode !== active);
      button.setAttribute('aria-pressed', String(mode === active));
    }
    $('#resultTitle').textContent = mode === 'image' ? 'Reconstructed image' : mode === 'video' ? 'Reconstructed video' : 'Reassembled message';
    if (mode === 'text') {
      S.imageMimeType = null; S.imageName = null; S.imageSize = 0;
      S.videoMimeType = null; S.videoName = null; S.videoSize = 0; S.videoDuration = 0; S.videoWidth = 0; S.videoHeight = 0;
      $('#ps').min = '1'; $('#ps').max = '8'; $('#ps').step = '1'; $('#ps').value = textPayloadSize;
      encodeMsg(); labSplit();
    } else {
      if (previousMode === 'text') textPayloadSize = $('#ps').value;
      $('#ps').min = '256'; $('#ps').max = '1200'; $('#ps').step = '16'; $('#ps').value = '1200';
      S.bytes = []; S.run = null;
      $('#bytes').innerHTML = '<p class="hint">Choose a ' + mode + ' to inspect its binary data.</p>';
      $('#bsum').textContent = 'No ' + mode + ' selected.';
      $('#mstats').innerHTML = '';
      labSplit();
    }
  };
  $('#textMode').onclick = () => setMode('text');
  $('#imageMode').onclick = () => setMode('image');
  $('#videoMode').onclick = () => setMode('video');
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
  $('#videoFile').addEventListener('change', async event => {
    const readToken = ++videoReadToken;
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) { alert('Choose an MP4, WebM, or MOV video.'); event.target.value = ''; return; }
    if (file.size > 10 * 1024 * 1024) { alert('For this animated lab, choose a video no larger than 10 MB.'); event.target.value = ''; return; }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (readToken !== videoReadToken || S.dataType !== 'video') return;
      if (S.videoUrl) URL.revokeObjectURL(S.videoUrl);
      S.videoUrl = URL.createObjectURL(file);
      S.videoMimeType = file.type; S.videoName = file.name; S.videoSize = file.size;
      S.bytes = Array.from(bytes); S.run = null;
      const preview = $('#videoPreview'); preview.replaceChildren();
      const player = document.createElement('video');
      player.src = S.videoUrl; player.controls = true; player.preload = 'metadata'; player.className = 'selected-video-preview';
      player.addEventListener('loadedmetadata', () => {
        if (readToken !== videoReadToken) return;
        S.videoDuration = Number.isFinite(player.duration) ? player.duration : 0;
        S.videoWidth = player.videoWidth || 0; S.videoHeight = player.videoHeight || 0;
        encodeMsg();
        const meta = preview.querySelector('p');
        if (meta) meta.textContent = file.name + ' · ' + (file.size / (1024 * 1024)).toFixed(2) + ' MB · ' + S.videoDuration.toFixed(1) + ' sec · ' + S.videoWidth + ' × ' + S.videoHeight;
      }, { once: true });
      const meta = document.createElement('p'); meta.textContent = file.name + ' · ' + (file.size / (1024 * 1024)).toFixed(2) + ' MB · Reading metadata…';
      preview.append(player, meta);
      encodeMsg(); labSplit();
    } catch (error) { console.error('Video read failed', error); alert('The selected video could not be read.'); }
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
