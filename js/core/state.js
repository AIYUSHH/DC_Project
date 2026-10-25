/**
 * shared in-memory state
 *
 * Holds the two objects that many files read and write while the app is running:
 *   - DC: the module registry (DC.mods) plus progress listeners (DC.listeners);
 *   - S:  the state of the core lab (message, bytes, packets, the last transmission run).
 * They are declared once, here, and imported everywhere else. Never create a second copy: two
 * copies would drift apart and parts of the screen would show different data.
 * This state lives only in memory; it disappears on reload. Saved progress is in core/storage.js.
 *
 * Imports:
 *   (none)
 *
 * Exports: DC, S
 *
 * Used by: 17 files (app/ x4, core/ x1, lab/ x5, modules/ x7)
 */

/**
 * The module registry and progress listeners.
 *
 * @property {Array<Object>} mods - registered learning modules (filled by regMod()).
 * @property {Array<Function>} listeners - functions called with a flag name whenever flag() records something new (used by the tutorials screen).
 */
export const DC = { mods: [], listeners: [] };

/**
 * Core-lab state shared by the four lab stages.
 *
 * @property {number[]} bytes - the message as UTF-8 bytes.
 * @property {number[][]} P - the packets: the bytes cut into payload-sized slices.
 * @property {?Object} run - the latest transmission ({arr, got, retries, log, cfg, ...}) or null.
 * @property {boolean} up - whether the simulated link is up.
 * @property {boolean} busy - true while a transmission is in progress.
 * @property {number} tok - cancellation token: any async work compares it to the value it started with.
 * @property {string} msg - the message text.
 */
export const S = { bytes: [], P: [], run: null, up: true, busy: false, tok: 0, msg: 'Hello, 世界' };
