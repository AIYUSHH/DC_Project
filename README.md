# Data Comms Lab

An interactive data-communications simulator. You type a message and follow it through every layer of the network: text -> UTF-8 bytes -> packets -> a lossy link with retries -> reassembly. Around that core lab sit 20 learning modules (framing, error detection, ARQ protocols, subnetting, routing, TCP, DNS, HTTP/TLS, packet capture, troubleshooting, quizzes ...).

Everything runs in your browser. There is no server code and no database.

---

## 1. Run it

### Prerequisites

- Any modern browser (Chrome, Edge, Firefox, Safari).
- Something that can serve files over `http://`. Python 3 is enough.

### Start a local server

```bash
cd data-comms-lab
python3 -m http.server 8000
```

Open <http://localhost:8000/>.

**Why not just double-click `index.html`?** The code is split into many files that load each other with `import`. Browsers refuse to load JavaScript modules from `file://` addresses (a security rule), so you would see a blank page and a CORS error in the console. Any static server fixes it (`npx serve`, VS Code "Live Server", etc.).

---

## 2. Folder tree

```text
data-comms-lab/
├── index.html                 page skeleton + the single <script type="module"> entry point
├── README.md                  this file
├── REFACTOR-REPORT.md         what moved where when the project was split into modules
├── css/                       stylesheets, loaded in this order (see section 8)
│   ├── tokens.css             colours, fonts, sizes (CSS variables), dark + light themes
│   ├── base.css               resets, element defaults, focus ring
│   ├── layout.css             app shell: sidebar, top bar, main area, page header
│   ├── components.css         buttons, inputs, chips, tables, tabs, toasts ...
│   ├── dashboard.css          dashboard screen
│   ├── lab.css                the four core-lab stages
│   ├── modules.css            visuals shared by learning modules (ladder diagrams, charts ...)
│   ├── learning.css           tutorials and quiz
│   └── responsive.css         phone/tablet rules, reduced motion, keyframes, print
└── js/
    ├── app.js                 ENTRY POINT: imports all modules, sorts them, calls boot()
    ├── core/                  building blocks with no knowledge of screens
    │   ├── state.js           shared in-memory state: DC (registry) and S (core lab)
    │   ├── storage.js         saved progress object P + localStorage save/reset
    │   ├── utils.js           $, $$, esc, clamp, sleep, seeded random
    │   ├── encoding.js        bytes <-> hex/bits/UTF-8, big-endian numbers
    │   ├── checksums.js       Internet checksum, CRC-8, CRC-32
    │   ├── addressing.js      IPv4/IPv6 + CIDR math
    │   └── ui-helpers.js      HTML builders: icons, tables, tabs, ladder diagram, event delegation
    ├── simulations/           PURE protocol logic (no DOM): easy to read and to test
    │   ├── packetization.js   core-lab packet layout
    │   ├── framing.js         byte stuffing and bit stuffing
    │   ├── error-detection.js parity / checksum / CRC comparison data
    │   ├── arq.js             Stop-and-Wait, Go-Back-N, Selective Repeat simulators
    │   ├── congestion.js      TCP congestion window + retransmission timer
    │   ├── routing.js         sample topology + Dijkstra
    │   ├── packet-builders.js Ethernet / IPv4 / TCP / UDP byte builders
    │   ├── dns-wire.js        DNS message encode/decode
    │   ├── dissector.js       bytes -> decoded layers + checksum verification
    │   ├── capture.js         sample captures + display-filter engine
    │   ├── encapsulation.js   layered data unit for the encapsulation module
    │   ├── transport.js       TCP/UDP header layouts, scenarios, handshake steps
    │   ├── dns.js             simulated DNS hierarchy + caching resolver
    │   ├── http-tls.js        simulated web server
    │   └── troubleshooting.js fault cases + simulated network commands
    ├── app/                   the application shell
    │   ├── router.js          URL hash -> screen
    │   ├── navigation.js      sidebar, breadcrumbs, which screen is visible
    │   ├── dashboard.js       home screen
    │   ├── progress.js        flags, stats, achievements
    │   ├── notifications.js   toast pop-ups
    │   └── theme.js           dark/light theme
    ├── lab/                   the four-stage core lab (DOM + simulation together)
    │   ├── message-stage.js   stage 1: text -> bytes
    │   ├── packet-stage.js    stage 2: bytes -> packets
    │   ├── transmission-stage.js  stage 3: animated lossy transfer
    │   ├── receiver-stage.js  stage 4: reassembly + decode
    │   ├── top-stats.js       top-bar counters
    │   └── lab-init.js        wires up the lab controls
    └── modules/               the learning modules
        ├── registry.js        GROUPS, CORE, regMod(), modById()
        ├── link-layer/        framing, error-detection, stop-and-wait, sliding-window
        ├── network-layer/     subnets, ip-headers, routing
        ├── transport-layer/   tcp-udp, handshake, congestion, sockets
        ├── application-layer/ dns, http-tls
        ├── advanced/          encapsulation, packet-capture, troubleshooting
        └── learning/          journey, tutorials, challenges, glossary
```

Every JavaScript file starts with a header comment listing what it is responsible for, what it imports (and from where), what it exports, and which files use it.

---

## 3. How imports and exports connect the app

```text
              +--------------------------- index.html ---------------------------+
              |   <script type="module" src="./js/app.js">                        |
              +-------------------------------+-----------------------------------+
                                              v
                                          js/app.js
          imports every module file (they register themselves), then calls boot()
                      |                      |                        |
                      v                      v                        v
               js/app/*  (shell)     js/modules/*  (screens)     js/lab/*  (core lab)
                      \                      |                        /
                       \                     v                       /
                        +-------->  js/simulations/*  (pure logic) <-+
                                             |
                                             v
                                       js/core/*  (helpers, state, storage)
```

Rules of thumb:

- Arrows only point **downwards**. `core` imports nothing from the layers above it; `simulations` import only `core`. That is why the pure logic can be read (and tested) without any HTML in sight.
- One small exception: `app/` and `lab/` use each other (the router starts lab stages; lab stages call `flag()` from `app/progress.js`). It never forms a loop between _files_, only between those two folders.
- A file lists everything it needs in `import { ... } from '...'` lines at the top. If a name is not imported, the file cannot use it. That is the whole point: you can see a file's dependencies at a glance.
- Only names that other files need are `export`ed. Everything else is private to its file.
- Nothing is attached to `window`. Typing `DC` or `P` in the browser console will say "not defined" because they live inside modules. To inspect them while debugging, temporarily add `window.DC = DC;` in `app.js`.

---

## 4. The module registry

A learning module is a plain object:

```js
regMod({
  id: "framing", // used in the URL: #/m/framing
  group: "link", // which learning-path group it belongs to (see GROUPS)
  title: "Framing and stuffing", // shown in sidebar and header
  desc: "one-sentence description",
  obj: ["learning objective", "..."],
  mount(root) {
    // draw into `root`, attach event handlers
    root.innerHTML = "...";
    return () => {
      /* cleanup: stop timers, remove listeners */
    };
  },
});
```

`regMod()` (in `modules/registry.js`) just pushes the object onto `DC.mods`. Because `app.js` imports each module file, each file's `regMod(...)` call runs once at start-up. The sidebar, dashboard, router and the previous/next links are all generated from `DC.mods`, so **registering a module is all it takes to add it to the app**.

The router calls `mount(root)` when you open `#/m/<id>` and calls the function it returned when you leave. Always return a cleanup function if you start a timer (`setInterval`) or add a listener outside `root`.

---

## 5. Shared state and browser storage

| Thing | File              | Lifetime     | What it is                                                     |
| ----- | ----------------- | ------------ | -------------------------------------------------------------- |
| `DC`  | `core/state.js`   | until reload | module list + listeners                                        |
| `S`   | `core/state.js`   | until reload | core-lab data: message, bytes, packets, last run, link up/down |
| `P`   | `core/storage.js` | **saved**    | the learner's progress                                         |

`P` is saved as JSON in `localStorage` under the key **`dcl.v2`**:

```json
{
  "visited": {},
  "flags": {},
  "ach": {},
  "runs": [],
  "stats": { "subnetOk": 0, "quizBest": 0, "quizRuns": 0 },
  "notes": {},
  "tut": {},
  "theme": "",
  "last": ""
}
```

- **`localStorage` is not a database.** It lives inside one browser on one device, holds only text, survives reloads, and is gone if the user clears site data. Nothing is sent anywhere. A real backend would be needed to share progress between devices.
- `P` is declared with `export let` because **Reset progress** replaces the whole object (`resetProgress()`). ES-module imports are _live bindings_, so every file sees the new object. Never copy `P` into your own variable.
- Never create a second copy of shared state. Import it from where it lives.
- Changing the shape of `P`? Keep old keys working (the loader merges saved data over `fresh()`), or bump the key to `dcl.v3` and decide how to migrate.

---

## 6. Where to find things (modify an existing module)

| I want to change...              | Open                                                     |
| -------------------------------- | -------------------------------------------------------- |
| How a screen looks / its buttons | `js/modules/<area>/<module>.js` (the `mount()` function) |
| The protocol maths behind it     | `js/simulations/<topic>.js`                              |
| Sidebar group names or order     | `GROUPS` in `js/modules/registry.js`                     |
| Colours, fonts, spacing          | `css/tokens.css`                                         |
| A button/table/tab style         | `css/components.css`                                     |
| Achievements                     | `ACH` in `js/app/progress.js`                            |
| Quiz questions                   | `QBANK` in `js/modules/learning/challenges.js`           |
| Glossary terms                   | `GLOSS` in `js/modules/learning/glossary.js`             |
| Tutorial steps                   | `TUTS` in `js/modules/learning/tutorials.js`             |

Tip: the URL tells you the module id (`#/m/errors`). Search for `id: 'errors'` to find its file.

---

## 7. Add a new learning module

1. Create `js/modules/<area>/my-module.js`:

```js
import { regMod } from "../registry.js";
import { panel, vd } from "../../core/ui-helpers.js";
import { $ } from "../../core/utils.js";
import { flag } from "../../app/progress.js";

regMod({
  id: "mymodule",
  group: "net", // one of the ids in GROUPS
  title: "My module",
  desc: "What the learner will do here.",
  obj: ["Objective one."],
  mount(root) {
    root.innerHTML = panel(
      "Hello",
      '<button class="btn" id="mygo">Click</button><div id="out"></div>',
    );
    $("#mygo", root).onclick = () => {
      $("#out", root).innerHTML = vd("ok", "It works.");
      flag("mymodule"); // records progress (optional)
    };
    return () => {}; // cleanup (optional)
  },
});
```

2. Open `js/app.js` and add `import './modules/<area>/my-module.js';` next to the other module imports (the order inside a group is the order in the sidebar).
3. Reload. The module appears in the sidebar, dashboard grid and previous/next links automatically.

Use `$('#id', root)` (search inside `root`) rather than `$('#id')` so you never match an element from another screen. Give your elements **unique ids**: the core lab's static HTML in `index.html` already uses ids such as `go`, `msg`, `ps` and `log`, so a module that reused `id="go"` would clash with the Transmit button.

## 8. CSS organisation and load order

`index.html` loads nine stylesheets, **in this order**, and the order matters: when two rules have equal specificity the later file wins.

1. `tokens.css` variables, themes
2. `base.css` element defaults
3. `layout.css` app shell
4. `components.css` reusable pieces
5. `dashboard.css` home screen
6. `lab.css` core lab
7. `modules.css` module visuals
8. `learning.css` tutorials / quiz
9. `responsive.css` breakpoints, reduced motion, animations, print

Themes: the `<html>` element carries `data-theme="dark|light"`. `tokens.css` defines the same variable names twice (once for each theme); everything else uses `var(--name)`, so switching theme needs no other CSS.

## 9. Add a new simulation

1. Put the logic in `js/simulations/my-sim.js` as **pure functions**: values in, values out, no `document`, no `$`. Example: `export function simulate(options) { ... return { steps, stats }; }`.
2. Import it in the module file that draws it and render the result.
3. Because it is pure, you can try it in Node without a browser:

```bash
node --input-type=module -e "import { simulate } from './js/simulations/my-sim.js'; console.log(simulate({}))"
```

(Only works for files that import nothing browser-specific; `core/checksums.js`, `core/addressing.js`, `simulations/arq.js`, `routing.js` etc. qualify.)

## 10. Debugging common errors

| Symptom                                                                         | Likely cause                                                                                                                           |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Blank page, console says _Access to script ... has been blocked by CORS policy_ | You opened `index.html` with `file://`. Use a local server (section 1).                                                                |
| `Failed to resolve module specifier` / `404` on a `.js`                         | Import path typo. Paths are relative, must start with `./` or `../`, and **must end in `.js`**.                                        |
| `The requested module ... does not provide an export named 'x'`                 | The function exists but is missing `export`, or you imported from the wrong file.                                                      |
| `x is not defined`                                                              | You used a name without importing it. Add it to the import line.                                                                       |
| `Cannot read properties of null (reading 'value')`                              | `$('#id')` found nothing (it returns `null`): the element is not on screen, the id is misspelled, or you searched in the wrong `root`. |
| Button stops working after you re-render                                        | You attached the listener to an element that `innerHTML` then replaced. Use `on(root, 'click', '.selector', fn)` (event delegation).   |
| Animation keeps running after leaving a screen                                  | `mount()` did not return a cleanup that calls `clearInterval`.                                                                         |
| Old progress confuses a test                                                    | In DevTools -> Application -> Local Storage, delete `dcl.v2`, or press **Reset progress** on the dashboard.                            |
| Changed CSS but nothing happens                                                 | Browser cache: hard reload (Ctrl/Cmd+Shift+R).                                                                                         |

Open DevTools (F12) -> **Console** for errors, **Network** to confirm every file loaded (all should be 200), **Sources** to set breakpoints inside your module files.

## 11. Test before you commit

There is no test framework (none is needed yet). Do this checklist:

1. `python3 -m http.server 8000`, open the app with DevTools open: **console must be empty**.
2. Visit every item in the sidebar. Nothing should show "This module failed to load".
3. Core lab: type a message (try an emoji and an empty box), change packet size, transmit at 0% and 50% loss, open the receiver. Press **Stop** mid-run; toggle the link; navigate away mid-run.
4. Use the browser Back/Forward buttons; paste a direct link such as `/#/m/dns` into a new tab.
5. Toggle the theme, reload: the theme must persist. Visit a few modules, reload: green "visited" dots must persist.
6. Narrow the window to phone width: the menu button opens the sidebar; nothing scrolls sideways.
7. Syntax-check quickly: `for f in $(find js -name '*.js'); do node --input-type=module --check < $f || echo $f; done`

A lightweight next step when you are ready: add Node's built-in test runner (`node --test`) with a few tests for the pure files (`core/checksums.js`, `simulations/arq.js`, `simulations/routing.js`), for example "crc32 of `123456789` is `0xCBF43926`".

## 12. Git: review and commit

```bash
git status
git diff --stat
git add -A
git commit -m "Refactor: split app into ES modules and stylesheets (no behaviour change)"
```

To keep it reversible, do it on a branch and keep the old three-file version in history first:

```bash
git switch -c refactor/modules      # work here, not on main
git add -A && git commit -m "Refactor: ES modules + split CSS"
# if something is wrong:  git switch main    (the old version is untouched)
# when happy:             git switch main && git merge refactor/modules
```

## 13. Glossary of web terms used in the code comments

- **ES module**: a JavaScript file with its own private scope that shares things only through `export` and `import`.
- **DOM**: the live tree of elements the browser builds from HTML. `document.querySelector` finds elements in it.
- **`innerHTML` vs `textContent`**: `innerHTML` parses a string as HTML (powerful but dangerous with user text, so use `esc()`), `textContent` treats it as plain text (always safe).
- **Event delegation**: one listener on a stable parent handles clicks of many children, including ones created later.
- **Hash routing**: the URL part after `#` selects the screen; changing it never reloads the page.
- **Live binding**: an imported variable always reflects the exporting file's current value.
