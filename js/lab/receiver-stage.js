/**
 * core lab stage 4: reassemble and decode the message
 *
 * Puts the packets that arrived into slots by sequence number, joins them, and decodes them as UTF-8
 * with a typewriter effect. If packets are missing it shows only the readable in-order prefix and explains why.
 *
 * Imports:
 *   - ../core/state.js (shared in-memory state): S
 *   - ../core/utils.js (tiny DOM, math and timing helpers): $, REDUCE, esc
 *   - ../core/encoding.js (bytes, hex, bits and UTF-8 helpers): dec, hexs
 *   - ../app/progress.js (achievements, flags and statistics): flag
 *
 * Exports: labRecv
 *
 * Used by: app/router.js
 */

import { dec, hexs } from '../core/encoding.js';
import { S } from '../core/state.js';
import { $, esc, REDUCE } from '../core/utils.js';
import { flag } from '../app/progress.js';

/**
 * Stage 4: places received packets into slots, joins them and decodes the message with a typewriter effect.
 */
export function labRecv() {
  const r = S.run;
  $('#rEmpty').hidden = !!r;
  $('#rBody').hidden = !r;
  clearInterval(S.timer);
  if (!r) return;
  const binaryMode = S.dataType === 'image' || S.dataType === 'video';
  const previewLimit = binaryMode ? 32 : r.arr.length;
  const shownArr = r.arr.slice(0, previewLimit);
  $('#arr').innerHTML =
    (binaryMode && r.arr.length > previewLimit ? `<li class="hint">Showing first ${previewLimit} of ${r.arr.length.toLocaleString()} received packets.</li>` : '') +
    shownArr.map(x => `<li><span class="tag ok">${x + 1}</span>Packet ${x + 1} arrived and passed its CRC-8 check</li>`).join('') ||
    '<li>Nothing arrived.</li>';
  if (binaryMode && r.got.length > previewLimit) {
    const missing = r.got.reduce((count, packet) => count + (packet ? 0 : 1), 0);
    $('#slots').innerHTML = `<div class="image-byte-summary"><strong>${r.arr.length.toLocaleString()} / ${r.got.length.toLocaleString()} packets received</strong><span>${missing.toLocaleString()} missing · Detailed slot rendering is limited for large binary transfers to keep the page responsive.</span></div>` +
      r.got.slice(0, 12).map((p, i) => p
        ? `<div class="slot ok"><b>Slot ${i + 1}</b><span>${p.length} bytes</span></div>`
        : `<div class="slot miss"><b>Slot ${i + 1}</b><span>missing</span></div>`).join('');
  } else {
    $('#slots').innerHTML = r.got.map((p, i) => p
      ? `<div class="slot ok"><b>Slot ${i + 1}</b><span>${hexs(p)}</span></div>`
      : `<div class="slot miss"><b>Slot ${i + 1}</b><span>missing</span></div>`).join('');
  }
  const miss = r.got.filter(x => !x).length;
  $('#rc').textContent = miss
    ? `${miss} slot${miss > 1 ? 's' : ''} still empty.`
    : 'Every slot is filled.';
  const res = $('#res');
  res.className = 'result';
  if (miss) {
    let prefix = [];
    if (S.dataType === 'text') {
      for (const g of r.got) {
        if (!g) break;
        prefix.push(...g);
      }
    }
    const part = S.dataType === 'text' ? dec.decode(new Uint8Array(prefix)) : '';
    res.classList.add('bad');
    flag('viewedGap');
    const missingType = S.dataType === 'video' ? 'video' : S.dataType === 'image' ? 'image' : 'message';
    res.innerHTML = `Cannot reconstruct the complete ${missingType}: ${miss} packet${miss > 1 ? 's are' : ' is'} missing.${S.dataType === 'text' && prefix.length ? `<div class="partial">Only the in-order prefix can be read: <code>${esc(part)}</code></div>` : ''}`;
    $('#rhint').textContent = S.dataType === 'text' ? 'A missing packet leaves a hole that decoding cannot bridge. A cut-off multi-byte character would show as �.' : 'A missing packet leaves a gap in the binary file, so the complete ' + missingType + ' cannot be played or displayed.';
    return;
  }
  flag('rebuilt');
  if (S.dataType === 'image' || S.dataType === 'video') {
    const imageBytes = new Uint8Array(S.bytes.length);
    let byteOffset = 0;
    for (const packet of r.got) {
      imageBytes.set(packet, byteOffset);
      byteOffset += packet.length;
    }
    const isVideo = S.dataType === 'video';
    const blob = new Blob([imageBytes], { type: isVideo ? (S.videoMimeType || 'video/mp4') : (S.imageMimeType || 'application/octet-stream') });
    if (S.reconstructedImageUrl) URL.revokeObjectURL(S.reconstructedImageUrl);
    if (S.reconstructedVideoUrl) URL.revokeObjectURL(S.reconstructedVideoUrl);
    const url = URL.createObjectURL(blob);
    if (isVideo) {
      S.reconstructedVideoUrl = url;
      const player = document.createElement('video'); player.src = url; player.controls = true; player.preload = 'metadata'; player.className = 'reconstructed-video';
      res.replaceChildren(player); res.classList.add('video-result');
      $('#rhint').textContent = 'All ' + S.bytes.length.toLocaleString() + ' bytes were reassembled in sequence. Reconstructed ' + (S.videoName || 'video') + ' (' + (blob.size / (1024 * 1024)).toFixed(2) + ' MB).';
    } else {
      S.reconstructedImageUrl = url;
      const img = document.createElement('img'); img.src = url; img.alt = 'Reconstructed image'; img.className = 'reconstructed-image';
      res.replaceChildren(img); res.classList.add('image-result');
      $('#rhint').textContent = 'All ' + S.bytes.length.toLocaleString() + ' bytes were reassembled in sequence. Reconstructed ' + (S.imageName || 'image') + ' (' + (blob.size / 1024).toFixed(2) + ' KB).';
    }
    return;
  }
  $('#rhint').textContent = 'Slots are joined in sequence order, then the byte stream is decoded as UTF-8.';
  const t = Array.from(dec.decode(new Uint8Array(r.got.flat())));
  let k = 0;
  res.textContent = '';
  res.classList.add('caret');
  // Typewriter effect: append one character per tick. The timer handle is kept in S.timer so
  // route() can stop it when the learner leaves.
  S.timer = setInterval(
    () => {
      res.firstChild ? (res.firstChild.nodeValue += t[k]) : res.append(t[k]);
      if (++k >= t.length) {
        clearInterval(S.timer);
        res.classList.remove('caret');
      }
    },
    REDUCE ? 5 : 90
  );
  if (!t.length) {
    clearInterval(S.timer);
    res.classList.remove('caret');
  }
}
