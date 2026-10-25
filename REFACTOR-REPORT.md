# Refactor report

Scope: split the three-file project (`index.html`, one `css/style.css`, one ~3,000-line concatenated `js/app.js`) into ES modules and ordered stylesheets, add documentation, and change **no behaviour**. The original three files were left untouched in `/home/claude` next to this folder.

## 1. Structure before and after

**Before**: `index.html` + `css/style.css` (one file) + `js/app.js` (one file; 12 source sections concatenated; ~180 top-level names sharing one global scope).

**After**: `index.html` + 9 stylesheets + 56 JavaScript files in `core/`, `simulations/`, `app/`, `lab/`, `modules/` (see README section 2 for the tree).

Deviations from the proposed layout (the proposal said to adapt):
* `lab/` was added. The four core-lab stages mix DOM and simulation tightly, so they got their own folder instead of being scattered across `simulations/` and `app/`.
* `simulations/` is named by topic (`arq.js`, `congestion.js`, `dissector.js`, `capture.js` ...) instead of `flow-control.js` / `transport.js` only, because the code did not fall into the proposed ten buckets. `transmission.js` was not created: the transmit loop is animation code and lives in `lab/transmission-stage.js`.
* `modules/advanced/` was added for encapsulation, packet capture and troubleshooting (they belong to no single layer). Sockets/NAT sits in `transport-layer/`.
* `css/dashboard.css` was added so the dashboard rules could keep their original position in the cascade (after components, before the lab).
* `core/addressing.js` holds the pure IPv4/IPv6 maths; there is no separate `simulations/addressing.js` because nothing remained to put in it.

## 2. Where the old sections went

| Old section | New location |
|-------------|--------------|
| 01 util | `core/utils.js`, `encoding.js`, `checksums.js`, `addressing.js` (IP helpers), `ui-helpers.js`, `state.js` |
| 02 sim | `simulations/arq.js`, `congestion.js`, `routing.js` |
| 03 net | `simulations/packet-builders.js`, `dns-wire.js`, `dissector.js`, `capture.js` |
| 04 shell | `app/router.js`, `navigation.js`, `dashboard.js`, `progress.js`, `notifications.js`, `theme.js`, `core/storage.js`, `modules/registry.js`, `core/ui-helpers.js` (icons), `app.js` (`boot`) |
| 05 lab | `lab/*.js` + `simulations/packetization.js` |
| 06 link | `modules/link-layer/framing.js`, `error-detection.js` + `simulations/framing.js`, `error-detection.js` |
| 07 arq | `modules/link-layer/stop-and-wait.js`, `sliding-window.js` |
| 08 network | `modules/network-layer/*` + address maths in `core/addressing.js` |
| 09 transport | `modules/transport-layer/*` + `simulations/transport.js` |
| 10 app | `modules/application-layer/*` + `simulations/dns.js`, `http-tls.js` |
| 11 adv | `modules/advanced/*` + `simulations/encapsulation.js`, `troubleshooting.js` |
| 12 learn | `modules/learning/*` |
| 99 boot | bottom of `app.js` |

## 3. How it was done (so it is trustworthy)

The code was **moved mechanically, not retyped**. A script parsed every top-level declaration with a real JavaScript parser (acorn), resolved which names each declaration uses (scope-aware, so a local variable that happens to share a global's name is not confused with it), assigned each declaration to its new file, and generated every `import` and `export` line from that analysis. Code was then formatted with Prettier (whitespace only) and documentation was inserted. Nothing was hand-copied between files.

## 4. Shared-state and dependency decisions

* `DC` (module registry) and `S` (core-lab state) live in `core/state.js`: one definition, imported everywhere.
* `P` (saved progress) lives in `core/storage.js` as `export let P`. It used to be reassigned from the dashboard's reset button; an importing file cannot reassign an imported binding, so that logic became `resetProgress()` in `core/storage.js`. Because imports are live bindings, every file sees the new object. (See section 5.)
* Router-private variables `cleanup` and `currentKey`, and the lab's `labSig` and tab counter `tabUid`, stay private to the one file that uses them.
* Helpers used by only one module stayed inside that module's file (e.g. `cwndChart`, `colorHttp`, `journeyData`) instead of becoming exports.
* No circular imports between files (verified by script). `app/` and `lab/` depend on each other at folder level only.
* Nothing is attached to `window` any more (the classic script version shared a global scope).

## 5. Behaviour changes (unavoidable or deliberate)

1. **Must be served over HTTP.** ES modules do not load from `file://`. Use `python3 -m http.server`.
2. **`resetProgress()`** replaces the inline reset code (same result: clears everything, keeps theme).
3. **`--coral` colour token added** in `css/tokens.css` as an alias of `--bad`. The lab script paints a corrupted packet with `var(--coral)`, but my earlier stylesheet never defined that variable, so the corrupted packet was not recoloured. This is a one-line fix to a latent bug, flagged here instead of being hidden in the refactor.
4. Globals such as `DC`, `P`, `S` are no longer visible in the browser console.
5. Stylesheet text was reformatted by Prettier (one declaration per line); rules and their order are unchanged.

## 6. Observations left alone (not fixed on purpose)

* `field()` (core/ui-helpers.js) and `rid()` (core/utils.js) are never used. Kept.
* `analyzeCapture()` declares an unused `first = {}`; `compileFilter()` contains `(isIp || true)` which is always true. Harmless; left as they were.
* `transmit()` declares a local `const P = S.P` that shadows the progress object `P` inside that function (it does not use progress there). Confusing but correct; renaming it would be a good first clean-up.
* The **Stop** button takes effect when the current animation step finishes (up to ~1.5 s at "Slow" speed), because cancellation is checked after each `await`. Original behaviour.
* `P_RUNS_ADD` has an unusual name for a function; renaming it would be safe now that everything is traceable.

## 7. Tests actually executed (Chromium via Playwright, files served over HTTP)

| Check | Result |
|-------|--------|
| Syntax/parse of all 56 files as ES modules, every import resolves to an existing export | pass |
| Circular imports between files | none |
| Unused imports | none |
| All 25 routes load (dashboard, 4 lab stages, 20 modules), every tab opened, no console/page errors | pass |
| Stress test: change every select/slider, click ~60 controls per screen, two passes, every tab | pass (no errors) |
| **Equivalence**: rendered HTML of 50 screen/tab states compared with the original build (seeded `Math.random`, dark theme) | **0 differences** |
| **Pixel comparison**: 38 screenshots (desktop dark + phone light) vs original | 25 identical; 13 differ only by a 2-4 px sliver that the *original* also produces between two of its own runs (renderer noise) |
| Core lab: send "Hello, 世界" at 0% loss, receiver decodes it | pass |
| Tutorials auto-tick from real simulator actions; quiz scores | pass |
| Direct link, unknown route fallback, back/forward | pass |
| Theme persists after reload; progress persists; old/partial and corrupted saves tolerated; reset | pass |
| Empty message disables Transmit; Stop; link toggle; navigating away mid-run | pass |
| Horizontal overflow at 390 px width on 7 screens (dark theme) | none |
| `crc32("123456789") == 0xCBF43926` (standard check value) | pass |
| README "add a module" recipe actually creates a working module in the sidebar | pass |

## 8. Still needs a human

* Firefox and Safari (only Chromium was run).
* Keyboard-only and screen-reader walkthrough (focus styles and ARIA were preserved but not re-audited with assistive technology).
* A real phone (only an emulated 390 px viewport).
* The Google Fonts links need internet access; offline the app falls back to system fonts.

## 9. Git

See README section 12. Short version: work on a branch, commit as one change, keep `main` untouched until verified.
