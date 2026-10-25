/**
 * achievements, flags and statistics
 *
 * The "game layer" on top of saved progress. flag(name) records that the learner did something once,
 * stat()/setStat() count things, and checkAch() unlocks achievements whose test() now passes (showing a toast).
 * Simulators call flag() at the moment the learner does the interesting thing; tutorials listen for those flags.
 *
 * Imports:
 *   - ../core/storage.js (saved progress (localStorage) and the shared P object): P, save
 *   - ../core/state.js (shared in-memory state): DC
 *   - ../modules/registry.js (learning-module registry and group definitions): CORE
 *   - ./notifications.js (toast pop-ups): toast
 *
 * Exports: ACH, P_RUNS_ADD, allKeys, checkAch, flag, setStat, stat
 *
 * Used by: 16 files (app/ x2, lab/ x4, modules/ x10)
 */

import { DC } from '../core/state.js';
import { P, save } from '../core/storage.js';
import { CORE } from '../modules/registry.js';
import { toast } from './notifications.js';

/**
 * Achievement definitions: each has a test() that is re-evaluated by checkAch().
 */
export const ACH = [
  {
    id: 'first',
    name: 'First packet',
    icon: '1',
    desc: 'Get a packet across the link.',
    test: () => P.flags.delivered,
  },
  {
    id: 'retry',
    name: 'Survived a retry',
    icon: '↺',
    desc: 'Recover from a lost or corrupted packet.',
    test: () => P.flags.retry,
  },
  {
    id: 'perfect',
    name: 'Perfect delivery',
    icon: '★',
    desc: 'Deliver every packet with no retries at 30% loss or more.',
    test: () => P.flags.perfect,
  },
  {
    id: 'rebuilt',
    name: 'Message rebuilt',
    icon: '✉',
    desc: 'Reassemble a complete message at the receiver.',
    test: () => P.flags.rebuilt,
  },
  {
    id: 'silent',
    name: 'Silent corruption',
    icon: '≈',
    desc: 'Corrupt data in a way that parity cannot see.',
    test: () => P.flags.parityMiss,
  },
  {
    id: 'crc',
    name: 'CRC to the rescue',
    icon: '#',
    desc: 'Catch an error that parity missed.',
    test: () => P.flags.crcCatch,
  },
  {
    id: 'subnet',
    name: 'Subnet master',
    icon: '/',
    desc: 'Answer 3 subnet challenges correctly.',
    test: () => P.stats.subnetOk >= 3,
  },
  {
    id: 'handshake',
    name: 'Handshake',
    icon: '⇄',
    desc: 'Walk through a complete TCP three-way handshake.',
    test: () => P.flags.handshake,
  },
  {
    id: 'detective',
    name: 'Packet detective',
    icon: '⌕',
    desc: 'Apply a display filter in the capture explorer.',
    test: () => P.flags.filter,
  },
  {
    id: 'doctor',
    name: 'Network doctor',
    icon: '+',
    desc: 'Diagnose a fault in the troubleshooting lab.',
    test: () => P.flags.diagnosed,
  },
  {
    id: 'keys',
    name: 'Key agreement',
    icon: '⚿',
    desc: 'Derive a shared TLS-style key on both sides.',
    test: () => P.flags.ecdh,
  },
  {
    id: 'quiz',
    name: 'Quiz ace',
    icon: '✓',
    desc: 'Score 80% or better on a quiz.',
    test: () => P.stats.quizBest >= 80,
  },
  {
    id: 'explorer',
    name: 'Explorer',
    icon: '◎',
    desc: 'Visit every module in the lab.',
    test: () => allVisited(),
  },
];

/**
 * Route keys of every screen (4 lab stages + all modules). Used for completion percentages.
 */
export const allKeys = () => [...CORE.map((_, i) => 'lab' + i), ...DC.mods.map(m => m.id)];

/**
 * True when every screen has been visited (the "Explorer" achievement).
 */
const allVisited = () => allKeys().every(k => P.visited[k]);

/**
 * Records that the learner has done something (once), then checks achievements, saves, and notifies listeners.
 *
 * Calling it again for the same name does nothing, so simulators can call it freely.
 * @param {string} name - e.g. 'retry', 'handshake'.
 */
export function flag(name) {
  // Only the first time counts, so simulators can call flag() freely.
  if (P.flags[name]) return;
  P.flags[name] = Date.now();
  checkAch();
  save();
  // Tell interested screens (e.g. the tutorials) so they can tick a step. An error in one listener
  // must not break the simulator that called flag().
  DC.listeners.forEach(f => {
    try {
      f(name);
    } catch (e) {
      /* ignore */
    }
  });
}

/**
 * Adds delta to a named counter in P.stats, then re-checks achievements and saves.
 */
export function stat(name, delta = 1) {
  P.stats[name] = (P.stats[name] || 0) + delta;
  checkAch();
  save();
}

/**
 * Sets a named counter in P.stats (for values like a best score), then re-checks achievements and saves.
 */
export function setStat(name, v) {
  P.stats[name] = v;
  checkAch();
  save();
}

/**
 * Unlocks every achievement whose test() now passes and shows a toast for each.
 */
export function checkAch() {
  ACH.forEach(a => {
    if (!P.ach[a.id] && a.test()) {
      P.ach[a.id] = Date.now();
      toast('Achievement unlocked', `${a.name}: ${a.desc}`);
    }
  });
}

/**
 * Adds a finished core-lab run to the history (newest first, keeping the last 12). Name kept from the original code.
 */
export function P_RUNS_ADD(r) {
  P.runs.unshift(r);
  P.runs = P.runs.slice(0, 12);
  save();
  checkAch();
}
