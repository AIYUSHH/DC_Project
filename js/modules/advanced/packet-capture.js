/**
 * learning module: Packet capture explorer
 *
 * A Wireshark-style analyzer: packet list, display filters, decoded layers and highlighted bytes.
 *
 * This file registers one learning module with regMod(). Its mount(root) function builds the screen inside
 * `root` and attaches event handlers; the function mount() returns (if any) is its cleanup, called by the router
 * when the learner leaves, so timers and listeners do not outlive the screen. The protocol logic lives in
 * ../../simulations/ and ../../core/; this file is the user interface for it.
 *
 * Imports:
 *   - ../../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): on, panel, sel, tbl, vd
 *   - ../../core/utils.js (tiny DOM, math and timing helpers): $, $$, esc
 *   - ../../core/encoding.js (bytes, hex, bits and UTF-8 helpers): dec, hex
 *   - ../../simulations/capture.js (sample packet captures and the display-filter engine): analyzeCapture, buildCapture, compileFilter
 *   - ../registry.js (learning-module registry and group definitions): regMod
 *   - ../../app/progress.js (achievements, flags and statistics): flag
 *
 * Exports: (none)
 *
 * Used by: (imported only for its side effects by app.js)
 */

import { dec, hex } from '../../core/encoding.js';
import { on, panel, sel, tbl, vd } from '../../core/ui-helpers.js';
import { $, $$, esc } from '../../core/utils.js';
import { analyzeCapture, buildCapture, compileFilter } from '../../simulations/capture.js';
import { regMod } from '../registry.js';
import { flag } from '../../app/progress.js';

/**
 * Names of the sample captures offered in the scenario drop-down.
 */
const CAP_SCEN = {
  web: 'Loading a web page',
  loss: 'Page load with a retransmission',
  dns: 'A mistyped domain name',
};

/**
 * Example display filters shown as clickable chips.
 */
const CAP_FILTERS = [
  'tcp',
  'udp',
  'dns',
  'http',
  'tcp.flags.syn',
  'ip.addr==8.8.8.8',
  'tcp.port==80 && tcp.len>0',
  'dns.flags.rcode==3',
  'tcp.analysis.retransmission',
  'http || dns',
];

/* Register "Packet capture explorer". The router calls mount(root) when the learner opens #/m/capture and calls the returned function (if any) when they leave. */
regMod({
  id: 'capture',
  group: 'adv',
  title: 'Packet capture explorer',
  desc: 'Browse a capture like a protocol analyzer: filter packets, open each layer, and see which bytes a field occupies.',
  obj: [
    'Use display filters such as tcp.port==80 && tcp.len>0.',
    'Expand the decoded layers and click a field to highlight its bytes.',
    'Follow a TCP stream and spot a retransmission.',
  ],
  mount(root) {
    let pk = [],
      sel_ = 0,
      fn = () => true,
      hl = null;
    root.innerHTML =
      panel(
        'Capture',
        `<div class="controls"><div class="field"><label for="cs">Scenario</label>${sel('cs', Object.entries(CAP_SCEN), 'web')}</div>
      <div class="field grow"><label for="cf">Display filter</label><input id="cf" type="text" placeholder="e.g. tcp.port==80 && tcp.len>0" spellcheck="false" autocomplete="off"></div></div>
      <div class="presets" id="cfp">${CAP_FILTERS.map(x => `<button class="chipbtn">${x}</button>`).join('')}</div><p class="hint" id="ccount"></p>
      <div class="tscroll cap"><table class="tb cap" id="clist"><thead><tr><th>No.</th><th>Time (ms)</th><th>Source</th><th>Destination</th><th>Protocol</th><th>Len</th><th>Info</th></tr></thead><tbody></tbody></table></div>
      <div class="btnrow"><button class="btn ghost sm" id="cfollow">Follow TCP stream</button></div>`
      ) + '<div id="cdet"></div><div id="cfol"></div>';
    const load = () => {
      pk = analyzeCapture(buildCapture($('#cs', root).value));
      sel_ = 1;
      $('#cfol', root).innerHTML = '';
      list();
    };
    const list = () => {
      const f = $('#cf', root).value;
      fn = compileFilter(f);
      const rows = pk.filter(fn);
      if (f.trim() && rows.length && rows.length < pk.length) flag('filter');
      $('#ccount', root).textContent =
        `Displaying ${rows.length} of ${pk.length} packets${f.trim() ? ' for “' + f.trim() + '”' : ''}.`;
      $('#clist tbody', root).innerHTML =
        rows
          .map(
            r =>
              `<tr class="pr ${r.f['tcp.analysis.retransmission'] ? 'retx' : r.protos.has('dns') ? 'dnsr' : r.protos.has('http') ? 'httpr' : r.protos.has('tcp') ? 'tcpr' : ''}${r.no === sel_ ? ' sel' : ''}" data-n="${r.no}" tabindex="0"><td>${r.no}</td><td>${r.t.toFixed(1)}</td><td>${r.src}</td><td>${r.dst}</td><td>${r.proto}</td><td>${r.len}</td><td class="info">${esc(r.info)}</td></tr>`
          )
          .join('') || '<tr><td colspan="7" class="hint">No packets match this filter.</td></tr>';
      detail();
    };
    const detail = () => {
      const r = pk.find(x => x.no === sel_);
      if (!r) {
        $('#cdet', root).innerHTML = '';
        return;
      }
      const tree = r.layers
        .map(
          (l, li) =>
            `<details ${li === r.layers.length - 1 || li === 0 ? 'open' : ''} class="lyr"><summary data-off="${l.off}" data-len="${l.len}"><b>${l.name}</b> <span>${esc(l.summary)}</span></summary><ul>${l.fields.map(fl => `<li data-off="${fl.off}" data-len="${fl.len}" tabindex="0"><em>${esc(fl.k)}</em> ${esc(String(fl.v))}</li>`).join('')}</ul></details>`
        )
        .join('');
      const b = r.bytes,
        rowsH = [];
      for (let i = 0; i < b.length; i += 16) {
        const sl = b.slice(i, i + 16);
        rowsH.push(
          `<div class="hx"><span class="off">${i.toString(16).padStart(4, '0')}</span><span class="by">${sl.map((x, k) => `<i data-i="${i + k}">${hex(x)}</i>`).join('')}</span><span class="asc">${esc(sl.map(x => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join(''))}</span></div>`
        );
      }
      $('#cdet', root).innerHTML =
        `<div class="cols2"><div class="panel"><h3>Packet ${r.no}: decoded</h3><div class="tree">${tree}</div>
        <h4>Integrity checks</h4>${tbl(
          ['Layer', 'Result', 'Detail'],
          r.checks.map(c => [
            c.layer,
            { h: `<span class="pill ${c.ok ? 'live' : 'bad'}">${c.ok ? 'valid' : 'BAD'}</span>` },
            c.detail,
          ])
        )}${r.notes.length ? vd('warn', r.notes.join(', ') + '.', 'The same data (same sequence number) was seen before. The sender did not get an ACK in time and sent it again.') : ''}</div>
        <div class="panel"><h3>Bytes (${b.length})</h3><p class="hint">Click a field on the left to highlight its bytes.</p><div class="hexpane" id="chex">${rowsH.join('')}</div></div></div>`;
      paintHl();
    };
    const paintHl = () => {
      $$('#chex i', root).forEach(i => {
        const n = +i.dataset.i;
        i.classList.toggle('hlb', !!hl && n >= hl[0] && n < hl[0] + hl[1]);
      });
    };
    $('#cs', root).onchange = load;
    $('#cf', root).oninput = list;
    $('#cfp', root).onclick = e => {
      const b = e.target.closest('.chipbtn');
      if (b) {
        $('#cf', root).value = b.textContent;
        list();
      }
    };
    on(root, 'click', 'tr.pr', (e, tr) => {
      sel_ = +tr.dataset.n;
      hl = null;
      list();
    });
    on(root, 'keydown', 'tr.pr', (e, tr) => {
      if (e.key === 'Enter') {
        sel_ = +tr.dataset.n;
        hl = null;
        list();
      }
    });
    const pick = (e, el) => {
      hl = [+el.dataset.off, +el.dataset.len];
      paintHl();
      const t = $(`#chex i[data-i="${hl[0]}"]`, root);
      if (t) t.scrollIntoView({ block: 'nearest' });
      $$('.tree .on', root).forEach(x => x.classList.remove('on'));
      el.classList.add('on');
    };
    on(root, 'click', '.tree li', pick);
    on(root, 'click', '.tree summary', pick);
    on(root, 'keydown', '.tree li', (e, el) => {
      if (e.key === 'Enter') pick(e, el);
    });
    $('#cfollow', root).onclick = () => {
      const segs = pk.filter(
        r => r.protos.has('tcp') && r.f['tcp.len'] > 0 && !r.f['tcp.analysis.retransmission']
      );
      if (!segs.length) {
        $('#cfol', root).innerHTML = vd(
          'warn',
          'This capture has no TCP data.',
          'Pick a web page scenario.'
        );
        return;
      }
      const out = segs
        .map(r => {
          const l4 = r.bytes.slice(14 + (r.bytes[14] & 15) * 4);
          const pl = l4.slice((l4[12] >> 4) * 4),
            dirC = r.f['tcp.dstport'] === 80;
          return `<pre class="http ${dirC ? 'req' : 'res'}">${esc(dec.decode(new Uint8Array(pl)))}</pre>`;
        })
        .join('');
      $('#cfol', root).innerHTML = panel(
        'TCP stream',
        `<p class="hint">Reassembled from the data segments in order. Blue is client to server, green is server to client. Retransmitted copies are skipped.</p>${out}`
      );
    };
    load();
  },
});
