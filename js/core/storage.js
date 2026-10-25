/**
 * saved progress (localStorage) and the shared P object
 *
 * Owns the learner's saved progress: visited screens, flags, achievements, run history, notes and
 * theme. It is stored as JSON in the browser's localStorage under the key "dcl.v2".
 *
 * localStorage is browser-side persistence: it belongs to one browser on one device, survives reloads, and can
 * be wiped by the user. It is not a database and nothing is sent to a server.
 *
 * Imports:
 *   (none)
 *
 * Exports: P, save
 *
 * Used by: 8 files (app.js/ x1, app/ x4, modules/ x3)
 */

/** localStorage key. The "v2" suffix is the schema version: bump it only when the saved shape changes. */
export const STORE = 'dcl.v2';

/**
 * Builds a brand-new, empty progress object.
 * Every key here is part of the saved schema (see README: "Shared state and storage").
 * @returns {{visited:Object,flags:Object,ach:Object,runs:Array,stats:Object,notes:Object,tut:Object,theme:string,last:string}}
 */
export const fresh = () => ({
  visited: {}, // route keys the learner has opened, e.g. { lab0: 1700000000000, framing: ... }
  flags: {}, // named "things the learner has done" (set by flag()), e.g. { delivered: <timestamp> }
  ach: {}, // unlocked achievements: id -> timestamp
  runs: [], // history of core-lab transmissions (newest first)
  stats: { subnetOk: 0, quizBest: 0, quizRuns: 0 }, // counters (see stat()/setStat())
  notes: {}, // tutorial notes by tutorial id
  tut: {}, // reserved for tutorial state (kept for schema compatibility)
  theme: '', // 'dark' | 'light' | '' (= follow the operating system)
  last: '', // route key of the last screen, used by "Resume"
});

/**
 * The single shared progress object. It is declared with `export let` because resetProgress()
 * replaces it with a new object. ES module imports are *live bindings*: every file that imports
 * `P` sees the new object automatically. Never copy `P` into a variable of your own.
 */
export let P = fresh();

/* Load saved progress. Storage can be missing or blocked (private windows), so failures are ignored
   and the app simply starts with fresh progress. Object.assign keeps new keys when an older save
   lacks them, so adding a field never breaks existing users. */
try {
  const raw = localStorage.getItem(STORE);
  if (raw) P = Object.assign(fresh(), JSON.parse(raw));
  P.stats = Object.assign(fresh().stats, P.stats);
} catch (e) {
  /* storage unavailable */
}

/**
 * Writes progress to localStorage. localStorage is per-browser, per-site storage that survives
 * reloads. It is NOT a database: it cannot be shared between devices and can be cleared by the user.
 */
export const save = () => {
  try {
    localStorage.setItem(STORE, JSON.stringify(P));
  } catch (e) {
    /* ignore */
  }
};

/**
 * Clears all progress, achievements and notes but keeps the chosen theme, then saves.
 * (Originally this logic lived inline in the dashboard's reset button, which could not work across
 * modules because an imported binding cannot be reassigned from outside its own file.)
 */
export function resetProgress() {
  const th = P.theme;
  P = fresh();
  P.theme = th;
  save();
}
