/**
 * packet layout of the core lab
 *
 * The core lab uses the original compact header for text packets and an extended 16-bit sequence/length header for image packets. This file
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
 * Text keeps its original one-byte sequence/length header. Image packets opt into
 * a 16-bit sequence and length so large files can use useful payload sizes.
 */
export const HDR = 2,
  TRL = 1;

/**
 * Builds the packet header. The optional extended form is
 * [sequence high, sequence low, length high, length low, ...payload].
 */
export const packetBytes = (i, p, extended = false) => {
  const seq = i + 1;
  if (extended) {
    if (seq > 0xffff || p.length > 0xffff) {
      throw new RangeError('Image packet sequence and payload length must fit in 16 bits.');
    }
    return [seq >>> 8, seq & 0xff, p.length >>> 8, p.length & 0xff, ...p];
  }
  if (seq > 0xff || p.length > 0xff) {
    throw new RangeError('Text packet sequence and payload length must fit in 8 bits.');
  }
  return [seq, p.length, ...p];
};

/**
 * CRC-8 trailer of a core-lab packet, computed over its header and payload.
 */
export const packetCrc = (i, p, extended = false) => crc8(packetBytes(i, p, extended));
