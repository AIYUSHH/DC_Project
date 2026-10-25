/**
 * toast pop-ups
 *
 * Shows the small achievement notifications in the corner of the screen and removes them again.
 *
 * Imports:
 *   - ../core/utils.js (tiny DOM, math and timing helpers): $, REDUCE, esc
 *   - ../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): icon
 *
 * Exports: toast
 *
 * Used by: app/progress.js
 */

import { icon } from '../core/ui-helpers.js';
import { $, esc, REDUCE } from '../core/utils.js';

/**
 * Shows a temporary achievement notification.
 *
 * Uses textContent-safe escaping (esc) and removes the element after a few seconds. Does nothing if the container is missing.
 */
export function toast(title, msg) {
  const box = $('#toasts');
  if (!box) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span class="toast-ic">${icon('trophy')}</span><div><b>${esc(title)}</b><span>${esc(msg)}</span></div>`;
  box.append(t);
  setTimeout(() => t.classList.add('out'), REDUCE ? 600 : 4200);
  setTimeout(() => t.remove(), REDUCE ? 900 : 4700);
}
