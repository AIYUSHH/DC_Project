/**
 * learning module: Tutorials and experiments
 *
 * Guided labs whose steps tick off automatically when the learner performs them, plus notes and run history.
 *
 * This file registers one learning module with regMod(). Its mount(root) function builds the screen inside
 * `root` and attaches event handlers; the function mount() returns (if any) is its cleanup, called by the router
 * when the learner leaves, so timers and listeners do not outlive the screen. The protocol logic lives in
 * ../../simulations/ and ../../core/; this file is the user interface for it.
 *
 * Imports:
 *   - ../../core/storage.js (saved progress (localStorage) and the shared P object): P, save
 *   - ../../core/utils.js (tiny DOM, math and timing helpers): $
 *   - ../../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): icon, on, tbl, vd
 *   - ../../core/state.js (shared in-memory state): DC
 *   - ../registry.js (learning-module registry and group definitions): regMod
 *
 * Exports: (none)
 *
 * Used by: (imported only for its side effects by app.js)
 */

import { DC } from '../../core/state.js';
import { P, save } from '../../core/storage.js';
import { icon, on, tbl, vd } from '../../core/ui-helpers.js';
import { $ } from '../../core/utils.js';
import { regMod } from '../registry.js';

/**
 * Guided tutorials. Each step is [instruction, isDone(), link]; isDone() reads the progress flags that the simulators set with flag().
 */
const TUTS = [
  {
    id: 't1',
    title: 'Your first message',
    blurb: 'Send text across the link and read it back.',
    steps: [
      [
        'Type your own message or choose a sample on the first step.',
        () => P.flags.typed,
        '#/lab/0',
      ],
      ['Move the payload slider to change the packet size.', () => P.flags.psMoved, '#/lab/1'],
      ['Press Transmit on the link step.', () => P.flags.transmitted, '#/lab/2'],
      ['Open the receiver and watch the message rebuild.', () => P.flags.rebuilt, '#/lab/3'],
    ],
  },
  {
    id: 't2',
    title: 'Surviving loss',
    blurb: 'Break the link on purpose and see retries and gaps.',
    steps: [
      ['Send a message at 30% loss or more.', () => P.runs.some(r => r.loss >= 30), '#/lab/2'],
      ['Cause at least one retry.', () => P.flags.retry, '#/lab/2'],
      [
        'Set the retry limit to 0 and loss to 70%, then transmit until a packet is missing.',
        () => P.runs.some(r => !r.ok),
        '#/lab/2',
      ],
      ['Open the receiver and read the partial message.', () => P.flags.viewedGap, '#/lab/3'],
    ],
  },
  {
    id: 't3',
    title: 'Detecting errors',
    blurb: 'Beat parity, then catch the error with a CRC.',
    steps: [
      ['Flip any bit in the error-detection module.', () => P.flags.errflip, '#/m/errors'],
      [
        'Make parity miss an error (flip two adjacent bits).',
        () => P.flags.parityMiss,
        '#/m/errors',
      ],
      [
        'Find an error that the CRC catches but parity or the checksum missed.',
        () => P.flags.crcCatch,
        '#/m/errors',
      ],
      ['Run the 2,000-trial comparison.', () => P.flags.trials, '#/m/errors'],
    ],
  },
  {
    id: 't4',
    title: 'Subnetting basics',
    blurb: 'Read CIDR notation and answer questions.',
    steps: [
      [
        'In the calculator enter 172.16.5.9 and set the prefix to 20.',
        () => P.flags.cidr20,
        '#/m/subnets',
      ],
      ['Answer three practice questions correctly.', () => P.stats.subnetOk >= 3, '#/m/subnets'],
    ],
  },
  {
    id: 't5',
    title: 'Reliable transfer',
    blurb: 'Compare ARQ protocols and break one.',
    steps: [
      ['Run the Stop-and-Wait simulator.', () => P.flags.saw, '#/m/saw'],
      ['Open the sliding-window protocols.', () => P.flags.window, '#/m/window'],
      [
        'Choose Go-Back-N with 2-bit sequence numbers, window 4 and “Lose the first window of ACKs”.',
        () => P.flags.gbnBreak,
        '#/m/window',
      ],
    ],
  },
  {
    id: 't6',
    title: 'Packets in the wild',
    blurb: 'Read captures and diagnose a fault.',
    steps: [
      [
        'Complete a three-way handshake in the TCP module.',
        () => P.flags.handshake,
        '#/m/handshake',
      ],
      ['Apply a display filter in the capture explorer.', () => P.flags.filter, '#/m/capture'],
      ['Diagnose a case in the troubleshooting lab.', () => P.flags.diagnosed, '#/m/trouble'],
      ['Derive a shared key in the HTTP and TLS module.', () => P.flags.ecdh, '#/m/http'],
    ],
  },
];

/* Register "Tutorials and experiments". The router calls mount(root) when the learner opens #/m/tutorials and calls the returned function (if any) when they leave. */
regMod({
  id: 'tutorials',
  group: 'learn',
  title: 'Tutorials and experiments',
  desc: 'Guided labs that check your work automatically as you use the simulators, with a notes pad and your experiment history.',
  obj: [
    'Follow a guided lab and tick off each step by doing it.',
    'Record what you saw in the notes pad.',
    'Review your own experiments.',
  ],
  mount(root) {
    let cur = 0;
    root.innerHTML =
      '<div class="panel"><div class="tutpick" id="tpick"></div></div><div id="tbody"></div>';
    const render = () => {
      const T = TUTS[cur],
        done = T.steps.filter(s => s[1]()).length;
      $('#tpick', root).innerHTML = TUTS.map((t, i) => {
        const d = t.steps.filter(s => s[1]()).length;
        return `<button class="tutbtn${i === cur ? ' on' : ''}" data-i="${i}"><b>${t.title}</b><small>${d}/${t.steps.length} done</small></button>`;
      }).join('');
      $('#tbody', root).innerHTML =
        `<div class="cols2"><div class="panel"><h3>${T.title}</h3><p class="hint">${T.blurb}</p><div class="bar"><i style="width:${(done / T.steps.length) * 100}%"></i></div>
        <ol class="steps">${T.steps.map((s, i) => `<li class="${s[1]() ? 'ok' : ''}"><span class="tick">${s[1]() ? icon('check') : i + 1}</span><span>${s[0]}</span><a class="btn ghost sm" href="${s[2]}">Go</a></li>`).join('')}</ol>
        ${done === T.steps.length ? vd('ok', 'Tutorial complete.', 'Nice work. Pick another one or try the challenges.') : ''}</div>
        <div class="panel"><h3>Notes</h3><p class="hint">Saved automatically in this browser.</p><textarea id="tnotes" rows="8" aria-label="Notes" placeholder="What did you observe?"></textarea></div></div>
        <div class="panel"><h3>Experiment log</h3><p class="hint">Every transmission from the link step is recorded here.</p>${
          P.runs.length
            ? tbl(
                ['When', 'Loss', 'Corruption', 'Packets', 'Retries', 'Result'],
                P.runs.map(r => [
                  new Date(r.ts).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }),
                  r.loss + '%',
                  r.corrupt + '%',
                  r.packets,
                  r.retries,
                  {
                    h: `<span class="pill ${r.ok ? 'live' : 'bad'}">${r.ok ? 'complete' : 'incomplete'}</span>`,
                  },
                ])
              )
            : '<p class="hint">No runs yet.</p>'
        }</div>`;
      const ta = $('#tnotes', root);
      ta.value = P.notes[T.id] || '';
      ta.oninput = () => {
        P.notes[T.id] = ta.value;
        save();
      };
    };
    on(root, 'click', '.tutbtn', (e, b) => {
      cur = +b.dataset.i;
      render();
    });
    const listener = () => {
      // Do not redraw while the learner is typing in the notes box, or the text field would lose
      // focus.
      if (document.activeElement && document.activeElement.id === 'tnotes') return;
      render();
    };
    // Register for flag() notifications so steps tick as the learner does them in other screens.
    // The cleanup below removes the listener when this screen is left.
    DC.listeners.push(listener);
    render();
    return () => {
      DC.listeners = DC.listeners.filter(f => f !== listener);
    };
  },
});
