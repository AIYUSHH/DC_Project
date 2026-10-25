/**
 * learning module: Challenges and checks
 *
 * Quizzes drawn from a question bank plus freshly generated calculations.
 *
 * This file registers one learning module with regMod(). Its mount(root) function builds the screen inside
 * `root` and attaches event handlers; the function mount() returns (if any) is its cleanup, called by the router
 * when the learner leaves, so timers and listeners do not outlive the screen. The protocol logic lives in
 * ../../simulations/ and ../../core/; this file is the user interface for it.
 *
 * Imports:
 *   - ../../core/encoding.js (bytes, hex, bits and UTF-8 helpers): bin8
 *   - ../../core/storage.js (saved progress (localStorage) and the shared P object): P
 *   - ../../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): panel, statRow, tbl, vd
 *   - ../../core/utils.js (tiny DOM, math and timing helpers): $, $$, esc
 *   - ../../simulations/framing.js (byte stuffing and bit stuffing (data-link framing)): bitStuff
 *   - ../registry.js (learning-module registry and group definitions): regMod
 *   - ../../app/progress.js (achievements, flags and statistics): setStat, stat
 *
 * Exports: (none)
 *
 * Used by: (imported only for its side effects by app.js)
 */

import { bin8 } from '../../core/encoding.js';
import { P } from '../../core/storage.js';
import { panel, statRow, tbl, vd } from '../../core/ui-helpers.js';
import { $, $$, esc } from '../../core/utils.js';
import { bitStuff } from '../../simulations/framing.js';
import { regMod } from '../registry.js';
import { setStat, stat } from '../../app/progress.js';

/**
 * Question bank: [topic, question, options, index of correct option, explanation, hint].
 */
const QBANK = [
  [
    'Encoding',
    'How many bytes does the character 世 need in UTF-8?',
    ['1', '2', '3', '4'],
    2,
    'Code points from U+0800 to U+FFFF use three bytes.',
    'Think about which range U+4E16 falls into.',
  ],
  [
    'Encoding',
    'Which statement about UTF-8 is true?',
    [
      'Every character is exactly 2 bytes',
      'ASCII characters use one byte',
      'It cannot represent emoji',
      'It is the same as UTF-16',
    ],
    1,
    'UTF-8 is backwards compatible with ASCII: the first 128 code points use one byte.',
    'It was designed to keep old text valid.',
  ],
  [
    'Framing',
    'Why does byte stuffing insert an escape byte?',
    [
      'To compress the data',
      'So a flag byte inside the data is not mistaken for a frame boundary',
      'To encrypt the frame',
      'To count the bytes',
    ],
    1,
    'Any data byte equal to the flag or escape is preceded by an escape so the receiver never sees a false flag.',
    'What would happen if 7E appeared in the data?',
  ],
  [
    'Framing',
    'In HDLC bit stuffing, after how many consecutive 1s is a 0 inserted?',
    ['Three', 'Four', 'Five', 'Six'],
    2,
    'The flag has six 1s, so after five 1s a 0 is forced in.',
    'The flag is 01111110.',
  ],
  [
    'Errors',
    'A single even-parity bit detects…',
    ['All errors', 'Any odd number of flipped bits', 'Only burst errors', 'No errors'],
    1,
    'Flipping two bits keeps the parity unchanged, so even numbers of flips go unnoticed.',
    'What does flipping two bits do to the count of 1s?',
  ],
  [
    'Errors',
    'Which check does Ethernet use for its frame check sequence?',
    ['Parity', 'Internet checksum', 'CRC-32', 'MD5'],
    2,
    'Ethernet uses a 32-bit cyclic redundancy check.',
    'It is the strongest check in this list that is cheap in hardware.',
  ],
  [
    'Errors',
    'Swapping two bytes in a message is NOT detected by…',
    ['A CRC', 'The Internet checksum', 'Both of them', 'Neither of them'],
    1,
    'Addition is commutative, so the sum is unchanged. A CRC depends on position and catches it.',
    'Does a sum care about order?',
  ],
  [
    'ARQ',
    'In Stop-and-Wait, why is a 1-bit sequence number enough?',
    [
      'Only one frame is outstanding at a time',
      'ACKs are never lost',
      'Frames cannot be duplicated',
      'The timer is very short',
    ],
    0,
    'With one frame in flight, the receiver only needs to tell “this frame” from “the previous one”.',
    'How many frames can be unacknowledged at once?',
  ],
  [
    'ARQ',
    'After a loss, Go-Back-N…',
    [
      'Resends only the lost frame',
      'Resends the lost frame and everything after it',
      'Drops the connection',
      'Doubles the window',
    ],
    1,
    'The receiver discards out-of-order frames, so the sender goes back and resends from the lost one.',
    'Think of the name.',
  ],
  [
    'ARQ',
    'With m-bit sequence numbers, the largest safe Selective Repeat window is…',
    ['2^m − 1', '2^m', '2^(m−1)', 'm'],
    2,
    'The sender and receiver windows must not overlap in sequence space, so each can be at most half of it.',
    'It is half the sequence space.',
  ],
  [
    'ARQ',
    'Long, fast links make Stop-and-Wait inefficient because…',
    [
      'Frames get corrupted',
      'The sender idles for a whole round trip per frame',
      'ACKs are too large',
      'The receiver is slow',
    ],
    1,
    'Utilisation is transmission time divided by transmission time plus a round trip.',
    'What is the sender doing while waiting for the ACK?',
  ],
  [
    'IP',
    'What does a router do to the TTL of a forwarded packet?',
    ['Doubles it', 'Leaves it alone', 'Decrements it by 1', 'Resets it to 64'],
    2,
    'TTL is decremented at every hop and the packet is dropped at 0, which stops loops.',
    'It counts down.',
  ],
  [
    'IP',
    'How many usable host addresses are in a /26 network?',
    ['30', '62', '64', '126'],
    1,
    '2^6 = 64 addresses minus the network and broadcast addresses leaves 62.',
    '32 − 26 = 6 host bits.',
  ],
  [
    'IP',
    'Which address is private?',
    ['8.8.8.8', '172.32.0.1', '172.20.5.9', '100.10.0.1'],
    2,
    '172.16.0.0/12 covers 172.16 to 172.31, so 172.20.5.9 is private. 172.32 is outside it.',
    'The private 172 range ends at 172.31.',
  ],
  [
    'IP',
    'Why must a router recompute the IPv4 header checksum at each hop?',
    ['The payload changes', 'The TTL changes', 'The source changes', 'The MAC changes'],
    1,
    'Lowering the TTL changes the header, so its checksum changes.',
    'Which header field changes at every router?',
  ],
  [
    'IP',
    'A packet is larger than the link MTU and DF is set. What happens?',
    [
      'It is fragmented',
      'It is dropped and an ICMP message is returned',
      'It is delayed',
      'The MTU grows',
    ],
    1,
    'DF forbids fragmentation, so the router drops it and replies “fragmentation needed”. Path MTU discovery relies on this.',
    'DF means Don’t Fragment.',
  ],
  [
    'Routing',
    'Two routes match a destination: /16 and /24. Which is used?',
    ['The /16', 'The /24', 'The one added first', 'Both'],
    1,
    'The longest matching prefix is the most specific route and wins.',
    'More specific beats less specific.',
  ],
  [
    'TCP',
    'Which flags are set in the second step of the TCP handshake?',
    ['SYN', 'SYN and ACK', 'ACK', 'FIN and ACK'],
    1,
    'The server replies SYN-ACK: its own SYN plus an acknowledgment of the client’s SYN.',
    'It does two jobs at once.',
  ],
  [
    'TCP',
    'A TCP segment with sequence number 1000 carries 500 bytes. What ACK number comes back?',
    ['1000', '1001', '1499', '1500'],
    3,
    'The ACK number is the next byte expected: 1000 + 500 = 1500.',
    'ACK means “send me this byte next”.',
  ],
  [
    'TCP',
    'When TCP detects loss by a timeout (not duplicate ACKs), the congestion window…',
    ['Halves', 'Doubles', 'Resets to 1 segment', 'Stays the same'],
    2,
    'A timeout signals severe congestion, so slow start restarts from one segment.',
    'Duplicate ACKs are the milder signal.',
  ],
  [
    'TCP',
    'What does the receive window tell the sender?',
    [
      'How fast the network is',
      'How much more data the receiver can buffer',
      'The round-trip time',
      'The MTU',
    ],
    1,
    'It is flow control: the receiver advertises its free buffer space.',
    'Who is being protected from overload?',
  ],
  [
    'TCP',
    'Why do live voice calls usually prefer UDP?',
    [
      'It is more secure',
      'Retransmitted old audio arrives too late to be useful',
      'It guarantees delivery',
      'It has bigger packets',
    ],
    1,
    'Real-time media would rather skip a lost packet than wait for a retransmission.',
    'Late data is useless in a live call.',
  ],
  [
    'DNS',
    'Which DNS record maps a name to an IPv6 address?',
    ['A', 'AAAA', 'MX', 'PTR'],
    1,
    'AAAA (“quad A”) holds a 128-bit address.',
    'IPv6 addresses are four times as long.',
  ],
  [
    'DNS',
    'What does NXDOMAIN mean?',
    [
      'The server is down',
      'The name does not exist',
      'The answer is cached',
      'The query was refused',
    ],
    1,
    'NXDOMAIN is the response code for a non-existent name.',
    'NX stands for non-existent.',
  ],
  [
    'DNS',
    'Why is a repeated DNS lookup often much faster?',
    [
      'DNS uses TCP',
      'The resolver cached the answer',
      'The root server was moved',
      'Names get shorter',
    ],
    1,
    'Resolvers keep answers until their TTL expires.',
    'What does TTL do on a DNS record?',
  ],
  [
    'HTTP',
    'Which status code means the resource moved permanently?',
    ['200', '301', '404', '500'],
    1,
    '301 Moved Permanently, with the new address in the Location header.',
    'It is in the 3xx class.',
  ],
  [
    'HTTP',
    'What does a 404 status mean?',
    ['Server error', 'Forbidden', 'Not found', 'Created'],
    2,
    '404 means the server could not find the requested resource.',
    'The 4xx class is client errors.',
  ],
  [
    'TLS',
    'Compared with TLS 1.2, a full TLS 1.3 handshake needs…',
    ['More round trips', 'One round trip', 'No encryption', 'No certificate'],
    1,
    'TLS 1.3 completes in one round trip because the client sends its key share in the first message.',
    'It was designed to be faster.',
  ],
  [
    'TLS',
    'What does the authentication tag in AES-GCM protect?',
    ['Secrecy only', 'Integrity of the message', 'The key', 'The IP address'],
    1,
    'The tag lets the receiver detect any modification of the ciphertext.',
    'Tamper with a bit and decryption fails.',
  ],
  [
    'NAT',
    'What does NAT rewrite on outgoing packets?',
    ['Only the MAC address', 'The source address and port', 'The TTL only', 'The payload'],
    1,
    'It maps private source addresses and ports to a public address and a unique port.',
    'It lets many hosts share one public address.',
  ],
  [
    'Sockets',
    'A server listens on port 443 and has 500 clients connected. How are connections told apart?',
    [
      'By different local ports',
      'By the combination of remote address and port',
      'By the TTL',
      'They cannot be told apart',
    ],
    1,
    'A connection is identified by the full tuple: protocol, local and remote address and port.',
    'The local port is the same for all of them.',
  ],
];

/**
 * Generates a fresh calculation question (parity bit, usable hosts, fragments, bit stuffing, TTL) with random numbers, so repeating the quiz never repeats the numbers.
 *
 * @returns {Array} a question in the same shape as QBANK entries.
 */
function genQuestion() {
  const k = Math.floor(Math.random() * 5),
    shuffle = (ans, wrong) => {
      const set = [String(ans)];
      wrong.forEach(w => {
        if (!set.includes(String(w))) set.push(String(w));
      });
      let g = 1;
      while (set.length < 4) set.push(String(+ans + g++ * 2));
      const o = set.slice(0, 4).sort(() => Math.random() - 0.5);
      return [o, o.indexOf(String(ans))];
    };
  if (k === 0) {
    const b = 16 + Math.floor(Math.random() * 224),
      ones = bin8(b).split('1').length - 1,
      ans = ones % 2;
    const [o, a] = shuffle(ans, [1 - ans, 2, 3]);
    return [
      'Errors',
      `What even-parity bit would you append to the byte ${bin8(b)}?`,
      o,
      a,
      `It has ${ones} ones. Even parity makes the total even, so the parity bit is ${ans}.`,
      'Count the 1s.',
    ];
  }
  if (k === 1) {
    const p = 20 + Math.floor(Math.random() * 10),
      ans = 2 ** (32 - p) - 2;
    const [o, a] = shuffle(ans, [2 ** (32 - p), 2 ** (31 - p) - 2, 2 ** (33 - p) - 2]);
    return [
      'IP',
      `How many usable host addresses does a /${p} network have?`,
      o,
      a,
      `32 − ${p} = ${32 - p} host bits gives ${2 ** (32 - p)} addresses, minus 2 reserved.`,
      'Subtract two from a power of two.',
    ];
  }
  if (k === 2) {
    const z = 2500 + Math.floor(Math.random() * 6) * 500,
      m = 1500,
      ans = Math.ceil((z - 20) / 1480);
    const [o, a] = shuffle(ans, [ans + 1, ans - 1, ans + 2]);
    return [
      'IP',
      `A ${z}-byte IPv4 packet crosses a link with a ${m}-byte MTU (DF off). How many fragments are produced?`,
      o,
      a,
      `Each fragment carries up to ${m - 20} data bytes (rounded down to a multiple of 8 = 1480). (${z} − 20) / 1480, rounded up, is ${ans}.`,
      'Remove the 20-byte header first.',
    ];
  }
  if (k === 3) {
    const bits = Array.from({ length: 12 }, () => (Math.random() < 0.6 ? '1' : '0')).join(''),
      st = bitStuff(bits),
      ans = st.length - bits.length;
    const [o, a] = shuffle(ans, [ans + 1, ans + 2, Math.max(0, ans - 1)]);
    return [
      'Framing',
      `Bit-stuff the data ${bits}. How many 0s are inserted?`,
      o,
      a,
      `The stuffed result is ${st}. A 0 follows every run of five 1s.`,
      'Scan left to right and count runs of five 1s.',
    ];
  }
  const ttl = 4 + Math.floor(Math.random() * 6),
    hops = ttl + 1 + Math.floor(Math.random() * 3),
    died = ttl;
  const [o, a] = shuffle(died, [died - 1, died + 1, hops]);
  return [
    'IP',
    `A packet starts with TTL ${ttl}. Counting routers from 1, which router drops it?`,
    o,
    a,
    `Each router subtracts 1, so the TTL reaches 0 at router ${died}.`,
    'The first router makes it TTL − 1.',
  ];
}

/* Register "Challenges and checks". The router calls mount(root) when the learner opens #/m/challenges and calls the returned function (if any) when they leave. */
regMod({
  id: 'challenges',
  group: 'learn',
  title: 'Challenges and checks',
  desc: 'Eight-question quizzes drawn from a bank of questions plus freshly generated calculations, with hints and explanations.',
  obj: [
    'Answer knowledge checks across every layer.',
    'Use hints sparingly: a hinted answer scores half.',
    'Review which topics need more work.',
  ],
  mount(root) {
    let qs = [],
      i = 0,
      pts = 0,
      answered = false,
      hinted = false,
      res = [];
    const start = () => {
      const bank = QBANK.slice()
          .sort(() => Math.random() - 0.5)
          .slice(0, 6),
        gen = [genQuestion(), genQuestion()];
      qs = [...bank, ...gen].sort(() => Math.random() - 0.5);
      i = 0;
      pts = 0;
      res = [];
      show();
    };
    const show = () => {
      if (i >= qs.length) {
        const c = res.filter(r => r.ok).length,
          pct = Math.round((c / qs.length) * 100);
        stat('quizRuns');
        if (pct > P.stats.quizBest) setStat('quizBest', pct);
        const tags = {};
        res.forEach(r => {
          tags[r.tag] = tags[r.tag] || [0, 0];
          tags[r.tag][1]++;
          if (r.ok) tags[r.tag][0]++;
        });
        root.innerHTML = panel(
          'Results',
          `<div class="quizq"><p class="big">${c} of ${qs.length} correct (${pct}%)</p></div>${statRow(
            [
              [pts + '/' + qs.length * 2, 'points (hints cost half)'],
              [P.stats.quizBest + '%', 'best score'],
              [P.stats.quizRuns, 'quizzes taken'],
            ]
          )}${tbl(
            ['Topic', 'Correct'],
            Object.entries(tags).map(([t, v]) => [t, v[0] + ' of ' + v[1]])
          )}
          ${pct >= 80 ? vd('ok', 'Excellent.', 'You unlocked the Quiz ace achievement.') : vd('info', 'Keep going.', 'Review the modules for the topics above and try again.')}<div class="btnrow"><button class="btn" id="qagain">New quiz</button></div>`
        );
        $('#qagain', root).onclick = start;
        return;
      }
      const q = qs[i];
      answered = false;
      hinted = false;
      root.innerHTML = panel(
        `Question ${i + 1} of ${qs.length}`,
        `<div class="bar"><i style="width:${(i / qs.length) * 100}%"></i></div><div class="quizq"><small class="tagc">${q[0]}</small><p class="big">${esc(q[1])}</p></div>
        <div class="opts" id="qo">${q[2].map((o, k) => `<button class="opt" data-k="${k}"><span>${'ABCD'[k]}</span>${esc(o)}</button>`).join('')}</div><div id="qfb"></div>
        <div class="btnrow"><button class="btn ghost sm" id="qh">Show hint</button><button class="btn ghost sm" id="qs">Skip</button></div>`
      );
      $('#qh', root).onclick = () => {
        hinted = true;
        $('#qfb', root).innerHTML = vd('info', 'Hint.', esc(q[5]));
      };
      $('#qs', root).onclick = () => {
        if (!answered) {
          res.push({ tag: q[0], ok: false });
          i++;
          show();
        }
      };
      $('#qo', root).onclick = e => {
        const b = e.target.closest('.opt');
        if (!b || answered) return;
        answered = true;
        const k = +b.dataset.k,
          ok = k === q[3];
        res.push({ tag: q[0], ok });
        if (ok) pts += hinted ? 1 : 2;
        $$('.opt', root).forEach((o, n) => {
          o.classList.toggle('right', n === q[3]);
          o.classList.toggle('wrong', n === k && !ok);
          o.disabled = true;
        });
        $('#qfb', root).innerHTML =
          (ok ? vd('ok', 'Correct.', esc(q[4])) : vd('bad', 'Not quite.', esc(q[4]))) +
          `<div class="btnrow"><button class="btn" id="qn">${i + 1 >= qs.length ? 'See results' : 'Next question'}</button></div>`;
        $('#qn', root).onclick = () => {
          i++;
          show();
        };
        $('#qn', root).focus();
      };
    };
    start();
  },
});
