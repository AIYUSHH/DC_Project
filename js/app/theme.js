/**
 * dark/light theme switching
 *
 * Applies a theme by setting data-theme on the <html> element (the stylesheet reacts to
 * [data-theme="light"]) and updates the theme button. The chosen theme is saved in progress by app.js.
 *
 * Imports:
 *   - ../core/utils.js (tiny DOM, math and timing helpers): $
 *   - ../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): icon
 *
 * Exports: applyTheme
 *
 * Used by: app.js
 */

import { icon } from '../core/ui-helpers.js';
import { $ } from '../core/utils.js';

/**
 * Applies a theme to the page.
 *
 * @param {'dark'|'light'|''} t - empty means follow the operating system preference.
 */
export function applyTheme(t) {
  const theme = t || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.dataset.theme = theme;
  const b = $('#themeBtn');
  if (b) {
    b.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
    b.setAttribute(
      'aria-label',
      theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
    );
  }
}
