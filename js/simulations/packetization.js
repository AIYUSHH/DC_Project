/**
 * packet layout of the core lab
 *
 * The core lab's packet is [sequence number, payload length, ...payload bytes, CRC-8]. This file
 * defines that layout (header size HDR, trailer size TRL) and the two functions that build the bytes and the
 * trailer. Keeping the layout here means the sender, the receiver and the journey module all agree on it.
 *
 * Imports:
 *   - ../core/checksums.js (parity-free error-detection math: Internet checksum, CRC-8, CRC-32): crc8
 *
 * Exports: HDR, TRL, packetBytes, packetCrc
 *
 * Used by: lab/packet-stage.js, lab/transmission-stage.js, modules/learning/journey.js
 */

import { crc8 } from '../core/checksums.js';

/**
 * Size of the core-lab packet header in bytes (sequence number + length).
 */
export const HDR = 2,
  TRL = 1;

/**
 * Builds the bytes of core-lab packet i: [sequence (1-based), payload length, ...payload].
 */
export const packetBytes = (i, p) => [i + 1, p.length, ...p];

/**
 * CRC-8 trailer of a core-lab packet, computed over its header and payload.
 */
export const packetCrc = (i, p) => crc8(packetBytes(i, p));
