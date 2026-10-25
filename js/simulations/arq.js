/**
 * discrete-event ARQ simulators (Stop-and-Wait, Go-Back-N, Selective Repeat)
 *
 * Pure logic for the reliable-transfer modules: no DOM access. Each simulator runs a small
 * "discrete-event" loop: a time-ordered queue of events (frame arrives, ACK arrives, timer fires) is processed
 * until all frames are delivered. The result is a list of messages and marks that the UI draws as a ladder diagram.
 *
 * Imports:
 *   (none)
 *
 * Exports: simSW, simWin
 *
 * Used by: modules/link-layer/sliding-window.js, modules/link-layer/stop-and-wait.js
 */

/**
 * Simulates Stop-and-Wait ARQ.
 *
 * The sender sends one frame, starts a timer and waits for the matching ACK; a 1-bit sequence number (0/1 alternating) lets the receiver tell a new frame from a retransmitted copy.
 * @param {Object} o
 * @param {number} o.N - frames to deliver.
 * @param {number} o.T - timeout, in time units.
 * @param {number} o.d - one-way delay.
 * @param {(n:number, frame:number, attempt:number)=>boolean} o.loseData - decides whether this transmission is lost.
 * @param {(n:number, frame:number, attempt:number)=>boolean} o.loseAck - same for ACKs.
 * @param {number} o.maxTries - give up after this many attempts of one frame.
 * @returns {{msgs:Array, marks:Array, done:boolean, failed:boolean, stats:Object}}
 */
export function simSW({
  N = 5,
  T = 2.5,
  d = 1,
  loseData = () => false,
  loseAck = () => false,
  maxTries = 8,
}) {
  const msgs = [],
    marks = [],
    q = [];
  let cnt = 0,
    txD = 0,
    txA = 0,
    i = 0,
    attempt = 0,
    bit = 0,
    tok = 0,
    exp = 0;
  let delivered = 0,
    dups = 0,
    stale = 0,
    retx = 0,
    done = false,
    failed = false,
    endT = 0;
  const push = (t, type, data) => {
    q.push({ t, type, data, n: cnt++ });
    q.sort((a, b) => a.t - b.t || a.n - b.n);
  };
  const send = t => {
    attempt++;
    if (attempt > 1) retx++;
    const lost = loseData(txD++, i, attempt);
    msgs.push({
      t0: t,
      t1: t + d,
      dir: 'lr',
      label: `D${bit}${attempt > 1 ? ' retry' : ''}  (frame ${i})`,
      cls: lost ? 'c1' : attempt > 1 ? 'c3' : 'c0',
      lost,
      idx: msgs.length,
    });
    if (!lost) push(t + d, 'data', { bit });
    tok++;
    push(t + T, 'timeout', { tok });
  };
  // Event loop: always handle the earliest pending event (a frame arrives, an ACK arrives, or a
  // timer fires) until the transfer finishes or fails.
  send(0);
  let guard = 0;
  while (q.length && !done && !failed && guard++ < 2000) {
    const e = q.shift(),
      t = e.t;
    if (e.type === 'data') {
      // Receiver: a frame carrying the expected 0/1 is new; the other value is a duplicate (our
      // ACK was lost and the sender resent).
      if (e.data.bit === exp) {
        delivered++;
        exp ^= 1;
      } else dups++;
      const lost = loseAck(txA++, i, attempt);
      msgs.push({
        t0: t,
        t1: t + d,
        dir: 'rl',
        label: `ACK ${exp}${e.data.bit !== (exp ^ 1) ? ' (dup)' : ''}`,
        cls: lost ? 'c1' : 'c2',
        lost,
        idx: msgs.length,
      });
      if (!lost) push(t + d, 'ack', { ack: exp });
    } else if (e.type === 'ack') {
      // ACK n means "I expect n next", so the ACK for the frame just sent carries the flipped bit.
      // Anything else is a stale ACK from an earlier round and is ignored.
      if (e.data.ack === (bit ^ 1)) {
        tok++;
        i++;
        endT = t;
        if (i >= N) {
          done = true;
          break;
        }
        bit ^= 1;
        attempt = 0;
        send(t);
      } else {
        stale++;
        marks.push({ side: 'l', t, label: 'stale ACK ignored', cls: 'c4' });
      }
    // A timer only counts if its token still matches. Every send or ACK bumps tok, which cancels
    // older timers without removing them from the queue.
    } else if (e.type === 'timeout' && e.data.tok === tok) {
      marks.push({ side: 'l', t, label: 'timeout', cls: 'c3' });
      if (attempt >= maxTries) {
        failed = true;
        break;
      }
      send(t);
    }
  }
  return {
    msgs,
    marks,
    done,
    failed,
    stats: { frames: N, tx: txD, acks: txA, retx, dups, stale, delivered, time: endT },
  };
}

/* ---------- Go-Back-N and Selective Repeat with modulo sequence numbers ----------
   Protocol logic only looks at k % M, exactly like real hardware. The true frame
   index k is carried alongside so the simulator can detect wrongly accepted frames. */
/**
 * Simulates Go-Back-N or Selective Repeat with modulo sequence numbers.
 *
 * Protocol decisions use only seq = k mod M (what a real header carries); the true frame index k travels alongside so the simulator can notice when a wrong frame is accepted ("bad"). With too large a window relative to M, old and new frames share sequence numbers and corruption appears.
 * @param {Object} o
 * @param {'gbn'|'sr'} o.proto
 * @param {number} o.N - frames.
 * @param {number} o.W - window size.
 * @param {number} o.M - sequence-number space (2^bits).
 * @param {number} o.T - timeout.
 * @param {number} o.d - one-way delay.
 * @param {number} o.gap - spacing between back-to-back transmissions.
 * @returns {{msgs:Array, marks:Array, snaps:Array, done:boolean, truncated:boolean, stats:Object}} snaps are sender/receiver state snapshots for step-through.
 */
export function simWin({
  proto = 'gbn',
  N = 10,
  W = 4,
  M = 8,
  T = 5,
  d = 1,
  gap = 0.4,
  loseData = () => false,
  loseAck = () => false,
  maxTime = 90,
  maxMsgs = 120,
}) {
  const msgs = [],
    marks = [],
    snaps = [],
    q = [];
  let cnt = 0,
    txD = 0,
    txA = 0,
    sendClock = 0,
    truncated = false;
  let base = 0,
    next = 0,
    gtok = 0;
  const acked = Array(N).fill(false),
    tries = Array(N).fill(0),
    tokens = Array(N).fill(0);
  let exp = 0,
    rbase = 0,
    delivered = 0,
    bad = 0,
    discards = 0;
  const rbuf = {};
  const push = (t, type, data) => {
    q.push({ t, type, data, n: cnt++ });
    q.sort((a, b) => a.t - b.t || a.n - b.n);
  };
  const flabel = k => (M >= N ? `F${k}` : `F${k} (s${k % M})`);
  const snap = (t, text) =>
    snaps.push({
      t,
      text,
      base,
      next,
      acked: acked.slice(),
      exp,
      rbase,
      buf: Object.keys(rbuf).map(Number),
      delivered,
      bad,
    });
  const startGbn = t => {
    gtok++;
    push(t + T, 'gto', { tok: gtok });
  };

  const sendFrame = (k, t) => {
    if (msgs.length > maxMsgs) {
      truncated = true;
      return;
    }
    const ts = Math.max(t, sendClock);
    sendClock = ts + gap;
    tries[k]++;
    const lost = loseData(txD++, k, tries[k]);
    msgs.push({
      t0: ts,
      t1: ts + d,
      dir: 'lr',
      label: flabel(k) + (tries[k] > 1 ? ' again' : ''),
      cls: lost ? 'c1' : tries[k] > 1 ? 'c3' : 'c0',
      lost,
      idx: msgs.length,
    });
    if (!lost) push(ts + d, 'data', { k, seq: k % M });
    if (proto === 'gbn') {
      if (k === base && tries[k] === 1) startGbn(ts);
    } else {
      tokens[k]++;
      push(ts + T, 'sto', { k, tok: tokens[k] });
    }
    return ts;
  };
  const trySend = t => {
    while (next < N && next < base + W) {
      sendFrame(next, t);
      next++;
    }
  };
  const sendAck = (t, val, label) => {
    const lost = loseAck(txA++, val);
    msgs.push({
      t0: t,
      t1: t + d,
      dir: 'rl',
      label,
      cls: lost ? 'c1' : 'c2',
      lost,
      idx: msgs.length,
    });
    if (!lost) push(t + d, 'ack', { val });
  };

  trySend(0);
  snap(0, 'Sender fills its window');
  let guard = 0,
    endT = 0;
  while (q.length && base < N && guard++ < 4000) {
    const e = q.shift(),
      t = e.t;
    endT = t;
    if (t > maxTime || truncated) {
      truncated = true;
      break;
    }
    if (e.type === 'data') {
      const { k, seq } = e.data;
      if (proto === 'gbn') {
        // Go-Back-N receiver: accepts only the next expected sequence number. It sees only seq (k
        // mod M); k is the simulator's hidden true index, used to count wrongly accepted frames
        // ("bad") when numbers wrap too soon.
        if (seq === exp % M) {
          if (k === exp) delivered++;
          else bad++;
          exp++;
          snap(t, `Receiver accepts ${flabel(k)} in order`);
        } else {
          discards++;
          snap(t, `Receiver discards ${flabel(k)}: expected seq ${exp % M}`);
        }
        sendAck(t, exp % M, `ACK ${exp % M}`);
      } else {
        // Distance of this sequence number from the receive window base, modulo M (adding M avoids
        // negatives). Less than W means the frame is inside the window.
        const off = (seq - (rbase % M) + M) % M;
        if (off < W) {
          const idx = rbase + off;
          if (rbuf[idx] === undefined && idx >= rbase) rbuf[idx] = k;
          sendAck(t, seq, `ACK ${seq}`);
          while (rbuf[rbase] !== undefined) {
            if (rbuf[rbase] === rbase) delivered++;
            else bad++;
            delete rbuf[rbase];
            rbase++;
          }
          snap(t, `Receiver buffers ${flabel(k)}`);
        // Just behind the window: an old frame whose ACK was lost. Re-ACK it so the sender can
        // move on.
        } else if (off >= M - W) {
          sendAck(t, seq, `ACK ${seq} (dup)`);
          snap(t, `Receiver re-ACKs old ${flabel(k)}`);
        } else {
          discards++;
          snap(t, `Receiver ignores ${flabel(k)}`);
        }
      }
    } else if (e.type === 'ack') {
      if (proto === 'gbn') {
        // Cumulative ACK: how far does this ACK value move the window base, modulo M?
        const adv = (e.data.val - (base % M) + M) % M;
        if (adv > 0 && adv <= next - base) {
          base += adv;
          snap(t, `ACK ${e.data.val}: window slides to ${base}`);
          if (base < next) startGbn(t);
          else gtok++;
          trySend(t);
        } else snap(t, `ACK ${e.data.val} ignored`);
      } else {
        let k = -1;
        for (let j = base; j < next; j++)
          if (j % M === e.data.val && !acked[j]) {
            k = j;
            break;
          }
        if (k >= 0) {
          acked[k] = true;
          tokens[k]++;
          while (base < N && acked[base]) base++;
          snap(t, `ACK ${e.data.val}: frame ${k} confirmed`);
          trySend(t);
        } else snap(t, `ACK ${e.data.val} ignored`);
      }
    // Go-Back-N has ONE timer, for the oldest unacknowledged frame. When it fires, everything from
    // base onward is sent again.
    } else if (e.type === 'gto' && e.data.tok === gtok) {
      marks.push({ side: 'l', t, label: 'timeout', cls: 'c3' });
      let tt = t;
      for (let k = base; k < next; k++) {
        const ts = sendFrame(k, tt);
        if (k === base && ts !== undefined) {
          startGbn(ts);
        }
      }
      snap(t, `Timeout: go back and resend from ${base}`);
    } else if (e.type === 'sto' && e.data.tok === tokens[e.data.k] && !acked[e.data.k]) {
      marks.push({ side: 'l', t, label: `timeout F${e.data.k}`, cls: 'c3' });
      sendFrame(e.data.k, t);
      snap(t, `Timeout: resend only frame ${e.data.k}`);
    }
  }
  const done = base >= N;
  return {
    msgs,
    marks,
    snaps,
    done,
    truncated,
    stats: {
      frames: N,
      tx: txD,
      acks: txA,
      delivered,
      bad,
      discards,
      time: done ? endT : null,
      unique: !bad,
    },
  };
}
