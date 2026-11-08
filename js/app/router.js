/**
 * hash router: URL -> screen
 *
 * Maps the part of the URL after "#" to a screen:
 *   #/            dashboard
 *   #/lab/0..3    the four core-lab stages
 *   #/m/<id>      a learning module (id from regMod)
 * route() runs on page load and on every "hashchange" event, which is also what makes the browser's back and
 * forward buttons work. Before switching, it cancels timers and calls the previous module's cleanup function so
 * nothing keeps running in the background.
 *
 * Imports:
 *   - ../core/state.js (shared in-memory state): DC, S
 *   - ../core/storage.js (saved progress (localStorage) and the shared P object): P, save
 *   - ../core/utils.js (tiny DOM, math and timing helpers): $, esc
 *   - ../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): icon, vd
 *   - ../modules/registry.js (learning-module registry and group definitions): CORE, GROUPS, modById
 *   - ./navigation.js (sidebar, breadcrumbs and which screen is visible): crumbs, refreshNav, setStage
 *   - ./dashboard.js (dashboard screen): renderDash
 *   - ./progress.js (achievements, flags and statistics): checkAch
 *   - ../lab/packet-stage.js (core lab stage 2: cut the byte stream into packets): labSplit
 *   - ../lab/transmission-stage.js (core lab stage 3: stop-and-wait delivery over a lossy link): labPrepare
 *   - ../lab/receiver-stage.js (core lab stage 4: reassemble and decode the message): labRecv
 *
 * Exports: route
 *
 * Used by: app.js
 */

import { DC, S } from '../core/state.js';
import { P, save } from '../core/storage.js';
import { icon, vd } from '../core/ui-helpers.js';
import { $, esc } from '../core/utils.js';
import { CORE, GROUPS, modById } from '../modules/registry.js';
import { renderDash } from './dashboard.js';
import { crumbs, refreshNav, setStage } from './navigation.js';
import { checkAch } from './progress.js';
import { labSplit } from '../lab/packet-stage.js';
import { labRecv } from '../lab/receiver-stage.js';
import { labPrepare } from '../lab/transmission-stage.js';

/**
 * DOM ids of the four core-lab screens, indexed by the number in #/lab/<n>.
 */
const stageIds = ['s0', 's1', 's2', 's3'];

/**
 * Router bookkeeping (module-level state).
 *
 * cleanup: the function returned by the current module's mount(), called when the learner navigates away.
 * currentKey: route key of the screen being shown ('dash', 'lab0'..'lab3' or a module id). Both are `let` because they are reassigned on every navigation, and they are private to this file.
 */
let cleanup = null,
  currentKey = '';

/**
 * Reads location.hash and shows the matching screen.
 *
 * Order of work: (1) cancel anything from the previous screen (token bump, timers, module cleanup); (2) render the new screen; (3) record the visit and re-check achievements; (4) update the navigation, scroll to top and move keyboard focus to the main area.
 */
export function route() {
  // Hash routing: "#/m/dns" becomes "m/dns". The part of a URL after # is never sent to a server,
  // so it suits single-page apps; changing it fires "hashchange" and adds a history entry (which
  // is what makes the back button work).
  const h = location.hash.replace(/^#\/?/, '');
  const [kind, arg] = h.split('/');
  // Invalidate any running core-lab animation (see transmit()).
  S.tok++;
  S.busy = false;
  // Stop the receiver's typewriter timer.
  clearInterval(S.timer);
  // Let the module we are leaving stop its timers and listeners.
  if (cleanup) {
    try {
      cleanup();
    } catch (e) {
      console.error(e);
    }
    cleanup = null;
  }
  if (kind === 'lab' && stageIds[+arg]) {
    const i = +arg;
    currentKey = 'lab' + i;
    setStage(stageIds[i]);
    crumbs(['Core lab', CORE[i][0]]);
    document.title = `${CORE[i][0]} · Data Comms Lab`;
    if (i === 1) labSplit();
    if (i === 2) labPrepare();
    if (i === 3) labRecv();
  } else if (kind === 'about' || kind === 'support') {
    currentKey = kind;
    renderInfoPage(kind);
  } else if (kind === 'm' && modById(arg)) {
    const m = modById(arg);
    currentKey = m.id;
    renderModule(m);
  } else {
    currentKey = 'dash';
    setStage('dash');
    crumbs(['Dashboard']);
    document.title = 'Data Comms Lab';
    renderDash();
  }
  // Remember the first visit time (an existing value is kept).
  const isInfoPage = currentKey === 'about' || currentKey === 'support';
  if (!isInfoPage) {
    P.visited[currentKey] = P.visited[currentKey] || Date.now();
    if (currentKey !== 'dash') P.last = currentKey;
    checkAch();
    save();
  }
  refreshNav(currentKey);
  window.scrollTo(0, 0);
  document.body.classList.remove('nav-open');
  const v = $('#view');
  if (v) v.focus({ preventScroll: true });
}

/**
 * Shows a learning module: header, objectives, a body container, previous/next links, then calls m.mount(body).
 *
 * If mount() throws, the error is logged and a message is shown instead of breaking the whole app. The cleanup function mount returns is kept in `cleanup` for the next route() call.
 */
function renderModule(m) {
  const g = GROUPS.find(x => x.id === m.group),
    idx = DC.mods.indexOf(m),
    prev = DC.mods[idx - 1],
    next = DC.mods[idx + 1];
  const root = $('#mview');
  setStage('mview');
  crumbs([g.name, m.title]);
  document.title = `${m.title} · Data Comms Lab`;
  root.innerHTML = `<div class="head"><div class="eyebrow">${icon(g.icon)} ${g.name}</div><h2>${m.title}</h2><p>${m.desc}</p></div>
    ${m.obj ? `<details class="obj"><summary>Learning objectives</summary><ul>${m.obj.map(o => `<li>${o}</li>`).join('')}</ul></details>` : ''}
    <div id="mbody"></div>
    <div class="foot">${prev ? `<a class="btn ghost" href="#/m/${prev.id}">← ${prev.title}</a>` : '<span></span>'}${next ? `<a class="btn" href="#/m/${next.id}">${next.title} →</a>` : '<a class="btn" href="#/">Back to dashboard</a>'}</div>`;
  try {
    // mount() may return a cleanup function (or nothing). Keep it for the next route() call.
    cleanup = m.mount($('#mbody')) || null;
  } catch (e) {
    console.error(e);
    $('#mbody').innerHTML = vd('bad', 'This module failed to load.', esc(e.message));
  }
}


/** Render the public-facing About and Support pages without affecting learning progress. */
function renderInfoPage(page) {
  const root = $('#info-page');
  setStage('info-page');
  if (page === 'about') {
    crumbs(['About BitSecure']);
    document.title = 'About Us · BitSecure';
    root.innerHTML = `
      <div class="info-hero about-hero">
        <span class="info-kicker">ABOUT BITSECURE</span>
        <h1>Learning by doing.<br><span>Understanding by simulating.</span></h1>
        <p>BitSecure is an interactive learning platform that turns complex technical concepts into practical, visual experiences. Instead of only reading how systems work, learners can experiment, observe what happens, and build a deeper understanding.</p>
        <a class="btn" href="#/">Explore the lab <span aria-hidden="true">→</span></a>
      </div>
      <section class="info-section">
        <div class="info-section-heading"><span class="info-kicker">OUR PURPOSE</span><h2>Make learning interactive</h2></div>
        <div class="info-feature-grid">
          <article class="info-card"><span class="info-icon" aria-hidden="true">◎</span><h3>Learn through experience</h3><p>Explore concepts with hands-on simulations, visual explanations, and guided experiments.</p></article>
          <article class="info-card"><span class="info-icon" aria-hidden="true">⌁</span><h3>See what happens behind the scenes</h3><p>Break complex processes into understandable stages and follow how each part works.</p></article>
          <article class="info-card"><span class="info-icon" aria-hidden="true">↗</span><h3>Build confidence</h3><p>Practice, test ideas, make mistakes safely, and learn at your own pace.</p></article>
        </div>
      </section>
      <section class="info-section future-section">
        <div class="info-section-heading"><span class="info-kicker">THE BIGGER VISION</span><h2>One platform. Simulations for many courses.</h2></div>
        <p class="info-section-lead">BitSecure begins with Data Communications, but our ambition goes much further. We want to build interactive simulation experiences for a wide range of academic courses and disciplines, helping students understand difficult ideas by seeing and experimenting with them.</p>
        <div class="discipline-list"><span>Computer Science</span><span>Electronics</span><span>Mathematics</span><span>Physics</span><span>Engineering</span><span>More disciplines to come</span></div>
        <p class="info-muted">Our long-term goal is to make practical, visual learning tools more accessible to students and educators across different fields.</p>
      </section>
      <section class="info-section team-section">
        <div class="info-section-heading"><span class="info-kicker">THE PEOPLE BEHIND THE PROJECT</span><h2>Meet the developers</h2><p>Built with curiosity, collaboration, and a shared interest in making technical education easier to explore.</p></div>
        <div class="developer-grid">
          <article class="developer-card"><div class="developer-avatar" aria-hidden="true">SP</div><h3>Sahil Patra</h3><p>Developer</p><a href="https://github.com/sahilvxky25" target="_blank" rel="noopener noreferrer">GitHub · @sahilvxky25 ↗</a></article>
          <article class="developer-card"><div class="developer-avatar" aria-hidden="true">AA</div><h3>Aiyush Anand</h3><p>Developer</p><a href="https://github.com/AIYUSHH" target="_blank" rel="noopener noreferrer">GitHub · @AIYUSHH ↗</a></article>
          <article class="developer-card"><div class="developer-avatar" aria-hidden="true">SR</div><h3>Somya Ranjan</h3><p>Developer</p><a href="https://github.com/Somya22005" target="_blank" rel="noopener noreferrer">GitHub · @Somya22005 ↗</a></article>
        </div>
      </section>
      <section class="info-cta"><div><span class="info-kicker">KEEP EXPLORING</span><h2>Curiosity is where understanding begins.</h2><p>Try the lab and explore how data moves through a network.</p></div><div class="info-cta-actions"><a class="btn" href="#/">Open BitSecure <span aria-hidden="true">→</span></a><a class="btn ghost" href="https://github.com/sahilvxky25/DC_Project" target="_blank" rel="noopener noreferrer">View GitHub Repository ↗</a></div></section>`;
  } else {
    crumbs(['Support BitSecure']);
    document.title = 'Support Us · BitSecure';
    root.innerHTML = `
      <div class="info-hero support-hero">
        <span class="info-kicker">SUPPORT THE MISSION</span>
        <h1>Help us make learning<br><span>more hands-on for everyone.</span></h1>
        <p>We want to expand BitSecure beyond Data Communications and create useful, interactive simulations for students across many courses. Your encouragement can help us keep building.</p>
      </div>
      <section class="info-section support-content">
        <div class="support-message"><span class="info-icon" aria-hidden="true">♡</span><h2>Why your support matters</h2><p>Support can help us dedicate more time to developing new course simulations, improving existing experiences, creating clearer animations and visual explanations, and keeping educational tools accessible to learners.</p></div>
        <div class="support-list"><div><b>01</b><span><strong>More course simulations</strong><small>Bring interactive learning to new subjects and disciplines.</small></span></div><div><b>02</b><span><strong>Better learning experiences</strong><small>Improve usability, animations, accessibility, and explanations.</small></span></div><div><b>03</b><span><strong>Accessible education</strong><small>Keep building practical resources that learners can explore at their own pace.</small></span></div></div>
      </section>
      <section class="support-coming-soon"><span class="coming-soon-pill">COMING SOON</span><h2>Support us on Patreon</h2><p>We are preparing our Patreon page. Once it is live, this page will include a link for anyone who wants to support the project.</p><button class="btn" type="button" disabled aria-disabled="true">Patreon page coming soon</button><p class="info-muted">There is no payment link available yet. Please check back later.</p></section>
      <div class="info-back-link"><a href="#/about">Learn more about our mission →</a><p><a href="https://github.com/sahilvxky25/DC_Project" target="_blank" rel="noopener noreferrer">Explore the project on GitHub ↗</a></p></div>`;
  }
}
