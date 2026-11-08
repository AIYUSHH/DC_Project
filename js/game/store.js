/**
 * game store: XP, medals, streak and badges, kept inside the existing progress object P so that the
 * existing Firebase sync (core/storage.js) saves and merges them with no changes.
 *   P.stats.xp / streak / lastDay / dailyDay  numbers (merged with Math.max)
 *   P.stats['q_<module id>']                  best quiz medal 0..3
 *   P.ach['g_<badge id>']                     badge unlock time (merged as a union)
 */
import { P, save } from '../core/storage.js';
import { toast } from '../app/notifications.js';
import { $ } from '../core/utils.js';
import { ZONES, META } from './data.js';
import { dayNum, levelFor, streakNext } from './rules.js';

export const BADGES = {
  zero: ['Zero Loss', '🎯', 'Score 100% on a quiz.'],
  speed: ['Speed Runner', '⚡', 'Finish a quiz fast with at most one miss.'],
  night: ['Night Owl', '🦉', 'Finish a quiz after 10 pm or before 5 am.'],
  whisper: ['Packet Whisperer', '👂', 'Visit all four core-lab stages.'],
  egg: ['Easter Egg', '🥚', 'Hidden: try tapping the logo.'],
  ...Object.fromEntries(ZONES.map(z => ['z_' + z.id, [z.name + ' Master', z.e, `Earn a medal in every ${z.name} module.`]])),
};

export const xp = () => P.stats.xp || 0;
export const streak = () => P.stats.streak || 0;
export const medal = id => P.stats['q_' + id] || 0;
export const hasBadge = id => !!P.ach['g_' + id];
export const MEDALS = ['⚪', '🥉', '🥈', '🥇'];

/** Quiz modules are "done" once they hold a medal; tools and lab stages once visited. */
export const isDone = id => (META[id] && META[id].q ? medal(id) > 0 : !!P.visited[id]);
export const quizIds = () => Object.keys(META).filter(id => META[id].q);

export function addXp(n) {
  P.stats.xp = xp() + n;
  touch();
  save();
  updatePill();
}

/** Marks today as a learning day and extends or restarts the streak. */
export function touch() {
  const today = dayNum();
  P.stats.streak = streakNext(P.stats.lastDay || 0, today, streak());
  P.stats.lastDay = today;
}

export function setMedal(id, m) {
  if (m > medal(id)) P.stats['q_' + id] = m;
  save();
}

/** Unlocks a badge once. Returns true when it is new. */
export function grant(id) {
  if (hasBadge(id) || !BADGES[id]) return false;
  P.ach['g_' + id] = Date.now();
  toast('Badge unlocked', `${BADGES[id][0]}: ${BADGES[id][2]}`);
  save();
  return true;
}

/** Awards the badges that depend on overall progress. Returns the ids that are new. */
export function checkMeta() {
  const out = [];
  if ([0, 1, 2, 3].every(i => P.visited['lab' + i]) && grant('whisper')) out.push('whisper');
  ZONES.forEach(z => {
    const ids = quizIds().filter(id => META[id].z === z.id);
    if (ids.length && ids.every(id => medal(id) > 0) && grant('z_' + z.id)) out.push('z_' + z.id);
  });
  return out;
}

/** First visit of a lab stage or tool earns a small XP reward. */
export function visitXp(key, amount = 20) {
  if (!P.visited[key]) addXp(amount);
}

/** Refreshes the streak / level pill in the top bar. */
export function updatePill() {
  const el = $('#gpill');
  if (!el) return;
  const l = levelFor(xp());
  el.innerHTML = `🔥 ${streak()} · Lv ${l.n} · ${xp()} XP`;
}
