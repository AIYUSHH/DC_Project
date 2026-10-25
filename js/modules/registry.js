/**
 * learning-module registry and group definitions
 *
 * Defines the learning-path groups (GROUPS), the four core-lab stages (CORE), and regMod(), the
 * function every learning module calls to register itself. A module is a plain object:
 *   { id, group, title, desc, obj, mount(root) }
 * mount(root) draws the module inside root and may return a cleanup function; the router calls that function when
 * the learner leaves. This tiny contract is all that is needed to add a module (see README: "Add a module").
 *
 * Imports:
 *   - ../core/state.js (shared in-memory state): DC
 *
 * Exports: CORE, GROUPS, modById, regMod
 *
 * Used by: 24 files (app/ x4, modules/ x20)
 */

import { DC } from '../core/state.js';

/**
 * Learning-path groups, in the order they appear. A module's `group` must be one of these ids.
 */
export const GROUPS = [
  { id: 'link', name: 'Link and errors', icon: 'link', blurb: 'Framing and error detection' },
  { id: 'rel', name: 'Reliable transfer', icon: 'rel', blurb: 'ACKs, timers and windows' },
  { id: 'net', name: 'Network layer', icon: 'net', blurb: 'Addresses, headers, routing' },
  { id: 'trn', name: 'Transport layer', icon: 'trn', blurb: 'TCP, UDP, ports, congestion' },
  { id: 'app', name: 'Application layer', icon: 'app', blurb: 'DNS, HTTP and TLS' },
  { id: 'adv', name: 'Advanced', icon: 'adv', blurb: 'Encapsulation, captures, debugging' },
  {
    id: 'learn',
    name: 'Journey and learning',
    icon: 'learn',
    blurb: 'Guided paths, quizzes, reference',
  },
];

/**
 * The four core-lab stages: [title, subtitle].
 */
export const CORE = [
  ['Message & Encoding', 'Words to bytes'],
  ['Packetization', 'Split the stream'],
  ['Transmission Lab', 'Cross the link'],
  ['Receiver & Reconstruction', 'Rebuild the message'],
];

/**
 * Registers a learning module.
 *
 * @param {{id:string, group:string, title:string, desc:string, obj?:string[], mount:(root:Element)=>(void|Function)}} m
 */
export const regMod = m => DC.mods.push(m);

/**
 * Finds a registered module by id, or undefined.
 */
export const modById = id => DC.mods.find(m => m.id === id);
