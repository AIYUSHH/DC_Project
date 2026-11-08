/**
 * game rules: pure functions (no DOM, no storage) so they can be unit-tested with `node --test tests/`.
 * XP per quiz, medal thresholds, levels, streak rules and special-badge conditions all live here.
 */

/** Level titles: [minimum XP, title]. A numbered level also rises every 150 XP. */
export const TITLES = [[0, 'Newbie'], [300, 'Packet Pro'], [900, 'Network Wizard']];

/** XP for a finished quiz: 10 per correct answer, +30 for finishing, +20 for a perfect score. */
export function quizXp(correct, total) {
  return correct * 10 + 30 + (correct === total ? 20 : 0);
}

/** Medal for a quiz score: 3 gold (perfect), 2 silver (one miss), 1 bronze (at least 40%), 0 none. */
export function medalFor(correct, total) {
  if (correct === total) return 3;
  if (correct >= total - 1) return 2;
  return correct >= Math.ceil(total * 0.4) ? 1 : 0;
}

/** Level number, title and progress to the next level for a given XP total. */
export function levelFor(xp) {
  const n = Math.floor(xp / 150) + 1;
  const title = [...TITLES].reverse().find(t => xp >= t[0])[1];
  return { n, title, into: xp % 150, size: 150 };
}

/** Whole local days since the epoch (so streaks follow the learner's own midnight). */
export const dayNum = (d = new Date()) => Math.floor((d.getTime() - d.getTimezoneOffset() * 6e4) / 864e5);

/** New streak length: same day keeps it, the next day adds one, any longer gap restarts at 1. */
export function streakNext(lastDay, today, streak) {
  if (!lastDay) return 1;
  if (today === lastDay) return Math.max(1, streak);
  return today === lastDay + 1 ? streak + 1 : 1;
}

/** Special badges earned by one quiz run. `secs` is quiz time, `hour` the local hour (0-23). */
export function quizBadges({ correct, total, secs, hour }) {
  const out = [];
  if (correct === total) out.push('zero');
  if (secs < 6 * total && correct >= total - 1) out.push('speed');
  if (hour >= 22 || hour < 5) out.push('night');
  return out;
}

/** Day-stable index for the daily challenge. */
export const dailyIndex = (day, n) => ((day % n) + n) % n;
