/**
 * sidebar, breadcrumbs and which screen is visible
 *
 * Builds the sidebar from the module registry, keeps its "active" and "visited" markers up to date, shows
 * exactly one screen (<section class="stage">) at a time, and renders the breadcrumb in the top bar.
 *
 * Imports:
 *   - ../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): icon
 *   - ../core/state.js (shared in-memory state): DC
 *   - ../core/utils.js (tiny DOM, math and timing helpers): $, $$
 *   - ../core/storage.js (saved progress (localStorage) and the shared P object): P
 *   - ../modules/registry.js (learning-module registry and group definitions): CORE, GROUPS
 *
 * Exports: buildNav, crumbs, refreshNav, setStage
 *
 * Used by: app.js, app/dashboard.js, app/router.js
 */

import { DC } from '../core/state.js';
import { P } from '../core/storage.js';
import { icon } from '../core/ui-helpers.js';
import { $, $$ } from '../core/utils.js';
import { CORE, GROUPS } from '../modules/registry.js';

/**
 * Builds the sidebar HTML: dashboard link, core-lab steps and one collapsible group per learning-path group.
 */
export function buildNav() {
  let h = `<a class="nav-link" href="#/" data-r="dash">${icon('dash')}<span>Dashboard</span></a>`;
  h += `<div class="nav-h">${icon('flask')}<span>Core lab</span></div><div class="nav-list">`;
  CORE.forEach((c, i) => {
    h += `<a class="nav-link step" href="#/lab/${i}" data-r="lab${i}"><span class="num">${i + 1}</span><span class="nl"><b>${c[0]}</b><small>${c[1]}</small></span></a>`;
  });
  h += '</div>';
  GROUPS.forEach(g => {
    const ms = DC.mods.filter(m => m.group === g.id);
    h += `<details class="grp" data-g="${g.id}"><summary>${icon(g.icon)}<span>${g.name}</span><em class="gcount" data-gc="${g.id}"></em></summary><div class="nav-list">`;
    ms.forEach(m => {
      h += `<a class="nav-link sub" href="#/m/${m.id}" data-r="${m.id}"><span>${m.title}</span><i class="dot" aria-hidden="true"></i></a>`;
    });
    h += '</div></details>';
  });
  $('#nav').innerHTML = h;
}

/**
 * Updates the sidebar for the current screen: marks the active link (aria-current), visited dots, per-group counters, and opens the active module's group.
 */
export function refreshNav(active) {
  $$('#nav .nav-link').forEach(a => {
    const k = a.dataset.r;
    a.classList.toggle('active', k === active);
    if (k === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
    a.classList.toggle('seen', !!P.visited[k]);
  });
  GROUPS.forEach(g => {
    const ms = DC.mods.filter(m => m.group === g.id),
      n = ms.filter(m => P.visited[m.id]).length;
    const c = $(`[data-gc="${g.id}"]`);
    if (c) c.textContent = `${n}/${ms.length}`;
    const d = $(`details[data-g="${g.id}"]`);
    if (d && ms.some(m => m.id === active)) d.open = true;
  });
}

/**
 * Shows one screen and hides the others by toggling the "on" class on .stage sections.
 */
export function setStage(id) {
  $$('.stage').forEach(s => s.classList.toggle('on', s.id === id));
}

/**
 * Renders the breadcrumb trail in the top bar.
 */
export function crumbs(parts) {
  $('#crumbs').innerHTML = parts
    .map((p, i) =>
      i === parts.length - 1 ? `<b aria-current="page">${p}</b>` : `<span>${p}</span>`
    )
    .join('<i>/</i>');
}
