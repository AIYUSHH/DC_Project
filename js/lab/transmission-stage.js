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
const fly = (el, to, ms) =>
  el.animate([{ left: el.style.left || '0%' }, { left: to }], {
    duration: REDUCE ? 30 : ms,
    easing: 'ease-in-out',
    fill: 'forwards',
  }).finished;

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
export function labPrepare() {
  if (!S.P.length) labSplit();
  $('#sq').innerHTML = S.P.map(
    (_, i) => `<span class="chip c${i % 4}" id="q${i}">P${i + 1}</span>`
  ).join('');
  $('#rq').innerHTML = '';
  $('#log').innerHTML = '';
  const r = S.run;
  if (r) {
    r.log.forEach(l => logLine(l[0], l[1], l[2], false));
    S.P.forEach((_, i) => $('#q' + i).classList.add(r.got[i] ? 'ok' : 'bad'));
    $('#rq').innerHTML = r.arr
      .map(i => `<span class="chip c${i % 4} ok live">P${i + 1}</span>`)
      .join('');
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
    $('#st').textContent = 'Type a message first, there is nothing to send.';
    return;
  }
  // Cancellation token. Starting a run bumps the shared S.tok; the Stop button, link toggle and
  // route changes bump it again, so this run can tell it is no longer current.
  const tok = ++S.tok;
  S.busy = true;
  // True while nobody has cancelled this run.
  const alive = () => tok === S.tok;
  const P = S.P,
    order = P.map((_, i) => i);
  if ($('#ord').value === 'r') {
    order.reverse();
    flag('reverse');
  }
  const loss = +$('#loss').value / 100,
    corrupt = +$('#corr').value / 100,
    maxRetry = +$('#retries').value,
    spd = +$('#spd').value;
  S.run = {
    arr: [],
    got: Array(P.length).fill(null),
    retries: 0,
    log: [],
    cfg: { loss: +$('#loss').value, corrupt: +$('#corr').value, order: $('#ord').value },
  };
  const run = S.run;
  labPrepareQuiet();
  syncGo();
  const pkt = $('#pkt'),
    ack = $('#ack');
  $('#sp').textContent = 'Transmitting';
  $('#rp').textContent = 'Waiting';
  const reset = el => {
    el.getAnimations().forEach(a => a.cancel());
    el.style.left = '0%';
    el.style.opacity = 0;
    el.className = 'fly';
    el.style.background = '';
  };
  const stopped = () => {
    reset(pkt);
    reset(ack);
    S.busy = false;
    if (S.stopTok === tok) {
      run.stopped = true;
      $('#sp').textContent = 'Stopped';
      $('#st').textContent = 'Stopped by you.';
      syncGo();
    } else if (S.run === run) S.run = null;
  };
  logLine(
    'START',
    '',
    `Sending ${P.length} packet${P.length > 1 ? 's' : ''} at ${run.cfg.loss}% loss and ${run.cfg.corrupt}% corruption.`
  );
  for (const i of order) {
    let ok = false;
    for (let a = 0; a <= maxRetry && !ok; a++) {
      const q = $('#q' + i);
      // Each attempt rolls for loss independently (a down link loses everything). Corruption is
      // only rolled for packets that were not lost.
      const isLost = !S.up || Math.random() < loss,
        isBad = !isLost && Math.random() < corrupt;
      q.classList.add('live');
      pkt.textContent = 'P' + (i + 1);
      pkt.className = 'fly';
      pkt.style.opacity = 1;
      pkt.style.background = '';
      if (a) {
        run.retries++;
        setTop(undefined, undefined, run.retries);
        flag('retry');
      }
      $('#st').textContent = a
        ? `Retransmitting packet ${i + 1} (retry ${a} of ${maxRetry})...`
        : `Sending packet ${i + 1}...`;
      logLine(
        a ? 'RETRY' : 'SEND',
        a ? 're' : '',
        `Packet ${i + 1} ${a ? 'sent again' : 'sent'}${!S.up ? ' while the link is down' : ''}.`
      );
      // A lost packet only travels halfway along the wire before it vanishes.
      await fly(pkt, isLost ? '50%' : '100%', 900 / spd);
      // After every await, check whether the run was cancelled while it was paused; if so, clean
      // up and leave.
      if (!alive()) return stopped();
      if (isLost) {
        pkt.className = 'fly pop';
        await sleep(450 / spd);
        if (!alive()) return stopped();
        reset(pkt);
        q.classList.remove('live');
        q.classList.add('bad');
        $('#st').textContent = `Packet ${i + 1} was lost. No ACK came back.`;
        logLine('LOST', 'bad', `Packet ${i + 1} vanished on the link.`);
        await sleep(550 / spd);
        if (!alive()) return stopped();
        q.classList.remove('bad');
        continue;
      }
      if (isBad) {
        const good = packetCrc(i, P[i]),
          // Simulated corruption: flip one random bit of the CRC (XOR with a single set bit), so
          // the receiver's computed value no longer matches.
          seen = good ^ (1 << Math.floor(Math.random() * 8));
        pkt.style.background = 'var(--coral)';
        $('#st').textContent = `Packet ${i + 1} arrived damaged. CRC mismatch, so it is discarded.`;
        logLine(
          'CRC',
          'bad',
          `Packet ${i + 1} failed its check: expected ${hex(good)}, computed ${hex(seen)}. Discarded, no ACK.`
        );
        await sleep(700 / spd);
        if (!alive()) return stopped();
        reset(pkt);
        q.classList.remove('live');
        q.classList.add('bad');
        await sleep(450 / spd);
        if (!alive()) return stopped();
        q.classList.remove('bad');
        continue;
      }
      ok = true;
      reset(pkt);
      run.got[i] = P[i];
      run.arr.push(i);
      flag('delivered');
      $('#rp').textContent = `${run.arr.length} of ${P.length} received`;
      $('#rq').insertAdjacentHTML(
        'beforeend',
        `<span class="chip c${i % 4} live">P${i + 1}</span>`
      );
      ack.textContent = 'ACK ' + (i + 1);
      ack.style.opacity = 1;
      ack.style.left = '100%';
      $('#st').textContent = `Packet ${i + 1} arrived intact. ACK on its way back.`;
      await fly(ack, '0%', 700 / spd);
      if (!alive()) return stopped();
      reset(ack);
      ack.style.left = '100%';
      q.classList.remove('live');
      q.classList.add('ok');
      logLine('ACK', 'ok', `Packet ${i + 1} acknowledged.`);
      await sleep(250 / spd);
      if (!alive()) return stopped();
    }
    if (!ok) {
      $('#q' + i).classList.add('bad');
      logLine(
        'FAIL',
        'bad',
        `Packet ${i + 1} gave up after ${maxRetry + 1} attempt${maxRetry ? 's' : ''}.`
      );
    }
  }
  const miss = run.got.filter(x => !x).length;
  $('#sp').textContent = miss ? 'Gave up' : 'All sent';
  $('#rp').textContent = miss ? `${miss} missing` : 'Everything arrived';
  $('#st').textContent = miss
    ? 'Transmission incomplete. Open the receiver to see the gap.'
    : 'Transmission complete. Open the receiver to see the result.';
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
    ok: !miss,
  });
}

/**
 * Resets queues and log for a new run without redrawing an old one.
 */
function labPrepareQuiet() {
  $('#sq').innerHTML = S.P.map(
    (_, i) => `<span class="chip c${i % 4}" id="q${i}">P${i + 1}</span>`
  ).join('');
  $('#rq').innerHTML = '';
  $('#log').innerHTML = '';
  setTop(undefined, S.P.length, 0);
}
