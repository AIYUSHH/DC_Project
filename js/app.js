/**
 * application entry point
 *
 * The only file index.html loads (<script type="module" src="./js/app.js">).
 * It does three things, in this order:
 *   1. imports every learning-module file. Each of those files calls regMod() as it loads,
 *      which is how the modules "register" themselves (see modules/registry.js);
 *   2. sorts the registered modules into learning-path order;
 *   3. calls boot(), which wires the theme button, mobile menu, keyboard handling and the
 *      hashchange listener, builds the navigation and shows the first screen.
 *
 * Why ES modules? "import" and "export" make every dependency visible at the top of each file, and
 * nothing leaks into the global scope (open the browser console and type DC: it is not defined).
 *
 * Imports:
 *   - ./core/storage.js (saved progress (localStorage) and the shared P object): P, save
 *   - ./core/utils.js (tiny DOM, math and timing helpers): $
 *   - ./app/theme.js (dark/light theme switching): applyTheme
 *   - ./app/navigation.js (sidebar, breadcrumbs and which screen is visible): buildNav
 *   - ./app/router.js (hash router: URL -> screen): route
 *   - ./lab/lab-init.js (wires up the core-lab controls): labInit
 *
 * Exports: (none)
 *
 * Used by: index.html (<script type="module">)
 */

import { P, save } from './core/storage.js';
import { $ } from './core/utils.js';
import { buildNav } from './app/navigation.js';
import { route } from './app/router.js';
import { applyTheme } from './app/theme.js';
import { labInit } from './lab/lab-init.js';
import './modules/link-layer/framing.js';
import './modules/link-layer/error-detection.js';
import './modules/link-layer/stop-and-wait.js';
import './modules/link-layer/sliding-window.js';
import './modules/network-layer/subnets.js';
import './modules/network-layer/ip-headers.js';
import './modules/network-layer/routing.js';
import './modules/transport-layer/tcp-udp.js';
import './modules/transport-layer/handshake.js';
import './modules/transport-layer/congestion.js';
import './modules/transport-layer/sockets.js';
import './modules/application-layer/dns.js';
import './modules/application-layer/http-tls.js';
import './modules/advanced/encapsulation.js';
import './modules/advanced/packet-capture.js';
import './modules/advanced/troubleshooting.js';
import './modules/learning/journey.js';
import './modules/learning/tutorials.js';
import './modules/learning/challenges.js';
import './modules/learning/glossary.js';
import { DC } from './core/state.js';
import { GROUPS } from './modules/registry.js';

/**
 * One-time start-up: theme, navigation, core-lab controls, global handlers and the first route().
 */
function boot() {
  applyTheme(P.theme);
  buildNav();
  labInit();
  // Toggle the theme and remember the choice in saved progress (an empty theme means "follow the
  // operating system").
  $('#themeBtn').onclick = () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    P.theme = t;
    save();
    applyTheme(t);
  };
  $('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');
  $('#scrim').onclick = () => document.body.classList.remove('nav-open');
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.body.classList.remove('nav-open');
  });
  // Every change of the URL hash (link click, back/forward button, typed URL) re-runs the router.
  window.addEventListener('hashchange', route);
  route();
}

// ---- start-up ----
// Importing the module files above ran their regMod() calls, so DC.mods is now filled (in import order).
// Sort it by learning-path group so the navigation and dashboard follow GROUPS order (the sort is stable,
// so modules keep their import order inside each group).
DC.mods.sort(
  (a, b) => GROUPS.findIndex(x => x.id === a.group) - GROUPS.findIndex(x => x.id === b.group)
);
boot();
