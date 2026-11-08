/** small shared UI helpers for the game layer: glossary tooltips, confetti, easter egg. */
import { TERMS } from './data.js';
import { esc } from '../core/utils.js';
import { grant, updatePill } from './store.js';

const re = new RegExp('\\b(' + Object.keys(TERMS).join('|') + ')\\b', 'g');

/** Underlines glossary words in already-safe text; tapping one shows its meaning. */
export const gl = text => text.replace(re, w => `<u class="gl" tabindex="0" data-t="${w}">${w}</u>`);

let tipTimer;
function showTip(word) {
  let t = document.getElementById('gtip');
  if (!t) {
    t = document.createElement('div');
    t.id = 'gtip';
    t.setAttribute('role', 'status');
    document.body.append(t);
  }
  t.innerHTML = `<b>${esc(word)}</b> ${esc(TERMS[word])}`;
  t.classList.add('on');
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => t.classList.remove('on'), 4500);
}

export function boom() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < 36; i++) {
    const s = document.createElement('span');
    s.className = 'gconf';
    s.textContent = ['🎉', '✨', '⭐', '💜'][i % 4];
    s.style.cssText = `left:${Math.random() * 100}vw;animation-delay:${Math.random() * 0.6}s`;
    document.body.append(s);
    setTimeout(() => s.remove(), 3200);
  }
}

/** One-time global wiring: glossary taps and the hidden logo easter egg (5 taps). */
export function initGameUi() {
  document.addEventListener('click', e => {
    const g = e.target.closest && e.target.closest('.gl');
    if (g) showTip(g.dataset.t);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('gl')) showTip(e.target.dataset.t);
  });
  let taps = 0, t0 = 0;
  const brand = document.getElementById('gbrand');
  if (brand) brand.addEventListener('click', () => {
    const now = Date.now();
    taps = now - t0 < 2500 ? taps + 1 : 1;
    t0 = now;
    if (taps >= 5 && grant('egg')) { boom(); updatePill(); }
  });
  updatePill();
}
