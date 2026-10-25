/**
 * learning module: Handshake and teardown
 *
 * Step-through of the TCP three-way handshake, data transfer and connection close, with both endpoints' states.
 *
 * This file registers one learning module with regMod(). Its mount(root) function builds the screen inside
 * `root` and attaches event handlers; the function mount() returns (if any) is its cleanup, called by the router
 * when the learner leaves, so timers and listeners do not outlive the screen. The protocol logic lives in
 * ../../simulations/ and ../../core/; this file is the user interface for it.
 *
 * Imports:
 *   - ../../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): ladder, panel, sel, tbl
 *   - ../../core/utils.js (tiny DOM, math and timing helpers): $, REDUCE, clamp
 *   - ../../simulations/transport.js (TCP/UDP header layouts, example scenarios and handshake steps): STATE_INFO, buildTcpSteps
 *   - ../registry.js (learning-module registry and group definitions): regMod
 *   - ../../app/progress.js (achievements, flags and statistics): flag
 *
 * Exports: (none)
 *
 * Used by: (imported only for its side effects by app.js)
 */

import { ladder, panel, sel, tbl } from '../../core/ui-helpers.js';
import { $, clamp, REDUCE } from '../../core/utils.js';
import { buildTcpSteps, STATE_INFO } from '../../simulations/transport.js';
import { regMod } from '../registry.js';
import { flag } from '../../app/progress.js';

/* Register "Handshake and teardown". The router calls mount(root) when the learner opens #/m/handshake and calls the returned function (if any) when they leave. */
regMod({
  id: 'handshake',
  group: 'trn',
  title: 'Handshake and teardown',
  desc: 'Open, use and close a TCP connection one segment at a time, with real sequence and acknowledgment numbers.',
  obj: [
    'Follow SYN, SYN-ACK and ACK and see why each step is needed.',
    'Read how sequence and acknowledgment numbers advance.',
    'Watch both state machines change, including TIME_WAIT.',
  ],
  mount(root) {
    let cfg = { x: 100, y: 300, n: 500, v: 'normal' },
      step = 0,
      steps = [],
      timer = null;
    root.innerHTML =
      panel(
        'Connection settings',
        `<div class="controls"><div class="field"><label for="hx">Client initial sequence number</label><input id="hx" type="number" min="0" value="100"></div>
      <div class="field"><label for="hy">Server initial sequence number</label><input id="hy" type="number" min="0" value="300"></div><div class="field"><label for="hn">Data bytes sent</label><input id="hn" type="number" min="1" max="9999" value="500"></div>
      <div class="field"><label for="hv">Scenario</label>${sel(
        'hv',
        [
          ['normal', 'Normal'],
          ['synlost', 'SYN lost, client retries'],
        ],
        'normal'
      )}</div></div>`
      ) +
      `<div class="panel"><div class="controls"><div class="btnrow"><button class="btn ghost sm" id="hprev">← Back</button><button class="btn" id="hnext">Next step →</button><button class="btn ghost sm" id="hplay">Play all</button><button class="btn ghost sm" id="hreset">Reset</button></div><span class="hint" id="hcnt"></span></div><div id="hstates"></div></div><div id="hmain"></div>`;
    const rebuild = () => {
      cfg.x = Math.max(0, Math.floor(+$('#hx', root).value || 0));
      cfg.y = Math.max(0, Math.floor(+$('#hy', root).value || 0));
      cfg.n = clamp(Math.floor(+$('#hn', root).value || 1), 1, 9999);
      cfg.v = $('#hv', root).value;
      steps = buildTcpSteps(cfg.x, cfg.y, cfg.n, cfg.v);
      step = Math.min(step, steps.length - 1);
      render();
    };
    const render = () => {
      const s = steps[step],
        msgs = [],
        marks = [];
      let t = 0;
      steps.forEach((q, i) => {
        if (i > step) return;
        if (q.dir) {
          msgs.push({
            t0: t,
            t1: t + 1,
            dir: q.dir,
            label: q.label,
            cls: q.lost ? 'c1' : q.dir === 'lr' ? 'c0' : 'c2',
            lost: q.lost,
            idx: i,
          });
          t += 1.3;
        } else if (q.mark) {
          marks.push({ side: 'l', t: t - 0.2, label: q.mark, cls: 'c3' });
          t += 0.9;
        }
      });
      const stCell = (who, v) =>
        `<div class="stbox"><small>${who}</small><b class="sbadge">${v}</b><span>${STATE_INFO[v] || ''}</span></div>`;
      $('#hcnt', root).textContent = `Step ${step + 1} of ${steps.length}`;
      $('#hstates', root).innerHTML =
        `<div class="states">${stCell('Client', s.c)}${stCell('Server', s.s)}</div>`;
      $('#hmain', root).innerHTML =
        panel(
          'Message sequence',
          msgs.length
            ? ladder({ left: 'Client', right: 'Server', msgs, marks, animate: false, maxH: 460 })
            : '<p class="hint">Press “Next step” to send the first segment.</p>'
        ) +
        panel(
          s.title || (s.dir ? 'Segment: ' + s.flags : s.mark),
          `<p>${s.text}</p>` +
            (s.dir
              ? tbl(
                  ['Direction', 'Flags', 'Seq', 'Ack', 'Data bytes'],
                  [
                    [
                      s.dir === 'lr' ? 'client → server' : 'server → client',
                      s.flags,
                      s.seq,
                      s.ack || '–',
                      s.len,
                    ],
                  ]
                )
              : '')
        );
      $('#hprev', root).toggleAttribute('disabled', step === 0);
      $('#hnext', root).toggleAttribute('disabled', step >= steps.length - 1);
      if (s.hs) flag('handshake');
    };
    ['hx', 'hy', 'hn', 'hv'].forEach(id => {
      $('#' + id, root).onchange = () => {
        step = 0;
        clearInterval(timer);
        rebuild();
      };
    });
    $('#hnext', root).onclick = () => {
      step = Math.min(steps.length - 1, step + 1);
      render();
    };
    $('#hprev', root).onclick = () => {
      step = Math.max(0, step - 1);
      render();
    };
    $('#hreset', root).onclick = () => {
      clearInterval(timer);
      step = 0;
      render();
    };
    $('#hplay', root).onclick = () => {
      clearInterval(timer);
      step = 0;
      render();
      timer = setInterval(
        () => {
          if (step >= steps.length - 1) clearInterval(timer);
          else {
            step++;
            render();
          }
        },
        REDUCE ? 40 : 1100
      );
    };
    rebuild();
    // Cleanup: stop the auto-play timer when the module is closed.
    return () => clearInterval(timer);
  },
});
