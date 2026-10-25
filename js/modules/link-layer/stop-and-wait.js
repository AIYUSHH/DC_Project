/**
 * learning module: Stop-and-Wait
 *
 * Ladder-diagram simulator with replayable failures (lost frame, lost ACK, premature timeout) and a link-utilisation calculator.
 *
 * This file registers one learning module with regMod(). Its mount(root) function builds the screen inside
 * `root` and attaches event handlers; the function mount() returns (if any) is its cleanup, called by the router
 * when the learner leaves, so timers and listeners do not outlive the screen. The protocol logic lives in
 * ../../simulations/ and ../../core/; this file is the user interface for it.
 *
 * Imports:
 *   - ../../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): ladder, panel, sel, statRow, tabset, vd
 *   - ../../core/utils.js (tiny DOM, math and timing helpers): $, $$, clamp, rng
 *   - ../../simulations/arq.js (discrete-event ARQ simulators (Stop-and-Wait, Go-Back-N, Selective Repeat)): simSW
 *   - ../registry.js (learning-module registry and group definitions): regMod
 *   - ../../app/progress.js (achievements, flags and statistics): flag
 *
 * Exports: (none)
 *
 * Used by: (imported only for its side effects by app.js)
 */

import { ladder, panel, sel, statRow, tabset, vd } from '../../core/ui-helpers.js';
import { $, $$, clamp, rng } from '../../core/utils.js';
import { simSW } from '../../simulations/arq.js';
import { regMod } from '../registry.js';
import { flag } from '../../app/progress.js';

/* Register "Stop-and-Wait". The router calls mount(root) when the learner opens #/m/saw and calls the returned function (if any) when they leave. */
regMod({
  id: 'saw',
  group: 'rel',
  title: 'Stop-and-Wait',
  desc: 'Send one frame, wait for its ACK, resend on timeout. Replay classic failures on a time diagram.',
  obj: [
    'Trace a lost frame, a lost ACK and a premature timeout on a sequence diagram.',
    'See why a 1-bit sequence number lets the receiver discard duplicates.',
    'Calculate why Stop-and-Wait wastes long, fast links.',
  ],
  mount(root) {
    const SCN = {
      normal: {
        T: 3,
        text: 'Every frame is acknowledged before the next one goes out. Total time is about 2 time units per frame, because the sender is idle while it waits.',
      },
      lostframe: {
        T: 3,
        text: 'The second frame vanishes. No ACK ever returns, the timer expires and the sender transmits the frame again.',
      },
      lostack: {
        T: 3,
        text: 'The data arrives but its ACK is lost. The sender cannot tell the difference, so it resends. The receiver sees the same sequence bit twice and discards the duplicate, but still re-sends the ACK.',
      },
      premature: {
        T: 1.5,
        text: 'The timeout is shorter than the round trip (2 units). The sender resends frames that were never lost, producing duplicates and stale ACKs.',
      },
      random: {
        T: 3,
        text: 'Frames and ACKs are lost at random. Change the seed to replay a different run.',
      },
    };
    let st = { scn: 'normal', N: 4, T: 3, pd: 0, pa: 0, seed: 7 };
    root.innerHTML = '<div id="sawtabs"></div>';
    const tabs = tabset(
      $('#sawtabs', root),
      [
        {
          label: 'Simulator',
          render(p) {
            p.innerHTML =
              panel(
                'Scenario',
                `
          <div class="presets" id="sscn">${Object.keys(SCN)
            .map(
              k =>
                `<button class="chipbtn${k === st.scn ? ' on' : ''}" data-k="${k}">${{ normal: 'Normal flow', lostframe: 'Lost frame', lostack: 'Lost ACK', premature: 'Premature timeout', random: 'Random loss' }[k]}</button>`
            )
            .join('')}</div>
          <div class="controls"><div class="field"><label for="sN">Frames to send</label>${sel(
            'sN',
            [2, 3, 4, 5, 6, 8].map(x => [x, x]),
            st.N
          )}</div>
          <div class="field"><label for="sT">Timeout (round trip = 2)</label>${sel(
            'sT',
            [1.5, 2.5, 3, 4, 6].map(x => [x, x + ' units']),
            st.T
          )}</div>
          <div class="field"><label for="sPd">Frame loss</label>${sel(
            'sPd',
            [0, 10, 20, 30, 40].map(x => [x, x + '%']),
            st.pd
          )}</div>
          <div class="field"><label for="sPa">ACK loss</label>${sel(
            'sPa',
            [0, 10, 20, 30, 40].map(x => [x, x + '%']),
            st.pa
          )}</div>
          <div class="field"><label for="sSeed">Seed</label><input id="sSeed" type="number" value="${st.seed}" min="1" max="9999"></div>
          <div class="btnrow"><button class="btn" id="sRun">Run again</button></div></div>`
              ) + '<div id="sout"></div>';
            const run = () => {
              const r = rng(st.seed * 977),
                lossD =
                  st.scn === 'lostframe'
                    ? n => n === 1
                    : st.scn === 'random'
                      ? () => r() < st.pd / 100
                      : () => false;
              const lossA =
                st.scn === 'lostack'
                  ? n => n === 1
                  : st.scn === 'random'
                    ? () => r() < st.pa / 100
                    : () => false;
              const sim = simSW({ N: st.N, T: st.T, loseData: lossD, loseAck: lossA });
              const s = sim.stats;
              $('#sout', p).innerHTML =
                panel(
                  'Sequence diagram',
                  ladder({ left: 'Sender', right: 'Receiver', msgs: sim.msgs, marks: sim.marks }),
                  'Time runs downward. Each arrow takes 1 unit. Red crosses are lost. Yellow arrows are retransmissions.'
                ) +
                panel(
                  'Outcome',
                  statRow([
                    [s.tx, 'frame transmissions'],
                    [s.retx, 'retransmissions'],
                    [s.dups, 'duplicates discarded'],
                    [s.stale, 'stale ACKs ignored'],
                    [sim.done ? s.time.toFixed(1) : '—', 'time units'],
                    [Math.round((st.N / s.tx) * 100) + '%', 'efficiency'],
                  ]) +
                    (sim.failed
                      ? vd('bad', 'The sender gave up.', 'After 8 attempts on one frame it stops.')
                      : s.dups
                        ? vd(
                            'warn',
                            'The receiver saw duplicates.',
                            'The 1-bit sequence number let it throw them away instead of delivering the data twice.'
                          )
                        : s.retx
                          ? vd('info', 'Recovered by retransmission.', 'The timer saved this run.')
                          : vd(
                              'ok',
                              'Delivered with no retransmissions.',
                              'Simple and correct, but slow.'
                            )) +
                    `<p class="hint">${SCN[st.scn].text}</p>`
                );
            };
            $('#sscn', p).onclick = e => {
              const b = e.target.closest('[data-k]');
              if (!b) return;
              st.scn = b.dataset.k;
              st.T = SCN[st.scn].T;
              if (st.scn !== 'random') {
                st.pd = 0;
                st.pa = 0;
              }
              if (st.scn === 'random') {
                st.pd = 20;
                st.pa = 20;
              }
              tabs.select(0);
            };
            ['sN', 'sT', 'sPd', 'sPa'].forEach(id => {
              $('#' + id, p).onchange = e => {
                st[{ sN: 'N', sT: 'T', sPd: 'pd', sPa: 'pa' }[id]] = +e.target.value;
                run();
              };
            });
            $('#sSeed', p).onchange = e => {
              st.seed = clamp(+e.target.value || 1, 1, 9999);
              run();
            };
            $('#sRun', p).onclick = () => {
              st.seed = (st.seed % 9999) + 1;
              $('#sSeed', p).value = st.seed;
              run();
            };
            run();
            flag('saw');
          },
        },
        {
          label: 'Why it is slow',
          render(p) {
            p.innerHTML = panel(
              'Link utilisation',
              `<p class="hint">While waiting for an ACK the sender is idle. Utilisation is the fraction of time it is actually sending.</p>
          <div class="controls"><div class="field"><label for="uB">Bandwidth (Mbit/s)</label><input id="uB" type="number" value="100" min="1"></div>
          <div class="field"><label for="uL">Frame size (bytes)</label><input id="uL" type="number" value="1500" min="40"></div>
          <div class="field"><label for="uD">Distance (km)</label><input id="uD" type="number" value="3000" min="0"></div></div><div id="uout"></div>`
            );
            const f = () => {
              const B = +$('#uB', p).value * 1e6,
                L = +$('#uL', p).value * 8,
                D = +$('#uD', p).value * 1000;
              if (!(B > 0 && L > 0 && D >= 0)) {
                $('#uout', p).innerHTML = vd('warn', 'Enter positive numbers.');
                return;
              }
              const tx = L / B,
                prop = D / 2e8,
                U = tx / (tx + 2 * prop),
                W = 1 + (2 * prop) / tx;
              $('#uout', p).innerHTML =
                statRow([
                  [(tx * 1000).toFixed(3) + ' ms', 'time to send a frame'],
                  [(prop * 1000).toFixed(2) + ' ms', 'one-way propagation'],
                  [(U * 100).toFixed(2) + '%', 'link utilisation'],
                  [Math.ceil(W), 'frames in flight needed to fill the pipe'],
                ]) +
                vd(
                  U < 0.2 ? 'bad' : 'info',
                  U < 0.2 ? 'Most of the link is wasted.' : 'Reasonable here.',
                  `Stop-and-Wait sends one frame per round trip. A window of about ${Math.ceil(W)} frames would keep this link busy, which is the idea behind sliding windows.`
                ) +
                `<p class="hint">utilisation = T<sub>frame</sub> / (T<sub>frame</sub> + 2 · T<sub>prop</sub>), with signals travelling at 2×10<sup>8</sup> m/s.</p>`;
            };
            $$('input', p).forEach(i => {
              i.oninput = f;
            });
            f();
          },
        },
      ],
      0
    );
    return () => tabs.destroy();
  },
});
