/**
 * TCP/UDP header layouts, example scenarios and handshake steps
 *
 * Data and logic for the transport modules: field layouts used to draw the TCP and UDP headers, the
 * protocol-choice scenarios, the TCP state descriptions, and buildTcpSteps(), which produces the step-by-step
 * segments and states of the three-way handshake, data transfer and teardown (including a lost-SYN variant).
 *
 * Imports:
 *   (none)
 *
 * Exports: SCENARIOS, STATE_INFO, TCP_HDR, UDP_HDR, blankHdr, buildTcpSteps
 *
 * Used by: modules/transport-layer/handshake.js, modules/transport-layer/tcp-udp.js
 */

/**
 * Layout of the TCP header as rows of [field, bits, example value, colour].
 */
export const TCP_HDR = [
  [
    ['Source port', 16, ''],
    ['Destination port', 16, ''],
  ],
  [['Sequence number', 32, '', 'c3']],
  [['Acknowledgment number', 32, '', 'c3']],
  [
    ['Offset', 4, ''],
    ['Reserved', 3, '0'],
    ['Flags (9)', 9, '', 'c2'],
    ['Window', 16, '', 'c1'],
  ],
  [
    ['Checksum', 16, ''],
    ['Urgent pointer', 16, '0'],
  ],
];

/**
 * Layout of the UDP header, same shape as TCP_HDR.
 */
export const UDP_HDR = [
  [
    ['Source port', 16, ''],
    ['Destination port', 16, ''],
  ],
  [
    ['Length', 16, ''],
    ['Checksum', 16, ''],
  ],
];

/**
 * Copies a header layout, filling blank values from vals in order (used by the segment builder).
 */
export const blankHdr = (h, vals) => {
  let k = 0;
  return h.map(r => r.map(([n, b, v, c]) => [n, b, v === '' ? (vals[k++] ?? '') : v, c]));
};

/**
 * "Pick the protocol" scenarios: [situation, best protocol, why].
 */
export const SCENARIOS = [
  [
    'A live video call between two people',
    'UDP',
    'A late packet is useless in a live call. Retransmitting old audio only adds delay, so real-time media prefers UDP.',
  ],
  [
    'Downloading a 2 GB software update',
    'TCP',
    'Every byte must arrive, in order, exactly once. TCP’s retransmission and ordering do that for you.',
  ],
  [
    'Looking up a domain name',
    'UDP',
    'One small question and one small answer. A handshake would cost more than the data itself, so DNS uses UDP (and falls back to TCP for large answers).',
  ],
  [
    'Loading an online banking page',
    'TCP',
    'Correctness and ordering matter, and HTTPS runs on a reliable byte stream.',
  ],
  [
    'Sending fast game-state updates 60 times a second',
    'UDP',
    'A newer update replaces an older one, so resending lost old state is wasted effort.',
  ],
  [
    'Delivering an email message',
    'TCP',
    'Messages must arrive complete. SMTP relies on TCP’s reliability.',
  ],
  [
    'A sensor reporting its temperature every second',
    'UDP',
    'Tiny, frequent readings where missing one is harmless. UDP keeps the device simple.',
  ],
  [
    'Copying a file with SSH',
    'TCP',
    'An interactive, ordered, reliable session is exactly what TCP provides.',
  ],
];

/**
 * Produces the ordered steps of a TCP connection for the handshake module.
 *
 * Each step records both endpoints' states and the segment on the wire, with sequence and acknowledgement numbers that follow the real rules (SYN and FIN each consume one sequence number).
 */
export function buildTcpSteps(x, y, n, variant) {
  const st = [];
  const add = o => st.push(o);
  add({
    title: 'Before anything is sent',
    c: 'CLOSED',
    s: 'LISTEN',
    text: 'The server has called listen() on its port. The client has no connection yet.',
  });
  if (variant === 'synlost') {
    add({
      dir: 'lr',
      lost: true,
      label: `SYN seq=${x}`,
      flags: 'SYN',
      seq: x,
      ack: 0,
      len: 0,
      c: 'SYN_SENT',
      s: 'LISTEN',
      text: 'The client sends SYN with its initial sequence number. The packet is lost on the way.',
    });
    add({
      mark: 'timeout 1 s',
      c: 'SYN_SENT',
      s: 'LISTEN',
      text: 'No SYN-ACK comes back. After the retransmission timer (initially 1 second) the client tries again. The timer doubles each time.',
    });
    add({
      dir: 'lr',
      label: `SYN seq=${x} (retry)`,
      flags: 'SYN',
      seq: x,
      ack: 0,
      len: 0,
      c: 'SYN_SENT',
      s: 'LISTEN',
      text: 'The retry reaches the server.',
    });
  } else
    add({
      dir: 'lr',
      label: `SYN seq=${x}`,
      flags: 'SYN',
      seq: x,
      ack: 0,
      len: 0,
      c: 'SYN_SENT',
      s: 'LISTEN',
      text: `The client picks an initial sequence number (${x}) and asks to open a connection. A SYN consumes one sequence number.`,
    });
  add({
    dir: 'rl',
    label: `SYN-ACK seq=${y} ack=${x + 1}`,
    flags: 'SYN, ACK',
    seq: y,
    ack: x + 1,
    len: 0,
    c: 'SYN_SENT',
    s: 'SYN_RCVD',
    text: `The server accepts, announces its own number (${y}) and acknowledges the client’s SYN by saying it expects ${x + 1} next.`,
  });
  add({
    dir: 'lr',
    label: `ACK seq=${x + 1} ack=${y + 1}`,
    flags: 'ACK',
    seq: x + 1,
    ack: y + 1,
    len: 0,
    c: 'ESTABLISHED',
    s: 'ESTABLISHED',
    text: `The client acknowledges the server’s SYN. Both sides are now ESTABLISHED and agree on both starting numbers.`,
    hs: true,
  });
  add({
    dir: 'lr',
    label: `DATA seq=${x + 1} len=${n}`,
    flags: 'PSH, ACK',
    seq: x + 1,
    ack: y + 1,
    len: n,
    c: 'ESTABLISHED',
    s: 'ESTABLISHED',
    text: `The client sends ${n} bytes. The sequence number is the number of the first byte in the segment.`,
  });
  add({
    dir: 'rl',
    label: `ACK ack=${x + 1 + n}`,
    flags: 'ACK',
    seq: y + 1,
    ack: x + 1 + n,
    len: 0,
    c: 'ESTABLISHED',
    s: 'ESTABLISHED',
    text: `The server acknowledges everything up to byte ${x + n}, so it expects ${x + 1 + n} next. The ACK number is “next byte I want”.`,
  });
  add({
    dir: 'lr',
    label: `FIN seq=${x + 1 + n}`,
    flags: 'FIN, ACK',
    seq: x + 1 + n,
    ack: y + 1,
    len: 0,
    c: 'FIN_WAIT_1',
    s: 'CLOSE_WAIT',
    text: 'The client has no more data and closes its sending direction. A FIN also consumes one sequence number.',
  });
  add({
    dir: 'rl',
    label: `ACK ack=${x + 2 + n}`,
    flags: 'ACK',
    seq: y + 1,
    ack: x + 2 + n,
    len: 0,
    c: 'FIN_WAIT_2',
    s: 'CLOSE_WAIT',
    text: 'The server acknowledges the FIN. The connection is now half-closed: the server may still send data.',
  });
  add({
    dir: 'rl',
    label: `FIN seq=${y + 1}`,
    flags: 'FIN, ACK',
    seq: y + 1,
    ack: x + 2 + n,
    len: 0,
    c: 'FIN_WAIT_2',
    s: 'LAST_ACK',
    text: 'The server finishes and sends its own FIN.',
  });
  add({
    dir: 'lr',
    label: `ACK ack=${y + 2}`,
    flags: 'ACK',
    seq: x + 2 + n,
    ack: y + 2,
    len: 0,
    c: 'TIME_WAIT',
    s: 'CLOSED',
    text: 'The client acknowledges the server’s FIN. The server can close at once. The client waits in TIME_WAIT in case this last ACK was lost.',
  });
  add({
    mark: '2×MSL wait',
    c: 'CLOSED',
    s: 'CLOSED',
    text: 'After twice the maximum segment lifetime (often 60 seconds) any stray packets from this connection have died, and the client closes.',
  });
  return st;
}

/**
 * One-line explanations of each TCP state (LISTEN, SYN_SENT, ESTABLISHED...).
 */
export const STATE_INFO = {
  CLOSED: 'No connection',
  LISTEN: 'Waiting for a SYN',
  SYN_SENT: 'SYN sent, waiting for SYN-ACK',
  SYN_RCVD: 'SYN received, SYN-ACK sent',
  ESTABLISHED: 'Data can flow both ways',
  FIN_WAIT_1: 'FIN sent',
  FIN_WAIT_2: 'FIN acknowledged, waiting for peer FIN',
  CLOSE_WAIT: 'Peer closed, we may still send',
  LAST_ACK: 'Our FIN sent, waiting for ACK',
  TIME_WAIT: 'Waiting for stray packets',
};
