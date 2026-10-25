/**
 * byte stuffing and bit stuffing (data-link framing)
 *
 * Framing marks where one frame ends and the next begins. Two classic methods are implemented:
 * byte stuffing (a flag byte 0x7E inside the data is escaped with 0x7D) and bit stuffing (HDLC: insert a 0 after
 * five consecutive 1s so the flag 01111110 can never appear inside data), plus the receiver-side scanners that
 * undo them.
 *
 * Imports:
 *   (none)
 *
 * Exports: ESC, FLAG, FLAGBITS, bitScan, bitStuff, byteScan, byteStuff
 *
 * Used by: modules/learning/challenges.js, modules/link-layer/framing.js
 */

/**
 * Frame delimiter byte 0x7E and escape byte 0x7D (PPP/HDLC convention).
 */
export const FLAG = 0x7e,
  ESC = 0x7d,
  FLAGBITS = '01111110';

/**
 * Byte stuffing: before sending, replaces each FLAG or ESC in the data with ESC followed by (byte XOR 0x20).
 */
export const byteStuff = d => {
  const o = [];
  d.forEach(b => {
    // Escape the byte: send ESC, then the byte with bit 5 flipped (0x7E becomes 0x5E) so it no
    // longer looks like a frame boundary.
    if (b === FLAG || b === ESC) o.push(ESC, b ^ 0x20);
    else o.push(b);
  });
  return o;
};

/**
 * Reverses byte stuffing: an ESC means "take the next byte and XOR it with 0x20".
 */
const byteUnstuff = d => {
  const o = [];
  for (let i = 0; i < d.length; i++) {
    if (d[i] === ESC) {
      i++;
      if (i < d.length) o.push(d[i] ^ 0x20);
    } else o.push(d[i]);
  }
  return o;
};

/**
 * Bit stuffing (HDLC): inserts a 0 after every run of five 1s so the six-1s flag pattern never appears in the data.
 *
 * @param {string} bits - e.g. "0111111011".
 * @returns {string} stuffed bits.
 */
export function bitStuff(bits) {
  let out = '',
    run = 0;
  for (const c of bits) {
    out += c;
    if (c === '1') {
      // Five 1s in a row: insert a 0 so the flag 01111110 (six 1s) can never appear inside the
      // data.
      if (++run === 5) {
        out += '0';
        run = 0;
      }
    } else run = 0;
  }
  return out;
}

/**
 * Receiver for byte-stuffed frames: splits a byte stream at FLAG bytes and unstuffs each frame.
 */
export function byteScan(stream) {
  // receiver for flag-delimited byte frames
  const frames = [];
  let buf = [],
    inF = false;
  stream.forEach(b => {
    if (b === FLAG) {
      if (inF && buf.length) frames.push(byteUnstuff(buf));
      buf = [];
      inF = true;
    } else if (inF) buf.push(b);
  });
  return frames;
}

/**
 * Receiver for bit-stuffed frames: finds the 01111110 flags in a bit stream and removes the stuffed 0s.
 */
export function bitScan(bits) {
  // receiver for HDLC-style bit stuffing
  const frames = [];
  let buf = [],
    ones = 0,
    inF = false;
  for (const ch of bits) {
    if (ch === '1') {
      ones++;
      buf.push(1);
      if (ones >= 7) {
        buf = [];
        ones = 0;
        inF = false;
      } // abort sequence
    } else {
      if (ones === 5) {
        ones = 0;
        continue;
      } // stuffed 0: drop it
      if (ones === 6) {
        // flag found
        const fb = buf.slice(0, Math.max(0, buf.length - 7));
        if (inF && fb.length) {
          if (fb.length % 8 === 0) {
            const by = [];
            for (let i = 0; i < fb.length; i += 8)
              by.push(parseInt(fb.slice(i, i + 8).join(''), 2));
            frames.push(by);
          } else frames.push(null);
        }
        buf = [];
        ones = 0;
        inF = true;
        continue;
      }
      buf.push(0);
      ones = 0;
    }
  }
  return frames;
}
