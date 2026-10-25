/**
 * TCP congestion-window and retransmission-timer models
 *
 * simCong() models how a TCP sender grows and shrinks its congestion window round by round
 * (slow start, congestion avoidance, Tahoe vs Reno loss reactions). rtoCalc() applies the RFC 6298 formulas
 * that smooth round-trip-time samples into a retransmission timeout. Both are pure.
 *
 * Imports:
 *   (none)
 *
 * Exports: rtoCalc, simCong
 *
 * Used by: modules/transport-layer/congestion.js
 */

/**
 * Models the TCP congestion window round by round.
 *
 * Slow start doubles the window each round until it reaches ssthresh; congestion avoidance then adds one segment per round. On loss, ssthresh becomes half the in-flight window. Reno recovers from three duplicate ACKs by continuing from ssthresh; a timeout (or Tahoe on any loss) restarts from 1.
 * @param {Object} o
 * @param {number} o.rounds
 * @param {number} o.ss0 - initial ssthresh.
 * @param {number} o.rwnd - receiver window cap (flow control).
 * @param {'reno'|'tahoe'} o.algo
 * @param {Object<number,'dup'|'to'>} o.loss - round -> kind of loss event.
 * @returns {Array<{r:number,cwnd:number,eff:number,ss:number,phase:string,loss:?string,note:string}>}
 */
export function simCong({ rounds = 20, ss0 = 16, rwnd = 64, algo = 'reno', loss = {} }) {
  let cw = 1,
    ss = ss0;
  const rows = [];
  for (let r = 0; r < rounds; r++) {
    const eff = Math.min(cw, rwnd),
      phase = cw < ss ? 'Slow start' : 'Congestion avoidance';
    const row = { r, cwnd: cw, eff, ss, phase, loss: loss[r] || null, note: '' };
    if (loss[r]) {
      // Multiplicative decrease: on loss, ssthresh becomes half of what was in flight (never below
      // 2 segments).
      ss = Math.max(Math.floor(eff / 2), 2);
      if (algo === 'reno' && loss[r] === 'dup') {
        cw = ss;
        row.note = 'Fast retransmit and fast recovery: window halves';
      } else {
        cw = 1;
        row.note =
          loss[r] === 'to' ? 'Timeout: window collapses to 1' : 'Tahoe: window collapses to 1';
      }
    // No loss: slow start doubles the window each round (up to ssthresh); congestion avoidance
    // adds one segment per round.
    } else cw = cw < ss ? Math.min(cw * 2, ss) : cw + 1;
    rows.push(row);
  }
  return rows;
}

/**
 * Computes TCP's retransmission timeout from RTT samples (RFC 6298).
 *
 * SRTT is a smoothed average (weight 1/8 on the new sample); RTTVAR tracks the deviation (weight 1/4). RTO = SRTT + 4 x RTTVAR, never below minRto.
 * @param {number[]} samples - measured round-trip times.
 * @param {number} [minRto=1]
 * @returns {Array<{n:number,r:number,srtt:number,rttvar:number,rto:number}>}
 */
export function rtoCalc(samples, minRto = 1) {
  let srtt = null,
    rttvar = null;
  return samples.map((r, i) => {
    if (srtt === null) {
      srtt = r;
      // First sample (RFC 6298): SRTT = R, RTTVAR = R / 2.
      rttvar = r / 2;
    } else {
      // Exponentially weighted average of the deviation (beta = 1/4). Uses the old SRTT, so it
      // must run before SRTT is updated.
      rttvar = 0.75 * rttvar + 0.25 * Math.abs(srtt - r);
      // Exponentially weighted average of the RTT (alpha = 1/8): recent samples count a little,
      // history counts a lot.
      srtt = 0.875 * srtt + 0.125 * r;
    }
    const rto = Math.max(minRto, srtt + 4 * rttvar);
    return { n: i + 1, r, srtt, rttvar, rto };
  });
}
