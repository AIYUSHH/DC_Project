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
import { crumbs, setStage } from './navigation.js';
import { renderDaily, renderHome, renderProfile, renderZone } from '../game/screens.js';
import { renderFlow } from '../game/flow.js';
import { ZONES } from '../game/data.js';
import { checkMeta, updatePill, visitXp } from '../game/store.js';
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
  const [kind, arg, sub] = h.split('/');
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
    visitXp('lab' + i);
    currentKey = 'lab' + i;
    setStage(stageIds[i]);
    crumbs(['Core lab', CORE[i][0]]);
    document.title = `${CORE[i][0]} · Data Comms Lab`;
    if (i === 1) labSplit();
    if (i === 2) labPrepare();
    if (i === 3) labRecv();
  } else if (kind === 'm' && modById(arg)) {
    const m = modById(arg);
    currentKey = m.id;
    const g = GROUPS.find(x => x.id === m.group);
    setStage('mview');
    crumbs([g ? g.name : 'Toolbox', m.title]);
    document.title = `${m.title} · BitSecure`;
    cleanup = renderFlow(m, $('#mview'), sub === 'play');
  } else if (kind === 'zone' && ZONES.some(z => z.id === arg)) {
    currentKey = 'zone-' + arg;
    setStage('dash');
    crumbs(['Map', ZONES.find(z => z.id === arg).name]);
    document.title = 'BitSecure';
    renderZone(arg);
  } else if (kind === 'profile' || kind === 'daily') {
    currentKey = kind;
    setStage('dash');
    crumbs([kind === 'daily' ? 'Daily challenge' : 'Profile']);
    document.title = 'BitSecure';
    (kind === 'daily' ? renderDaily : renderProfile)();
  } else {
    currentKey = 'dash';
    setStage('dash');
    crumbs(['Map']);
    document.title = 'BitSecure';
    renderHome();
  }
  // Remember the first visit time (an existing value is kept).
  P.visited[currentKey] = P.visited[currentKey] || Date.now();
  if (currentKey !== 'dash') P.last = currentKey;
  checkAch();
  checkMeta();
  save();
  updatePill();
  window.scrollTo(0, 0);
  document.body.classList.remove('nav-open');
  const v = $('#view');
  if (v) v.focus({ preventScroll: true });
}
