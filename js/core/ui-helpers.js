/**
 * shared HTML builders: icons, tables, tabs, ladder diagrams
 *
 * Small functions that return HTML strings (or wire up behaviour) reused by many modules:
 * icon(), verdict boxes (vd), tables (tbl), tab sets (tabset), the SVG message-sequence "ladder" diagram,
 * event delegation (on) and so on.
 *
 * Security note: whenever text that a learner typed is placed inside an HTML string, it must go through
 * esc() first. innerHTML parses its input as HTML, so unescaped text could inject markup or scripts;
 * textContent treats text literally and is always safe.
 *
 * Imports:
 *   - ./utils.js (tiny DOM, math and timing helpers): $$, clamp, esc
 *
 * Exports: bitRow, chipRow, hdrDiagram, hn, icon, kb, ladder, on, panel, sel, statRow, tabset, tbl, vd
 *
 * Used by: 25 files (app/ x5, modules/ x20)
 */

import { $$, clamp, esc } from './utils.js';

/**
 * Verdict box: a coloured message with a bold title.
 *
 * @param {'ok'|'bad'|'warn'|'info'} kind - colour/meaning.
 * @param {string} title
 * @param {string} [text] - HTML allowed; escape learner input first.
 */
export const vd = (kind, title, text = '') =>
  `<div class="verdict ${kind}" role="status"><b>${title}</b> ${text}</div>`;

/**
 * A grey hint paragraph.
 */
export const hn = t => `<p class="hint">${t}</p>`;

/**
 * A row of labelled "blocks" (key/value cards), used to show header fields.
 *
 * @param {Array<[string,string,string?]>} items - [label, value, colourClass c0..c4].
 */
export const kb = items =>
  `<div class="blks">${items.map(([k, v, c = 'c0']) => `<div class="blk ${c}"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}</div>`;

/**
 * Renders one table cell value: {h: html} is inserted as HTML, anything else is escaped text.
 */
const cell = c => (c && typeof c === 'object' && 'h' in c ? c.h : esc(c));

/**
 * Builds a scrollable table.
 *
 * @param {string[]} head - column titles.
 * @param {Array<Array>} rows - cell values; use {h: '<b>html</b>'} for pre-built HTML.
 * @param {string} [cls] - extra class for the table.
 */
export const tbl = (head, rows, cls = '') =>
  `<div class="tscroll"><table class="tb ${cls}"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${cell(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

/**
 * A row of small chips (e.g. one per byte).
 *
 * @param {string[]} list
 * @param {(i:number, x:string) => string} [fn] - returns the colour class for chip i.
 */
export const chipRow = (list, fn = () => 'c0') =>
  `<div class="chips">${list.map((x, i) => `<span class="chip ${fn(i, x)}">${esc(x)}</span>`).join('')}</div>`;

/**
 * A row of bit chips. With clickable=true each is a button with data-i, so a module can flip bits.
 */
export const bitRow = (bits, fn = () => 'c0', clickable = false) =>
  `<div class="chips bitrow">${bits
    .split('')
    .map((x, i) =>
      clickable
        ? `<button class="chip bt ${fn(i)}" data-i="${i}" aria-label="Bit ${i}, value ${x}. Click to flip">${x}</button>`
        : `<span class="chip bt ${fn(i)}">${x}</span>`
    )
    .join('')}</div>`;

/**
 * A labelled form field wrapper.
 */
const field = (label, input, id) =>
  `<div class="field"><label${id ? ` for="${id}"` : ''}>${label}</label>${input}</div>`;

/**
 * Builds a <select> with the current value preselected.
 *
 * @param {string} id
 * @param {Array<[string|number,string]>} opts - [value, label].
 * @param {*} cur - current value.
 */
export const sel = (id, opts, cur) =>
  `<select id="${id}">${opts.map(([v, l]) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;

/**
 * A titled card (<section class="panel">).
 *
 * @param {string} title
 * @param {string} body - HTML.
 * @param {string} [hint] - grey help text under the title.
 */
export const panel = (title, body, hint = '') =>
  `<section class="panel">${title ? `<h3>${title}</h3>` : ''}${hint ? hn(hint) : ''}${body}</section>`;

/* event delegation */
/**
 * Event delegation: one listener on a parent handles events from matching descendants.
 *
 * Instead of attaching a listener to every button (which breaks when the buttons are re-rendered), listen once on a stable ancestor and use closest() to find the element the event came from. This keeps working after innerHTML replaces the children.
 * @param {Element} root - stable ancestor.
 * @param {string} type - event name, e.g. 'click'.
 * @param {string} selector - which descendants to react to.
 * @param {(e:Event, el:Element) => void} fn
 */
export function on(root, type, selector, fn) {
  root.addEventListener(type, e => {
    // closest() climbs from the clicked element to the nearest match, so clicking an icon inside a
    // button still counts as clicking the button.
    const t = e.target.closest(selector);
    if (t && root.contains(t)) fn(e, t);
  });
}

/**
 * Counter that gives every tab set a unique id (needed for aria-controls / aria-labelledby).
 */
let tabUid = 0;

/**
 * Builds an accessible tab interface inside root.
 *
 * Left/Right arrow keys move between tabs. Each tab's render(panel) is called when selected and may return a cleanup function, which runs when another tab is chosen. Every render gets a brand-new container element, so a late async callback from a previous tab writes into a detached element and cannot corrupt the new tab.
 * @param {Element} root
 * @param {Array<{label:string, render:(panel:Element)=>(void|Function)}>} defs
 * @param {number} [start=0] - tab to open first.
 * @returns {{select:(i:number)=>void, destroy:()=>void}}
 */
export function tabset(root, defs, start = 0) {
  const uid = ++tabUid;
  root.innerHTML = `<div class="tabs" role="tablist">${defs.map((d, i) => `<button role="tab" class="tab" data-i="${i}" id="tab${uid}_${i}" aria-controls="tp${uid}">${d.label}</button>`).join('')}</div><div class="tabpanel" role="tabpanel" id="tp${uid}"></div>`;
  const bar = root.firstElementChild,
    pnl = root.lastElementChild;
  let cur = -1,
    cleanup = null;
  const select = i => {
    if (cleanup) {
      try {
        cleanup();
      } catch (e) {
        /* ignore */
      }
      cleanup = null;
    }
    cur = i;
    $$('.tab', bar).forEach((b, k) => {
      b.setAttribute('aria-selected', k === i);
      // Roving tabindex (WAI-ARIA tabs pattern): only the selected tab is reachable with the Tab
      // key; the arrow keys move between tabs.
      b.tabIndex = k === i ? 0 : -1;
    });
    pnl.setAttribute('aria-labelledby', `tab${uid}_${i}`);
    pnl.innerHTML = '';
    const inner = document.createElement('div');
    pnl.appendChild(inner); /* fresh node per render so stale async handlers hit a detached tree */
    cleanup = defs[i].render(inner) || null;
  };
  bar.addEventListener('click', e => {
    const b = e.target.closest('.tab');
    if (b) select(+b.dataset.i);
  });
  bar.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const n = (cur + (e.key === 'ArrowRight' ? 1 : -1) + defs.length) % defs.length;
      select(n);
      $$('.tab', bar)[n].focus();
      e.preventDefault();
    }
  });
  select(start);
  return {
    select,
    destroy() {
      if (cleanup) {
        try {
          cleanup();
        } catch (e) {
          /* ignore */
        }
        cleanup = null;
      }
    },
  };
}

/* ---------- ladder (message sequence) diagram ----------
   msgs : { t0, t1, dir:'lr'|'rl', label, cls, lost, idx }
   marks: { side:'l'|'r', t, label, cls }                                   */
/**
 * Draws a message sequence ("ladder") diagram as SVG.
 *
 * Time runs downward; each message is an arrow between the two vertical lifelines. The arrow is drawn with a CSS animation (--d is its start delay) unless animate is false.
 * @param {Object} o
 * @param {string} o.left - left endpoint name.
 * @param {string} o.right - right endpoint name.
 * @param {Array<{t0:number,t1:number,dir:'lr'|'rl',label:string,cls:string,lost:boolean,idx:number}>} o.msgs - messages (t0 send time, t1 arrival time; lost messages stop halfway with a cross).
 * @param {Array<{side:'l'|'r',t:number,label:string,cls:string}>} o.marks - notes beside a lifeline (timeouts...).
 * @param {number} [o.active] - messages with idx above this are dimmed (for step-through).
 */
export function ladder(o) {
  const {
    left = 'Sender',
    right = 'Receiver',
    msgs = [],
    marks = [],
    w = 720,
    active = Infinity,
    animate = true,
    maxH = 560,
  } = o;
  const xl = 118,
    xr = w - 118,
    top = 62;
  const tmax = Math.max(1, ...msgs.map(m => Math.max(m.t0, m.t1)), ...marks.map(m => m.t));
  // Pixels per time unit: shrink very long diagrams, but stay within a readable range.
  const scale = clamp(maxH / tmax, 24, 52);
  const H = Math.round(top + tmax * scale + 44);
  const X = s => (s === 'l' ? xl : xr),
    Y = t => top + t * scale;
  let s = `<svg class="ladder" viewBox="0 0 ${w} ${H}" role="img" aria-label="Message sequence diagram between ${esc(left)} and ${esc(right)}">`;
  [
    ['l', left, xl],
    ['r', right, xr],
  ].forEach(([, name, x]) => {
    s += `<line class="life" x1="${x}" y1="44" x2="${x}" y2="${H - 18}"/><rect class="head" x="${x - 62}" y="10" width="124" height="30" rx="9"/><text class="headt" x="${x}" y="30" text-anchor="middle">${esc(name)}</text>`;
  });
  if (tmax <= 30)
    for (let t = 0; t <= Math.floor(tmax); t++)
      s += `<text class="tick" x="14" y="${Y(t) + 4}">${t}</text>`;
  msgs.forEach(m => {
    const lr = m.dir === 'lr',
      x0 = lr ? xl : xr,
      x1 = lr ? xr : xl,
      y0 = Y(m.t0),
      y1 = Y(m.t1);
    // A lost message is drawn only part of the way before its red cross.
    const f = m.lost ? 0.56 : 1,
      xe = x0 + (x1 - x0) * f,
      ye = y0 + (y1 - y0) * f;
    const dim = m.idx !== undefined && m.idx > active ? ' dim' : '';
    const delay = animate ? `style="--d:${(m.t0 * 0.16).toFixed(2)}s"` : '';
    s += `<g class="m ${m.cls || 'c0'}${dim}${animate ? ' an' : ''}" ${delay}>`;
    s += `<line class="ml" x1="${x0}" y1="${y0}" x2="${xe}" y2="${ye}" pathLength="1"/>`;
    if (m.lost) {
      s += `<path class="x" d="M${xe - 7} ${ye - 7}l14 14m0 -14l-14 14"/>`;
    } else {
      // Arrowhead: find the arrow's angle, then place the triangle's corners relative to the tip
      // using cos/sin.
      const a = Math.atan2(ye - y0, xe - x0),
        c = Math.cos(a),
        sn = Math.sin(a);
      s += `<polygon class="ah" points="${xe},${ye} ${xe - 10 * c + 5 * sn},${ye - 10 * sn - 5 * c} ${xe - 10 * c - 5 * sn},${ye - 10 * sn + 5 * c}"/>`;
    }
    if (m.label)
      s += `<text class="lbl" x="${(x0 + xe) / 2}" y="${(y0 + ye) / 2 - 7}" text-anchor="middle">${esc(m.label)}</text>`;
    s += '</g>';
  });
  marks.forEach(k => {
    const x = X(k.side),
      y = Y(k.t),
      left_ = k.side === 'l';
    s += `<g class="mk ${k.cls || 'c3'}"><circle cx="${x}" cy="${y}" r="5.5"/><text x="${x + (left_ ? -12 : 12)}" y="${y + 4}" text-anchor="${left_ ? 'end' : 'start'}">${esc(k.label)}</text></g>`;
  });
  return s + '</svg>';
}

/**
 * SVG path data for the icons used in the interface, keyed by icon name.
 */
const IC = {
  dash: '<path d="M3 3h8v8H3zM13 3h8v5h-8zM13 11h8v10h-8zM3 14h8v7H3z"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3M7.5 15h9"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  rel: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
  net: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  trn: '<path d="M7 7h13l-3-3M17 17H4l3 3"/>',
  app: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>',
  adv: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  learn: '<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2zM4 20a2 2 0 0 0 2 2h13v-4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  trophy:
    '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
};

/**
 * Returns an inline <svg> icon.
 *
 * @param {string} n - a key of IC.
 * @param {string} [cls] - extra CSS class.
 */
export const icon = (n, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;

/**
 * A row of big-number statistic tiles: items are [value, label].
 */
export const statRow = items =>
  `<div class="stats wide">${items.map(([v, l]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`;

/**
 * Draws a protocol header as rows of boxes sized by their bit width.
 *
 * @param {Array<Array<[string,number,string,string?]>>} rows - each row is a list of [name, widthInBits, value, colourClass].
 */
export const hdrDiagram = rows =>
  `<div class="hdr32">${rows.map(r => `<div class="hrow">${r.map(([n, bits, v, c]) => `<div class="hbox ${c || 'c0'}" style="flex:${bits}"><small>${n}</small><b>${esc(v)}</b></div>`).join('')}</div>`).join('')}</div>`;
