/**
 * learning module: Go-Back-N and Selective Repeat
 *
 * Sliding-window simulator with modulo sequence numbers, so choosing a window that is too large visibly breaks the protocol.
 *
 * This file registers one learning module with regMod(). Its mount(root) function builds the screen inside
 * `root` and attaches event handlers; the function mount() returns (if any) is its cleanup, called by the router
 * when the learner leaves, so timers and listeners do not outlive the screen. The protocol logic lives in
 * ../../simulations/ and ../../core/; this file is the user interface for it.
 *
 * Imports:
 *   - ../../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): hn, ladder, panel, sel, statRow, tbl, vd
 *   - ../../core/utils.js (tiny DOM, math and timing helpers): $, REDUCE, esc
 *   - ../../simulations/arq.js (discrete-event ARQ simulators (Stop-and-Wait, Go-Back-N, Selective Repeat)): simWin
 *   - ../registry.js (learning-module registry and group definitions): regMod
 *   - ../../app/progress.js (achievements, flags and statistics): flag
 *
 * Exports: (none)
 *
 * Used by: (imported only for its side effects by app.js)
 */

import { hn, ladder, panel, sel, statRow, tbl, vd } from '../../core/ui-helpers.js';
import { $, esc, REDUCE } from '../../core/utils.js';
import { simWin } from '../../simulations/arq.js';
import { regMod } from '../registry.js';
import { flag } from '../../app/progress.js';

/**
 * Deterministic pseudo-random number in [0,1) from three integers (an integer hash).
 *
 * Used to decide "random" frame loss from (transmission number, frame, attempt), so a given scenario always plays out identically.
 */
const hsh = (a, b, c) => {
  let x = Math.imul(a + 1, 73856093) ^ Math.imul(b + 1, 19349663) ^ Math.imul(c + 1, 83492791);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/* Register "Go-Back-N and Selective Repeat". The router calls mount(root) when the learner opens #/m/window and calls the returned function (if any) when they leave. */
regMod({
  id: 'window',
  group: 'rel',
  title: 'Go-Back-N and Selective Repeat',
  desc: 'Keep several frames in flight with a sliding window, then break it by making the window too large.',
  obj: [
    'Compare how Go-Back-N and Selective Repeat recover from one lost frame.',
    'Step through window and receiver state after every event.',
    'Discover the window-size limit: 2^m − 1 for Go-Back-N, 2^(m−1) for Selective Repeat.',
  ],
  mount(root) {
    let st = { proto: 'gbn', W: 4, m: 3, scn: 'f2', p: 20, seed: 11 },
      snaps = [],
      step = 0,
      timer = null;
    const N = 10;
    root.innerHTML =
      panel(
        'Configure',
        `
      <div class="controls">
        <div class="field"><label for="wP">Protocol</label>${sel(
          'wP',
          [
            ['gbn', 'Go-Back-N'],
            ['sr', 'Selective Repeat'],
          ],
          st.proto
        )}</div>
        <div class="field"><label for="wW">Window size</label>${sel(
          'wW',
          [1, 2, 3, 4, 5, 6, 7, 8].map(x => [x, x]),
          st.W
        )}</div>
        <div class="field"><label for="wM">Sequence bits</label>${sel(
          'wM',
          [
            [2, '2 bits (0 to 3)'],
            [3, '3 bits (0 to 7)'],
          ],
          st.m
        )}</div>
        <div class="field"><label for="wS">Loss pattern</label>${sel(
          'wS',
          [
            ['none', 'No loss'],
            ['f2', 'Lose frame 2 once'],
            ['acks', 'Lose the first window of ACKs'],
            ['rand', 'Random loss'],
          ],
          st.scn
        )}</div>
        <div class="field"><label for="wL">Random loss rate</label>${sel(
          'wL',
          [10, 20, 30, 40].map(x => [x, x + '%']),
          st.p
        )}</div>
        <div class="btnrow"><button class="btn" id="wRun">Run</button><button class="btn ghost" id="wCmp">Compare both</button></div>
      </div><div id="wlimit"></div>`,
        `${N} frames are sent. Sequence numbers wrap around, exactly like the header field in real hardware.`
      ) + '<div id="wout"></div>';
    const lossFns = (proto, W, scn, p, seed) => ({
      loseData:
        scn === 'f2'
          ? (n, k, t) => k === 2 && t === 1
          : scn === 'rand'
            ? (n, k, t) => hsh(seed, k, t) < p / 100
            : () => false,
      loseAck:
        scn === 'acks'
          ? n => n < W
          : scn === 'rand'
            ? n => hsh(seed + 99, n, 0) < p / 100
            : () => false,
    });
    const strip = (cls, labels) =>
      `<div class="wstrip">${labels.map(([t, c]) => `<span class="cell ${c}">${t}</span>`).join('')}</div>`;
    const showStep = p => {
      const s = snaps[step];
      if (!s) return;
      const sender = Array.from({ length: N }, (_, k) => {
        const acked = st.proto === 'gbn' ? k < s.base : s.acked[k];
        const c = acked ? 'c2' : k < s.next ? 'c0' : k < s.base + st.W ? 'sendable' : 'c4 off';
        return [k, c];
      });
      const recvIdx = st.proto === 'gbn' ? s.exp : s.rbase;
      const recv = Array.from({ length: N }, (_, k) => [
        k,
        k < recvIdx ? 'c2' : s.buf.includes(k) ? 'c3' : k === recvIdx ? 'sendable' : 'c4 off',
      ]);
      $('#wstate', p).innerHTML =
        `<p class="stepmsg"><b>t = ${s.t.toFixed(1)}</b> ${esc(s.text)}</p>` +
        hn(
          'Sender window: green = acknowledged, blue = in flight, outlined = may be sent now, grey = outside the window'
        ) +
        strip('', sender) +
        hn(
          `Receiver: green = delivered in order, yellow = buffered out of order${st.proto === 'gbn' ? ' (Go-Back-N never buffers)' : ''}, outlined = next expected`
        ) +
        strip('', recv);
      $('#wslide', p).value = step;
      $('#wstep', p).textContent = `Event ${step + 1} of ${snaps.length}`;
    };
    const run = () => {
      clearInterval(timer);
      const M = 1 << st.m,
        W = st.W,
        f = lossFns(st.proto, W, st.scn, st.p, st.seed);
      const lim = st.proto === 'gbn' ? M - 1 : M / 2;
      $('#wlimit', root).innerHTML =
        W > lim
          ? vd(
              'warn',
              `Window ${W} is larger than the safe maximum of ${lim}.`,
              `With ${st.m}-bit sequence numbers ${st.proto === 'gbn' ? 'Go-Back-N' : 'Selective Repeat'} can confuse an old frame with a new one. Try the “Lose the first window of ACKs” pattern.`
            )
          : vd(
              'info',
              `Window ${W} is within the safe maximum of ${lim}.`,
              `There are ${M} sequence numbers.`
            );
      const sim = simWin({ proto: st.proto, N, W, M, ...f });
      snaps = sim.snaps;
      step = 0;
      const s = sim.stats;
      if (st.proto === 'gbn' && W >= M && s.bad > 0) flag('gbnBreak');
      $('#wout', root).innerHTML =
        panel(
          'Sequence diagram',
          ladder({
            left: 'Sender',
            right: 'Receiver',
            msgs: sim.msgs,
            marks: sim.marks,
            maxH: 520,
          }),
          'Red crosses are lost. Yellow arrows are retransmissions. Labels show the true frame number and, once numbers wrap, the sequence number on the wire (s).'
        ) +
        panel(
          'Outcome',
          statRow([
            [s.tx, 'frame transmissions'],
            [s.discards, 'frames discarded by receiver'],
            [s.delivered, 'delivered correctly'],
            [s.bad, 'wrongly accepted'],
            [sim.done && s.time !== null ? s.time.toFixed(1) : '—', 'time units'],
            [Math.round((N / s.tx) * 100) + '%', 'efficiency'],
          ]) +
            (s.bad
              ? vd(
                  'bad',
                  'Data was corrupted by sequence-number ambiguity.',
                  `${s.bad} old frame${s.bad > 1 ? 's were' : ' was'} accepted as new data. The window was too big for the sequence space.`
                )
              : !sim.done
                ? vd('warn', 'The run did not finish within the time limit.', 'Too many losses.')
                : st.proto === 'gbn' && s.discards
                  ? vd(
                      'info',
                      'Go-Back-N discarded frames that had arrived fine.',
                      `After the loss the receiver refused ${s.discards} later frame${s.discards > 1 ? 's' : ''}, so they were sent again.`
                    )
                  : vd(
                      'ok',
                      'All frames delivered in order and exactly once.',
                      st.proto === 'sr' && s.tx > N ? 'Only the lost frames were resent.' : ''
                    ))
        );
      $('#wout', root).insertAdjacentHTML(
        'beforeend',
        panel(
          'Step through the events',
          `<div class="controls"><div class="btnrow"><button class="btn ghost sm" id="wprev">← Prev</button><button class="btn ghost sm" id="wnext">Next →</button><button class="btn sm" id="wplay">Play</button></div><span class="hint" id="wstep"></span></div><input type="range" id="wslide" min="0" max="${snaps.length - 1}" value="0" aria-label="Event number"><div id="wstate"></div>`
        )
      );
      const wp = $('#wout', root);
      $('#wslide', wp).oninput = e => {
        step = +e.target.value;
        showStep(wp);
      };
      $('#wprev', wp).onclick = () => {
        step = Math.max(0, step - 1);
        showStep(wp);
      };
      $('#wnext', wp).onclick = () => {
        step = Math.min(snaps.length - 1, step + 1);
        showStep(wp);
      };
      $('#wplay', wp).onclick = () => {
        clearInterval(timer);
        step = 0;
        showStep(wp);
        timer = setInterval(
          () => {
            if (step >= snaps.length - 1) clearInterval(timer);
            else {
              step++;
              showStep(wp);
            }
          },
          REDUCE ? 30 : 700
        );
      };
      showStep(wp);
    };
    const compare = () => {
      const M = 1 << st.m,
        W = st.W,
        res = ['gbn', 'sr'].map(pr => {
          const f = lossFns(pr, W, st.scn === 'acks' ? 'rand' : st.scn, st.p, st.seed);
          const r = simWin({ proto: pr, N, W, M, ...f });
          return [
            pr === 'gbn' ? 'Go-Back-N' : 'Selective Repeat',
            r.stats.tx,
            r.stats.discards,
            r.stats.bad,
            r.stats.time === null ? '—' : r.stats.time.toFixed(1),
            Math.round((N / r.stats.tx) * 100) + '%',
          ];
        });
      $('#wout', root).insertAdjacentHTML(
        'afterbegin',
        panel(
          'Same losses, both protocols',
          tbl(
            ['Protocol', 'Transmissions', 'Discarded', 'Wrongly accepted', 'Time', 'Efficiency'],
            res
          ),
          'The loss pattern depends only on frame number and attempt, so both protocols see identical bad luck.'
        )
      );
    };
    const bind = (id, k, num = true) => {
      $('#' + id, root).onchange = e => {
        st[k] = num ? +e.target.value : e.target.value;
        run();
      };
    };
    bind('wP', 'proto', false);
    bind('wW', 'W');
    bind('wM', 'm');
    bind('wS', 'scn', false);
    bind('wL', 'p');
    $('#wRun', root).onclick = () => {
      st.seed++;
      run();
    };
    $('#wCmp', root).onclick = () => {
      run();
      compare();
    };
    run();
    flag('window');
    // Cleanup: stop the step-through timer when the module is closed.
    return () => clearInterval(timer);
  },
});
