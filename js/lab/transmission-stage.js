/**
 * core lab stage 3: stop-and-wait delivery over a lossy link
 *
 * The animated sender/receiver simulation: for every packet it rolls dice for loss and corruption,
 * retries up to the limit, logs events, and records the result in S.run. It is an async function with many
 * "await" pauses, so it checks a cancellation token (alive()) after every pause; this lets the Stop button, the
 * link toggle or navigating away cancel a run cleanly.
 *
 * Imports:
 *   - ../core/utils.js (tiny DOM, math and timing helpers): $, REDUCE, sleep
 *   - ../core/state.js (shared in-memory state): S
 *   - ../core/encoding.js (bytes, hex, bits and UTF-8 helpers): hex
 *   - ../simulations/packetization.js (packet layout of the core lab): packetCrc
 *   - ../app/progress.js (achievements, flags and statistics): P_RUNS_ADD, flag
 *   - ./packet-stage.js (core lab stage 2: cut the byte stream into packets): labSplit
 *   - ./top-stats.js (top-bar counters): setTop
 *
 * Exports: labPrepare, syncGo, transmit
 *
 * Used by: app/router.js, lab/lab-init.js
 */

import { hex } from '../core/encoding.js';
import { S } from '../core/state.js';
import { $, REDUCE, sleep } from '../core/utils.js';
import { packetCrc } from '../simulations/packetization.js';
import { flag, P_RUNS_ADD } from '../app/progress.js';
import { labSplit } from './packet-stage.js';
import { setTop } from './top-stats.js';

/**
 * Animates the moving packet/ACK label along the wire with the Web Animations API.
 *
 * @returns {Promise} resolves when the animation finishes.
 */
const fly = async (el, to, ms) => {
  // Never let a previous fill-forwards animation compete with this movement.
  el.getAnimations().forEach(animation => animation.cancel());
  const from = el.style.left || '0%';
  const animation = el.animate([{ left: from }, { left: to }], {
    duration: REDUCE ? 30 : ms,
    easing: 'ease-in-out',
    fill: 'none',
  });
  await animation.finished;
  // Commit the final position to the element itself before disposing the animation.
  el.style.left = to;
  animation.cancel();
};

/**
 * Adds a line to the event log and (optionally) stores it in the current run so it can be redrawn later.
 */
function logLine(t, cls, msg, store = true) {
  const li = document.createElement('li');
  li.innerHTML = `<span class="tag ${cls}">${t}</span>${msg}`;
  $('#log').prepend(li);
  if (store && S.run) S.run.log.push([t, cls, msg]);
}

/**
 * Stage 3 set-up: draws the queues and, if a run already exists, redraws its log and final state.
 */
function senderQueueMarkup() {
  if (S.dataType !== 'image' || S.P.length <= 48) {
    return S.P.map((_, i) => `<span class="chip c${i % 4}" id="q${i}">P${i + 1}</span>`).join('');
  }
  return '<span class="hint">Image transfer · ' + S.P.length.toLocaleString() + ' packets processed in batches (sample shown)</span>' +
    S.P.slice(0, 12).map((_, i) => `<span class="chip c${i % 4}" id="q${i}">P${i + 1}</span>`).join('');
}

export function labPrepare() {
  if (!S.P.length) labSplit();
  $('#sq').innerHTML = senderQueueMarkup();
  $('#rq').innerHTML = '';
  $('#log').innerHTML = '';
  const r = S.run;
  if (r) {
    r.log.forEach(l => logLine(l[0], l[1], l[2], false));
    const queueLimit = S.dataType === 'image' ? 12 : S.P.length;
    for (let i = 0; i < queueLimit; i++) {
      const chip = $('#q' + i);
      if (chip) chip.classList.add(r.got[i] ? 'ok' : 'bad');
    }
    const arrivedPreview = r.arr.slice(0, S.dataType === 'image' ? 24 : r.arr.length);
    $('#rq').innerHTML = (r.arr.length > arrivedPreview.length ? '<span class="hint">' + r.arr.length.toLocaleString() + ' packets received; sample shown</span>' : '') +
      arrivedPreview.map(i => `<span class="chip c${i % 4} ok live">P${i + 1}</span>`).join('');
    const miss = r.got.filter(x => !x).length;
    $('#sp').textContent = r.stopped ? 'Stopped' : miss ? 'Gave up' : 'All sent';
    $('#rp').textContent = miss ? `${miss} missing` : 'Everything arrived';
    $('#st').textContent = r.stopped
      ? 'Stopped by you.'
      : miss
        ? 'Transmission incomplete. Open the receiver to see the gap.'
        : 'Transmission complete. Open the receiver to see the result.';
    setTop(undefined, S.P.length, r.retries);
  } else {
    $('#sp').textContent = 'Ready';
    $('#rp').textContent = 'Waiting';
    $('#st').textContent = S.P.length
      ? 'Press Transmit to start.'
      : 'Type a message first, there is nothing to send.';
    $('#log').innerHTML = '<li><span class="tag">INFO</span>Nothing sent yet.</li>';
  }
  syncGo();
}

/**
 * Enables/disables the Transmit and Stop buttons from S.up, S.busy and whether packets exist.
 */
export function syncGo() {
  const go = $('#go');
  if (!go) return;
  go.textContent = S.up ? 'Transmit packets' : 'Link is down';
  go.toggleAttribute('disabled', !S.up || S.busy || !S.P.length);
  $('#stop').toggleAttribute('disabled', !S.busy);
}

/**
 * Stage 3: runs the stop-and-wait transmission animation.
 *
 * For each packet: send, then roll for loss and corruption. A lost packet gives no ACK; a corrupted one fails its CRC and is discarded; either way the sender retries until the retry limit. After every await it calls alive(): if S.tok changed (Stop, link toggled, navigation) the run is abandoned.
 * @returns {Promise<void>}
 */
export async function transmit() {
  if (S.busy || !S.up) return;
  if (!S.P.length) labSplit();
  if (!S.P.length) {
    $('#st').textContent = 'Enter text or choose an image first.';
    return;
  }
  const imageMode = S.dataType === 'image';
  const tok = ++S.tok;
  S.busy = true;
  const alive = () => tok === S.tok;
  const P = S.P;
  const order = Array.from({ length: P.length }, (_, i) => i);
  if ($('#ord').value === 'r') {
    order.reverse();
    flag('reverse');
  }
  const loss = +$('#loss').value / 100;
  const corrupt = +$('#corr').value / 100;
  const maxRetry = +$('#retries').value;
  const speed = +$('#spd').value;
  // Image packets are grouped into small visible patches. Each patch gets a
  // deliberate travel animation so learners can follow it across the link.
  const batchSize = imageMode ? 16 : 1;
  const imagePatchDuration = Math.max(650, 900 / speed);
  S.run = {
    arr: [],
    got: Array(P.length).fill(null),
    retries: 0,
    log: [],
    cfg: { loss: +$('#loss').value, corrupt: +$('#corr').value, order: $('#ord').value },
    sent: 0,
    failed: 0,
    batchSize
  };
  const run = S.run;
  labPrepareQuiet();
  syncGo();
  const pkt = $('#pkt'), ack = $('#ack');
  $('#sp').textContent = 'Transmitting';
  $('#rp').textContent = 'Waiting';
  const reset = el => {
    el.getAnimations().forEach(a => a.cancel());
    el.style.left = '0%';
    el.style.opacity = 0;
    el.className = 'fly';
    el.style.background = '';
    el.style.color = '';
  };
  const stopped = () => {
    reset(pkt); reset(ack);
    S.busy = false;
    if (S.stopTok === tok) {
      run.stopped = true;
      $('#sp').textContent = 'Stopped';
      $('#st').textContent = 'Stopped by you.';
      syncGo();
    } else if (S.run === run) S.run = null;
  };
  let progress = $('#imageTransferProgress');
  if (imageMode && !progress) {
    progress = document.createElement('div');
    progress.id = 'imageTransferProgress';
    progress.className = 'image-transfer-progress';
    progress.innerHTML = '<div class="image-transfer-progress-track"><span></span></div><p aria-live="polite"></p>';
    $('#st').after(progress);
  }
  const updateProgress = () => {
    if (!imageMode || !progress) return;
    const pct = Math.round((run.sent / P.length) * 100);
    const deliveredPct = Math.round((run.arr.length / P.length) * 100);
    progress.querySelector('span').style.width = pct + '%';
    progress.querySelector('p').textContent =
      run.sent.toLocaleString() + ' / ' + P.length.toLocaleString() +
      ' packets processed · ' + run.arr.length.toLocaleString() + ' delivered · '
      run.retries.toLocaleString() + ' retries · ' + pct + '%';
  };
  logLine('START', '', `Sending ${P.length.toLocaleString()} packet${P.length === 1 ? '' : 's'}` +
    (imageMode ? ` in visible patches of ${batchSize} packets` : '') +
    ` at ${run.cfg.loss}% loss and ${run.cfg.corrupt}% corruption.`);
  for (let offset = 0; offset < order.length; offset += batchSize) {
    const batch = order.slice(offset, offset + batchSize);
    reset(pkt);
    pkt.textContent = imageMode ? 'Patch ' + (Math.floor(offset / batchSize) + 1) + ' · ' + batch.length + ' packets' : 'P' + (batch[0] + 1);
    pkt.className = 'fly';
    pkt.style.opacity = 1;
    pkt.style.background = '';
    $('#st').textContent = imageMode
      ? `Transmitting patch ${Math.floor(offset / batchSize) + 1} of ${Math.ceil(P.length / batchSize)} (${batch.length} packets)...`
      : `Sending packet ${batch[0] + 1}...`;
    if (imageMode) {
      await fly(pkt, '100%', imagePatchDuration);
      if (!alive()) return stopped();
    }

    let batchReceived = 0, batchLost = 0, batchCorrupt = 0;
    if (imageMode) {
      // Image batches are transmitted in visible rounds. The first round sends
      // every packet; each later round visibly retransmits only packets that
      // were lost or failed their integrity check in the previous round.
      let pending = batch.slice();
      for (let attempt = 0; attempt <= maxRetry && pending.length; attempt++) {
        if (attempt > 0) {
          reset(pkt);
          pkt.textContent = 'Retry patch ' + (Math.floor(offset / batchSize) + 1) +
            ' · attempt ' + attempt + ' · ' + pending.length + ' packets';
          pkt.className = 'fly retry';
          pkt.style.opacity = 1;
          $('#st').textContent = `Retransmitting patch ${Math.floor(offset / batchSize) + 1}: ${pending.length} packet(s), retry ${attempt} of ${maxRetry}...`;
          run.retries += pending.length;
          setTop(undefined, undefined, run.retries);
          flag('retry');
          await fly(pkt, '100%', imagePatchDuration);
          if (!alive()) return stopped();
        }

        const stillPending = [];
        let roundReceived = 0, roundLost = 0, roundCorrupt = 0;
        for (const i of pending) {
          const isLost = !S.up || Math.random() < loss;
          const isBad = !isLost && Math.random() < corrupt;
          if (isLost) {
            roundLost++;
            batchLost++;
            stillPending.push(i);
            continue;
          }
          if (isBad) {
            roundCorrupt++;
            batchCorrupt++;
            stillPending.push(i);
            continue;
          }

          run.got[i] = P[i];
          run.arr.push(i);
          batchReceived++;
          roundReceived++;
          const q = $('#q' + i);
          if (q) { q.classList.remove('bad', 'live'); q.classList.add('ok'); }
          if (run.arr.length <= 24) {
            const receivedChip = document.createElement('span');
            receivedChip.className = `chip c${i % 4} ok live`;
            receivedChip.textContent = 'P' + (i + 1);
            $('#rq').append(receivedChip);
          } else if (run.arr.length === 25) {
            const receivedHint = document.createElement('span');
            receivedHint.className = 'hint';
            receivedHint.textContent = 'Showing first 24 received packets; full count is in the progress summary.';
            $('#rq').prepend(receivedHint);
          }
          flag('delivered');
        }

        if (attempt > 0) {
          logLine('RETRY', 're',
            `Patch ${Math.floor(offset / batchSize) + 1}, retry ${attempt}: ${pending.length} packet(s) retransmitted; ${roundReceived} delivered.`);
        }
        if (roundLost) logLine('LOSS', 'bad', `${roundLost} packet attempt(s) were lost in patch ${Math.floor(offset / batchSize) + 1}.`);
        if (roundCorrupt) logLine('CRC', 'bad', `${roundCorrupt} packet attempt(s) failed CRC in patch ${Math.floor(offset / batchSize) + 1}; retransmission queued.`);

        pending = stillPending;
        if (pending.length && attempt < maxRetry) {
          pkt.textContent = 'Waiting for retry · ' + pending.length + ' packets';
          await sleep(300);
          if (!alive()) return stopped();
        }
      }

      if (pending.length) {
        run.failed += pending.length;
        pending.forEach(i => {
          const q = $('#q' + i);
          if (q) { q.classList.remove('live'); q.classList.add('bad'); }
        });
        logLine('FAIL', 'bad',
          `Patch ${Math.floor(offset / batchSize) + 1}: ${pending.length} packet(s) still missing after ${maxRetry} retries.`);
      }
      run.sent += batch.length;
    } else {
      for (const i of batch) {
        let ok = false;
        for (let attempt = 0; attempt <= maxRetry && !ok; attempt++) {
          const isLost = !S.up || Math.random() < loss;
          const isBad = !isLost && Math.random() < corrupt;
          const q = $('#q' + i);
          if (attempt > 0) {
            run.retries++;
            setTop(undefined, undefined, run.retries);
            batchRetries++;
            flag('retry');
          }
          if (q) q.classList.add('live');
          reset(pkt);
          pkt.textContent = 'P' + (i + 1);
          pkt.className = 'fly';
          pkt.style.opacity = 1;
          $('#st').textContent = attempt
            ? `Retransmitting packet ${i + 1} (retry ${attempt} of ${maxRetry})...`
            : `Sending packet ${i + 1}...`;
          logLine(attempt ? 'RETRY' : 'SEND', attempt ? 're' : '', `Packet ${i + 1} ${attempt ? 'sent again' : 'sent'}.`);
          await fly(pkt, isLost ? '50%' : '100%', 900 / speed);
          if (!alive()) return stopped();
          if (isLost) {
            batchLost++;
            pkt.className = 'fly lost';
            logLine('LOST', 'bad', `Packet ${i + 1} vanished on the link. No ACK.`);
            await sleep(450 / speed);
            if (!alive()) return stopped();
            reset(pkt);
            if (q) { q.classList.remove('live'); q.classList.add('bad'); }
            await sleep(550 / speed);
            if (!alive()) return stopped();
            if (q) q.classList.remove('bad');
            continue;
          }
          if (isBad) {
            batchCorrupt++;
            const expected = packetCrc(i, P[i], imageMode);
            const seen = expected ^ (1 << Math.floor(Math.random() * 8));
            pkt.className = 'fly corrupt';
            logLine('CRC', 'bad', `Packet ${i + 1} failed CRC: expected ${hex(expected)}, received ${hex(seen)}. Discarded.`);
            await sleep(700 / speed);
            if (!alive()) return stopped();
            reset(pkt);
            if (q) { q.classList.remove('live'); q.classList.add('bad'); }
            await sleep(450 / speed);
            if (!alive()) return stopped();
            if (q) q.classList.remove('bad');
            continue;
          }
          ok = true;
          run.got[i] = P[i];
          run.arr.push(i);
          batchReceived++;
          const receivedChip = document.createElement('span');
          receivedChip.className = `chip c${i % 4} ok live`;
          receivedChip.textContent = 'P' + (i + 1);
          $('#rq').append(receivedChip);
          flag('delivered');
          if (q) q.classList.add('ok');
          reset(pkt);
          ack.textContent = 'ACK ' + (i + 1);
          ack.style.opacity = 1;
          ack.style.left = '100%';
          $('#st').textContent = `Packet ${i + 1} arrived intact. ACK on its way back.`;
          await fly(ack, '0%', 700 / speed);
          if (!alive()) return stopped();
          reset(ack);
          ack.style.left = '100%';
          if (q) { q.classList.remove('live'); q.classList.add('ok'); }
          logLine('ACK', 'ok', `Packet ${i + 1} acknowledged.`);
          await sleep(250 / speed);
          if (!alive()) return stopped();
        }
        if (!ok) {
          run.failed++;
          const q = $('#q' + i);
          if (q) q.classList.add('bad');
          logLine('FAIL', 'bad', `Packet ${i + 1} gave up after ${maxRetry + 1} attempt(s).`);
        }
        run.sent++;
      }
    }
    if (imageMode) {
      logLine('BATCH', batchReceived === batch.length ? 'ok' : 'warn',
        `Patch ${Math.floor(offset / batchSize) + 1}: ${batchReceived}/${batch.length} packets received in this patch; ${run.arr.length}/${P.length} delivered overall.`);
    }
    updateProgress();
    $('#rp').textContent = `${run.arr.length.toLocaleString()} of ${P.length.toLocaleString()} received`;
    if (imageMode) {
      $('#st').textContent = `Processed ${run.sent.toLocaleString()} of ${P.length.toLocaleString()} packets; ${run.arr.length.toLocaleString()} delivered overall. ${batchReceived} arrived in the latest patch.`;
      await sleep(Math.max(80, 140 / speed));
      if (!alive()) return stopped();
    }
    reset(pkt);
  }
  const miss = run.got.filter(x => !x).length;
  $('#sp').textContent = miss ? 'Gave up' : 'All sent';
  $('#rp').textContent = miss ? `${miss.toLocaleString()} missing` : 'Everything arrived';
  $('#st').textContent = miss
    ? `Transmission incomplete: ${miss.toLocaleString()} packet(s) remain missing. Open the receiver to inspect the gaps.`
    : `Transmission complete. All ${P.length.toLocaleString()} packets arrived and passed their checks.`;
  if (imageMode) updateProgress();
  S.busy = false;
  syncGo();
  flag('transmitted');
  if (!miss && !run.retries && run.cfg.loss >= 30) flag('perfect');
  P_RUNS_ADD({
    ts: Date.now(),
    loss: run.cfg.loss,
    corrupt: run.cfg.corrupt,
    packets: P.length,
    retries: run.retries,
    ok: !miss
  });
}
/**
 * Resets queues and log for a new run without redrawing an old one.
 */
function labPrepareQuiet() {
  $('#sq').innerHTML = senderQueueMarkup();
  $('#rq').innerHTML = '';
  $('#log').innerHTML = '';
  setTop(undefined, S.P.length, 0);
}
