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
  let documentReadToken = 0;
  let audioReadToken = 0;
  const setMode = mode => {
    imageReadToken++;
    videoReadToken++;
    documentReadToken++;
    audioReadToken++;
    const previousMode = S.dataType;
    S.dataType = mode;
    $('#textInput').hidden = mode !== 'text';
    $('#presets').hidden = mode !== 'text';
    $('#imageInput').hidden = mode !== 'image';
    $('#videoInput').hidden = mode !== 'video';
    $('#documentInput').hidden = mode !== 'document';
    $('#audioInput').hidden = mode !== 'audio';
    for (const [id, active] of [['textMode', 'text'], ['imageMode', 'image'], ['videoMode', 'video'], ['documentMode', 'document'], ['audioMode', 'audio']]) {
      const button = $('#' + id);
      button.classList.toggle('active', mode === active);
      button.classList.toggle('ghost', mode !== active);
      button.setAttribute('aria-pressed', String(mode === active));
    }
    $('#resultTitle').textContent = mode === 'image' ? 'Reconstructed image' : mode === 'video' ? 'Reconstructed video' : mode === 'document' ? 'Reconstructed document' : mode === 'audio' ? 'Reconstructed audio' : 'Reassembled message';
    if (mode === 'text') {
      S.imageMimeType = null; S.imageName = null; S.imageSize = 0;
      S.videoMimeType = null; S.videoName = null; S.videoSize = 0; S.videoDuration = 0; S.videoWidth = 0; S.videoHeight = 0;
      S.documentMimeType = null; S.documentName = null; S.documentSize = 0;
      S.audioMimeType = null; S.audioName = null; S.audioSize = 0; S.audioDuration = 0;
      $('#ps').min = '1'; $('#ps').max = '8'; $('#ps').step = '1'; $('#ps').value = textPayloadSize;
      encodeMsg(); labSplit();
    } else {
      if (previousMode === 'text') textPayloadSize = $('#ps').value;
      $('#ps').min = '256'; $('#ps').max = '1200'; $('#ps').step = '16'; $('#ps').value = '1200';
      S.bytes = []; S.run = null;
      $('#bytes').innerHTML = '<p class="hint">Choose a ' + (mode === 'document' ? 'document' : mode) + ' to inspect its binary data.</p>';
      $('#bsum').textContent = 'No ' + (mode === 'document' ? 'document' : mode) + ' selected.';
      $('#mstats').innerHTML = '';
      labSplit();
    }
  };
  $('#textMode').onclick = () => setMode('text');
  $('#imageMode').onclick = () => setMode('image');
  $('#videoMode').onclick = () => setMode('video');
  $('#documentMode').onclick = () => setMode('document');
  $('#audioMode').onclick = () => setMode('audio');
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
  $('#documentFile').addEventListener('change', async event => {
    const readToken = ++documentReadToken;
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const extension = file.name.split('.').pop().toLowerCase();
    const documentTypes = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword',
      txt: 'text/plain',
      rtf: 'application/rtf'
    };
    if (!Object.prototype.hasOwnProperty.call(documentTypes, extension)) {
      alert('Choose a PDF, DOCX, DOC, TXT, or RTF document.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('For this animated lab, choose a document no larger than 5 MB.');
      event.target.value = '';
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (readToken !== documentReadToken || S.dataType !== 'document') return;
      if (S.documentUrl) URL.revokeObjectURL(S.documentUrl);
      S.documentUrl = URL.createObjectURL(file);
      S.documentMimeType = file.type || documentTypes[extension];
      S.documentName = file.name;
      S.documentSize = file.size;
      S.bytes = Array.from(bytes);
      S.run = null;
      const preview = $('#documentPreview');
      preview.replaceChildren();
      const meta = document.createElement('p');
      meta.textContent = file.name + ' · ' + (file.size / 1024).toFixed(2) + ' KB · ' + extension.toUpperCase();
      preview.append(meta);
      if (extension === 'pdf') {
        const frame = document.createElement('iframe');
        frame.src = S.documentUrl;
        frame.title = 'Selected PDF preview';
        frame.className = 'document-pdf-preview';
        frame.loading = 'lazy';
        preview.append(frame);
      } else if (extension === 'txt') {
        const textPreview = document.createElement('pre');
        textPreview.className = 'document-text-preview';
        textPreview.textContent = new TextDecoder().decode(bytes).slice(0, 4000);
        preview.append(textPreview);
      } else {
        const note = document.createElement('p');
        note.className = 'hint';
        note.textContent = 'This format will be preserved byte-for-byte and offered as a download after successful reconstruction.';
        preview.append(note);
      }
      encodeMsg();
      labSplit();
    } catch (error) {
      console.error('Document read failed', error);
      alert('The selected document could not be read.');
    }
  });
  $('#audioFile').addEventListener('change', async event => {
    const readToken = ++audioReadToken;
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const extension = file.name.split('.').pop().toLowerCase();
    const audioTypes = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      oga: 'audio/ogg',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
      flac: 'audio/flac'
    };
    if (!Object.prototype.hasOwnProperty.call(audioTypes, extension)) {
      alert('Choose an MP3, WAV, OGG, M4A, AAC, or FLAC audio file.');
      event.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('For this animated lab, choose an audio file no larger than 10 MB.');
      event.target.value = '';
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (readToken !== audioReadToken || S.dataType !== 'audio') return;
      if (S.audioUrl) URL.revokeObjectURL(S.audioUrl);
      S.audioUrl = URL.createObjectURL(file);
      S.audioMimeType = file.type || audioTypes[extension];
      S.audioName = file.name;
      S.audioSize = file.size;
      S.bytes = Array.from(bytes);
      S.run = null;
      const preview = $('#audioPreview');
      preview.replaceChildren();
      const player = document.createElement('audio');
      player.src = S.audioUrl;
      player.controls = true;
      player.preload = 'metadata';
      player.className = 'selected-audio-preview';
      player.addEventListener('loadedmetadata', () => {
        if (readToken !== audioReadToken) return;
        S.audioDuration = Number.isFinite(player.duration) ? player.duration : 0;
        const meta = preview.querySelector('p');
        if (meta) meta.textContent = file.name + ' · ' + (file.size / (1024 * 1024)).toFixed(2) + ' MB · ' + (S.audioDuration ? S.audioDuration.toFixed(1) + ' sec' : 'Duration unavailable');
        encodeMsg();
      }, { once: true });
      const meta = document.createElement('p');
      meta.textContent = file.name + ' · ' + (file.size / (1024 * 1024)).toFixed(2) + ' MB · Reading metadata…';
      preview.append(player, meta);
      encodeMsg();
      labSplit();
    } catch (error) {
      console.error('Audio read failed', error);
      alert('The selected audio file could not be read.');
    }
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
