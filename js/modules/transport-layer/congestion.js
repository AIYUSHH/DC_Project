/**
 * learning module: Flow and congestion control
 *
 * Congestion window chart (click to inject losses), receiver-window flow control and RTO estimation.
 *
 * This file registers one learning module with regMod(). Its mount(root) function builds the screen inside
 * `root` and attaches event handlers; the function mount() returns (if any) is its cleanup, called by the router
 * when the learner leaves, so timers and listeners do not outlive the screen. The protocol logic lives in
 * ../../simulations/ and ../../core/; this file is the user interface for it.
 *
 * Imports:
 *   - ../../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): chipRow, hn, on, panel, sel, statRow, tabset, tbl, vd
 *   - ../../core/utils.js (tiny DOM, math and timing helpers): $, $$
 *   - ../../simulations/congestion.js (TCP congestion-window and retransmission-timer models): rtoCalc, simCong
 *   - ../registry.js (learning-module registry and group definitions): regMod
 *
 * Exports: (none)
 *
 * Used by: (imported only for its side effects by app.js)
 */

import { chipRow, hn, on, panel, sel, statRow, tabset, tbl, vd } from '../../core/ui-helpers.js';
import { $, $$ } from '../../core/utils.js';
import { rtoCalc, simCong } from '../../simulations/congestion.js';
import { regMod } from '../registry.js';

/**
 * Draws the congestion-window chart as SVG.
 *
 * @param {Array} rows - output of simCong().
 * @param {number} [ymaxIn] - fixed y-axis maximum (so two charts can share a scale).
 * @param {boolean} [onclickable] - add invisible click targets so a click on a round injects a loss.
 */
function cwndChart(rows, ymaxIn, onclickable) {
  const W = 680,
    H = 270,
    L = 44,
    R = 12,
    T = 14,
    B = 34,
    n = rows.length;
  const ymax = Math.max(ymaxIn, 8),
    X = i => L + ((i + 0.5) * (W - L - R)) / n,
    Y = v => T + (H - T - B) * (1 - v / ymax);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Congestion window over time">`;
  for (let k = 0; k <= 4; k++) {
    const v = Math.round((ymax * k) / 4);
    s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  rows.forEach((r, i) => {
    if (i % 2 === 0 || n < 14)
      s += `<text class="ax" x="${X(i)}" y="${H - 16}" text-anchor="middle">${i + 1}</text>`;
  });
  s += `<text class="ax" x="${W / 2}" y="${H - 2}" text-anchor="middle">round trip</text>`;
  s += `<polyline class="ssl" points="${rows.map((r, i) => `${X(i)},${Y(r.ss)}`).join(' ')}"/>`;
  s += `<polyline class="cl" points="${rows.map((r, i) => `${X(i)},${Y(r.eff)}`).join(' ')}"/>`;
  rows.forEach((r, i) => {
    s += `<circle class="pt ${r.loss ? 'loss' : r.phase === 'Slow start' ? 'ss' : 'ca'}" cx="${X(i)}" cy="${Y(r.eff)}" r="${r.loss ? 6 : 4}"/>`;
    if (onclickable)
      s += `<rect class="hit" data-r="${i}" x="${X(i) - (W - L - R) / n / 2}" y="${T}" width="${(W - L - R) / n}" height="${H - T - B}"><title>Round ${i + 1}: click to toggle a loss</title></rect>`;
  });
  return s + '</svg>';
}

/* Register "Flow and congestion control". The router calls mount(root) when the learner opens #/m/congestion and calls the returned function (if any) when they leave. */
regMod({
  id: 'congestion',
  group: 'trn',
  title: 'Flow and congestion control',
  desc: 'See how the receiver window, slow start, congestion avoidance and the retransmission timer shape TCP speed.',
  obj: [
    'Click on the chart to cause a loss and compare Tahoe with Reno.',
    'See how a slow application throttles the sender through the receive window.',
    'Compute the retransmission timeout from round-trip samples.',
  ],
  mount(root) {
    root.innerHTML = '<div id="cgtabs"></div>';
    const tabs = tabset(
      $('#cgtabs', root),
      [
        {
          label: 'Congestion window',
          render(p) {
            let loss = { 8: 'dup' },
              algo = 'reno',
              kind = 'dup';
            p.innerHTML =
              panel(
                'Settings',
                `<div class="controls"><div class="field"><label for="ca">Algorithm</label>${sel(
                  'ca',
                  [
                    ['tahoe', 'Tahoe'],
                    ['reno', 'Reno'],
                  ],
                  'reno'
                )}</div>
          <div class="field"><label for="cs">Initial ssthresh</label>${sel(
            'cs',
            [8, 16, 32].map(x => [x, x + ' segments']),
            16
          )}</div><div class="field"><label for="cw">Receiver window cap</label>${sel(
            'cw',
            [16, 32, 64, 128].map(x => [x, x + ' segments']),
            64
          )}</div>
          <div class="field"><label for="ck">Click on chart adds</label>${sel(
            'ck',
            [
              ['dup', '3 duplicate ACKs'],
              ['to', 'a timeout'],
            ],
            'dup'
          )}</div></div>
          <div class="btnrow wrap"><button class="btn ghost sm" data-p="none">No loss</button><button class="btn ghost sm" data-p="one">One loss</button><button class="btn ghost sm" data-p="to">One timeout</button><button class="btn ghost sm" data-p="many">Repeated losses</button></div>`,
                'The window is measured in segments and updated once per round trip. Click a round on the chart to cause a loss there.'
              ) + '<div id="cgo"></div>';
            const draw = () => {
              const ss0 = +$('#cs', p).value,
                rw = +$('#cw', p).value,
                rows = simCong({ rounds: 24, ss0, rwnd: rw, algo, loss }),
                cmp = ['tahoe', 'reno'].map(a =>
                  simCong({ rounds: 24, ss0, rwnd: rw, algo: a, loss })
                );
              const avg = r => (r.reduce((s, x) => s + x.eff, 0) / r.length).toFixed(1),
                peak = Math.max(...rows.map(r => r.eff));
              $('#cgo', p).innerHTML =
                panel(
                  'Window over time',
                  cwndChart(rows, Math.ceil(Math.max(peak, ss0) * 1.15), true) +
                    `<div class="legend"><span class="c0"><i></i>slow start</span><span class="c2"><i></i>congestion avoidance</span><span class="c1"><i></i>loss</span><span class="c3"><i></i>ssthresh</span></div>`
                ) +
                panel(
                  'Summary',
                  statRow([
                    [peak, 'peak window'],
                    [avg(rows), 'average window'],
                    [Object.keys(loss).length, 'losses'],
                    [avg(cmp[0]) + ' / ' + avg(cmp[1]), 'average: Tahoe / Reno'],
                  ]) +
                    tbl(
                      ['Round', 'Window', 'ssthresh', 'Phase', 'Event'],
                      rows.map(r => [
                        r.r + 1,
                        r.eff,
                        r.ss,
                        r.phase,
                        r.loss
                          ? (r.loss === 'dup' ? '3 duplicate ACKs. ' : 'Timeout. ') + r.note
                          : '',
                      ])
                    )
                );
            };
            $('#ca', p).onchange = e => {
              algo = e.target.value;
              draw();
            };
            $('#ck', p).onchange = e => {
              kind = e.target.value;
            };
            ['cs', 'cw'].forEach(id => {
              $('#' + id, p).onchange = draw;
            });
            on(p, 'click', '[data-r]', (e, r) => {
              const i = +r.dataset.r;
              loss[i] ? delete loss[i] : (loss[i] = kind);
              draw();
            });
            on(p, 'click', '[data-p]', (e, b) => {
              const k = b.dataset.p;
              loss =
                k === 'none'
                  ? {}
                  : k === 'one'
                    ? { 8: 'dup' }
                    : k === 'to'
                      ? { 8: 'to' }
                      : { 6: 'dup', 13: 'dup', 19: 'to' };
              draw();
            });
            draw();
          },
        },
        {
          label: 'Flow control',
          render(p) {
            p.innerHTML =
              panel(
                'Receiver buffer',
                `<div class="controls"><div class="field"><label for="fb">Receive buffer (segments)</label>${sel(
                  'fb',
                  [4, 8, 12, 16].map(x => [x, x]),
                  8
                )}</div>
          <div class="field"><label for="fr">Sender would send per tick</label>${sel(
            'fr',
            [2, 4, 6, 8].map(x => [x, x]),
            6
          )}</div><div class="field"><label for="fa">Application reads per tick</label>${sel(
            'fa',
            [1, 2, 3, 4, 6].map(x => [x, x]),
            2
          )}</div></div>`,
                'Each tick the receiver advertises how much buffer is free. The sender may only send that much. If the application reads slowly, the buffer fills and the sender is told to wait (a zero window).'
              ) + '<div id="fo"></div>';
            const f = () => {
              const B = +$('#fb', p).value,
                rate = +$('#fr', p).value,
                rd = +$('#fa', p).value,
                rows = [];
              let q = 0,
                sent = 0,
                read = 0;
              for (let t = 0; t < 20; t++) {
                const rwnd = B - q,
                  tx = Math.min(rate, rwnd);
                q += tx;
                sent += tx;
                const rv = Math.min(rd, q);
                q -= rv;
                read += rv;
                rows.push({ t, rwnd, tx, q, rv });
              }
              const W = 680,
                H = 200,
                L = 36,
                bw = (W - L - 10) / rows.length;
              let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Receiver buffer occupancy per tick">`;
              rows.forEach((r, i) => {
                const x = L + i * bw,
                  h = (H - 50) * (r.q / B);
                s += `<rect class="bufbar ${r.q >= B ? 'full' : ''}" x="${x + 2}" y="${H - 30 - h}" width="${bw - 4}" height="${h}" rx="3"/><text class="ax" x="${x + bw / 2}" y="${H - 14}" text-anchor="middle">${r.t + 1}</text>${r.rwnd === 0 ? `<text class="zw" x="${x + bw / 2}" y="16" text-anchor="middle">0</text>` : ''}`;
              });
              s += `<text class="ax" x="${L - 6}" y="${H - 30}" text-anchor="end">0</text><text class="ax" x="${L - 6}" y="24" text-anchor="end">${B}</text><text class="ax" x="${W / 2}" y="${H - 1}" text-anchor="middle">tick</text></svg>`;
              const zero = rows.filter(r => r.rwnd === 0).length,
                steady = (sent / 20).toFixed(1);
              $('#fo', p).innerHTML =
                panel(
                  'Buffer occupancy at the end of each tick',
                  s,
                  'Bars show how full the buffer is. A red “0” above a tick means the receiver advertised a zero window and the sender had to pause.'
                ) +
                panel(
                  'Result',
                  statRow([
                    [sent, 'segments sent in 20 ticks'],
                    [read, 'segments the application read'],
                    [steady, 'average send rate'],
                    [zero, 'ticks with a zero window'],
                  ]) +
                    (rd >= rate
                      ? vd(
                          'ok',
                          'The receiver keeps up.',
                          'The buffer never fills, so the sender runs at full speed.'
                        )
                      : vd(
                          'warn',
                          'The sender is throttled to the application’s speed.',
                          `After the buffer fills, the sender can only send as fast as the application reads (${rd} per tick), no matter how fast the network is.`
                        ))
                );
            };
            $$('select', p).forEach(e => {
              e.onchange = f;
            });
            f();
          },
        },
        {
          label: 'Retransmission timer',
          render(p) {
            p.innerHTML =
              panel(
                'Round-trip samples (RFC 6298)',
                `<div class="controls"><div class="field grow"><label for="rt">Samples in milliseconds</label><input id="rt" type="text" value="100, 110, 95, 120, 400, 105, 100" spellcheck="false"></div>
          <div class="field"><label for="rm">Minimum RTO</label>${sel(
            'rm',
            [
              [1, '1 s (standard)'],
              [0.2, '200 ms (Linux)'],
            ],
            1
          )}</div></div><div id="ro2"></div>`,
                'SRTT is a smoothed average, RTTVAR measures jitter, and RTO = SRTT + 4·RTTVAR. One slow sample inflates the variance and the timeout.'
              ) +
              panel(
                'Exponential backoff',
                '<p class="hint">If a retransmission also times out, the timer doubles each time, up to a limit.</p><div id="rb"></div>'
              );
            const f = () => {
              const raw = $('#rt', p)
                .value.split(',')
                .map(x => parseFloat(x))
                .filter(x => x > 0)
                .slice(0, 16);
              if (!raw.length) {
                $('#ro2', p).innerHTML = vd('warn', 'Enter some numbers.');
                return;
              }
              const min = +$('#rm', p).value,
                rows = rtoCalc(
                  raw.map(x => x / 1000),
                  min
                ),
                last = rows[rows.length - 1];
              $('#ro2', p).innerHTML = tbl(
                ['Sample', 'RTT', 'SRTT', 'RTTVAR', 'RTO'],
                rows.map(r => [
                  r.n,
                  (r.r * 1000).toFixed(0) + ' ms',
                  (r.srtt * 1000).toFixed(1) + ' ms',
                  (r.rttvar * 1000).toFixed(1) + ' ms',
                  (r.rto * 1000).toFixed(0) + ' ms',
                ])
              );
              $('#rb', p).innerHTML =
                chipRow(
                  [0, 1, 2, 3, 4, 5].map(
                    k => `${(last.rto * 2 ** k).toFixed(last.rto < 1 ? 2 : 1)} s`
                  ),
                  i => (i ? 'c3' : 'c0')
                ) +
                hn(
                  'Starting from the current RTO. Karn’s algorithm adds that RTT samples from retransmitted segments are ignored, because it is unclear which transmission the ACK answers.'
                );
            };
            $('#rt', p).oninput = f;
            $('#rm', p).onchange = f;
            f();
          },
        },
      ],
      0
    );
    return () => tabs.destroy();
  },
});
