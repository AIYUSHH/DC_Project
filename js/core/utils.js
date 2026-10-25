/**
 * tiny DOM, math and timing helpers
 *
 * Small helpers with no knowledge of networking: DOM shortcuts ($, $$), HTML escaping (esc),
 * clamp, a seeded random-number generator (rng), reduced-motion detection (REDUCE) and sleep().
 * Everything here is safe to use from any other file.
 *
 * Imports:
 *   (none)
 *
 * Exports: $, $$, REDUCE, clamp, esc, fmtN, pickOne, rng, sleep
 *
 * Used by: 33 files (app.js/ x1, app/ x5, core/ x1, lab/ x6, modules/ x20)
 */

/**
 * Finds the first element matching a CSS selector.
 *
 * @param {string} s - CSS selector.
 * @param {ParentNode} [r=document] - where to search (use a module's root to avoid matching other screens).
 * @returns {?Element} the element, or null when nothing matches (so check before using the result if it may be missing).
 */
export const $ = (s, r = document) => r.querySelector(s);

/**
 * Finds all elements matching a selector.
 *
 * @param {string} s - CSS selector.
 * @param {ParentNode} [r=document] - where to search.
 * @returns {Element[]} a real array (querySelectorAll returns a NodeList, which has no map/filter).
 */
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/**
 * Escapes text so it can be placed safely inside an HTML string.
 *
 * Replaces the five characters that have meaning in HTML. Use it for any text that came from the learner before putting it into innerHTML; text assigned with textContent does not need it.
 * @param {*} s - value to escape (converted to a string).
 * @returns {string} escaped text.
 */
export const esc = s =>
  String(s).replace(
    // The five characters that can change how HTML is parsed. One pass with a lookup table means a
    // replacement is never escaped twice.
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

/**
 * Restricts a number to the range [a, b].
 *
 * @param {number} n
 * @param {number} a - minimum.
 * @param {number} b - maximum.
 * @returns {number}
 */
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/**
 * True when the operating system asks for reduced motion.
 *
 * Animations check this and shorten or skip themselves (accessibility).
 */
export const REDUCE =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Waits for a number of milliseconds.
 *
 * Used with await inside simulations. With reduced motion it waits only 15 ms.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export const sleep = ms => new Promise(r => setTimeout(r, REDUCE ? 15 : ms));

/**
 * Creates a seeded pseudo-random generator (mulberry32).
 *
 * The same seed always gives the same sequence, which makes simulator scenarios replayable.
 * @param {number} seed
 * @returns {() => number} function returning numbers in [0, 1).
 */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    // mulberry32: advance the state by a constant, then scramble it. ">>> 0" keeps values unsigned
    // 32-bit; Math.imul multiplies as 32-bit integers (plain * would lose precision).
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    // Divide by 2^32 to map the 32-bit integer into the range [0, 1).
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Picks a random element from an array.
 *
 * @param {Array} arr
 * @param {() => number} [r=Math.random] - random source (pass rng(seed) for repeatable picks).
 */
export const pickOne = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];

/**
 * Formats a number with thousands separators (en-US).
 */
export const fmtN = n => Number(n).toLocaleString('en-US');

/**
 * Makes a short random id string. (Currently unused; kept from the original code.)
 */
const rid = () => Math.random().toString(36).slice(2, 8);
