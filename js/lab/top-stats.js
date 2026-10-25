/**
 * top-bar counters
 *
 * Updates the three counters in the top bar (bytes, packets, retries). Pass undefined for a value to
 * leave it unchanged.
 *
 * Imports:
 *   - ../core/utils.js (tiny DOM, math and timing helpers): $
 *
 * Exports: setTop
 *
 * Used by: lab/message-stage.js, lab/packet-stage.js, lab/transmission-stage.js
 */

import { $ } from '../core/utils.js';

/**
 * Updates the top-bar counters. Pass undefined for any value that should stay as it is.
 */
export function setTop(b, p, r) {
  if (b !== undefined) $('#n1').textContent = b;
  if (p !== undefined) $('#n2').textContent = p;
  if (r !== undefined) $('#n3').textContent = r;
}
