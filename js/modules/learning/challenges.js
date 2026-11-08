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

const LEVELS = ['Beginner','Intermediate','Advanced','Expert','Master'];
const LEVEL_BANKS = {
2: [['Subnetting','A /27 subnet is carved from a /24. How many /27 subnets fit?',['4','8','16','32'],1,'Three extra network bits give 2^3 = 8 subnets.','Compare prefix lengths.'],['TCP','A 12,000-byte congestion window uses 1,200-byte MSS. How many full segments fit?',['8','9','10','12'],2,'12,000 / 1,200 = 10 segments.','Divide window by MSS.'],['Routing','Routes /8, /16 and /21 match 10.4.9.7. Which wins?',['/8','/16','/21','None'],2,'The /21 is the most specific matching route.','Use longest-prefix matching.'],['DNS','A 900-second TTL was cached 240 seconds ago. How long remains?',['240 s','660 s','900 s','1,140 s'],1,'900 − 240 = 660 seconds remain.','Subtract elapsed time.'],['Errors','A CRC generator has degree 4. How many zero bits are appended?',['2','3','4','5'],2,'CRC appends r zeros where r is the generator degree.','Use polynomial degree.'],['HTTP','Repeating the same PUT request should be…',['Non-repeatable','Idempotent','A GET','A new resource each time'],1,'PUT is idempotent: repetition has the same intended effect.','Think about repeating an operation.']],
3: [['Subnetting','You need at least 50 usable hosts. Which smallest prefix works?',['/25','/26','/27','/28'],1,'/26 provides 62 usable addresses; /27 provides 30.','Find the smallest host-bit count.'],['TCP','A flow has 24 MSS in flight. After timeout, what is the usual new ssthresh?',['6 MSS','8 MSS','12 MSS','16 MSS'],2,'ssthresh is commonly half the flight size: 12 MSS.','Use half the flight size.'],['IP','A 4,000-byte IPv4 datagram crosses a 1,500-byte MTU with a 20-byte header. How many fragments?',['2','3','4','5'],1,'Each full fragment carries 1,480 data bytes; ceil(3,980 / 1,480) = 3.','Remove header, then round up.'],['ARQ','Selective Repeat uses 5-bit sequence numbers. Maximum sender window?',['15','16','31','32'],1,'Sequence space is 32; maximum window is half, or 16.','Use half the sequence space.'],['Routing','Which algorithm computes shortest paths in link-state routing?',['Bellman-Ford','Dijkstra','CRC division','Handshake'],1,'Link-state routers run Dijkstra over their topology database.','The router has a full topology view.'],['Performance','A 10-Mbit/s path has 80 ms RTT. What is its bandwidth-delay product?',['10 kB','50 kB','100 kB','800 kB'],2,'10,000,000 × 0.08 = 800,000 bits = 100 kB.','Multiply rate by RTT and convert bits to bytes.']],
4: [['Errors','The CRC polynomial x^3 + x + 1 is represented by…',['1011','1101','1110','1001'],0,'Coefficients from x^3 through x^0 are 1,0,1,1.','Write coefficients highest power first.'],['Routing','What does ECMP allow when routes have equal cost?',['Always choose first','Use multiple next hops','Merge packets','Disable prefix matching'],1,'Equal-Cost Multi-Path permits multiple equal-cost next hops.','The name describes the choice.'],['TLS','TLS 1.3 application traffic keys are derived from…',['Certificate private key','Traffic secrets from handshake secrets','DNS secret','TCP sequence number'],1,'TLS derives directional traffic secrets from the handshake secret.','Separate identity keys from traffic keys.'],['Performance','A path has 2% packet loss. What is the simple delivery ratio?',['2%','50%','98%','102%'],2,'Delivery ratio is 100% − 2% = 98%.','Subtract loss from 100%.'],['Subnetting','VLSM needs 100, 50 and 20 hosts. Which block sizes fit?',['/26,/27,/28','/25,/26,/27','/24,/25,/26','/25,/25,/26'],1,'The smallest fitting blocks are /25, /26 and /27.','Round each host requirement up.'],['TCP','A sender has 10 MSS in flight and gets three duplicate ACKs. Reno ssthresh?',['3 MSS','5 MSS','8 MSS','13 MSS'],1,'Reno sets ssthresh to about half the flight size: 5 MSS.','Fast retransmit halves flight size.']],
5: [['Network design','Six VLANs each need 90 usable hosts. Smallest aligned aggregate for six /25s?',['/24','/23','/22','/21'],2,'Six /25s need 768 addresses; the next aligned aggregate is /22.','Each VLAN needs /25.'],['TCP','A 1-Gbit/s path has 40 ms RTT. What receive window fills the path?',['500 kB','2 MB','5 MB','40 MB'],2,'1 Gbit/s × 0.04 s = 40 Mbit = 5 MB.','Use bandwidth-delay product.'],['Security','A certificate chain is valid but hostname verification is skipped. What risk remains?',['TCP retransmission','A certificate for another hostname may be accepted','DNS cache stops','Cipher becomes plaintext'],1,'Chain validation does not prove the certificate belongs to the requested hostname.','Trust chain and hostname identity are separate.'],['IP','Which IPv4 mechanism bounds packet lifetime in a routing loop?',['Window scaling','TTL decrement and expiry','DNS TTL','TCP ACK number'],1,'Routers decrement IPv4 TTL and discard at zero.','Distinguish IP TTL from DNS TTL.'],['Performance','A 200-Mbit/s link has 50 ms RTT and a 2-MB receive window. What limits throughput?',['Window at 320 Mbit/s','Link at 200 Mbit/s','RTT at 50 Mbit/s','Window at 32 Mbit/s'],1,'The window allows about 320 Mbit/s, so the link is the bottleneck.','Compare window/RTT with link rate.'],['IP','A 3,000-byte IPv4 datagram with 20-byte header crosses a 1,000-byte MTU. How many fragments?',['2','3','4','5'],2,'Each non-final fragment carries 976 bytes; 2,980 bytes require 4 fragments.','Use the largest multiple of eight below 980.']]
};
function tierQuestion(level) {
  const pick=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
  const make=(v,wrong)=>{const o=[String(v),...wrong.map(String)].sort(()=>Math.random()-0.5);return [o,o.indexOf(String(v))];};
  if(level===2){const p=pick(20,29),v=2**(32-p)-2,[o,a]=make(v,[v+2,v-2,v*2]);return ['Subnetting','A /'+p+' network has how many usable IPv4 hosts?',o,a,'There are '+(32-p)+' host bits: 2^'+(32-p)+' − 2 = '+v+'.','Count host bits and reserve network and broadcast addresses.'];}
  if(level===3){const rate=pick(20,100)*10,rtt=pick(20,100),v=Math.round(rate*1000*rtt/8/1000),[o,a]=make(v,[v/2,v+10,v*2]);return ['Performance','A '+rate+'-Mbit/s path has '+rtt+' ms RTT. What is its bandwidth-delay product in kB?',o,a,'Rate × RTT gives '+v+' kB after converting bits to bytes.','Multiply bit rate by RTT, then convert to bytes.'];}
  if(level===4){const size=pick(3000,9000),v=Math.ceil((size-20)/1480),[o,a]=make(v,[v+1,v-1,v+2]);return ['IP','A '+size+'-byte IPv4 datagram crosses a 1,500-byte MTU. How many fragments?',o,a,'Each full fragment carries 1,480 data bytes; ceil(('+size+' − 20) / 1480) = '+v+'.','Subtract the header and round up.'];}
  const mss=pick(900,1500),cwnd=pick(8,30),rtt=pick(10,100),link=pick(50,500),v=Math.min(link,Math.round(cwnd*mss*8/rtt/1000)),[o,a]=make(v,[Math.max(1,v-5),v+5,v*2]);return ['TCP','A flow has '+cwnd+' MSS of '+mss+' bytes, RTT '+rtt+' ms and a '+link+'-Mbit/s link. Approximate throughput in Mbit/s?',o,a,'Window/RTT gives '+Math.round(cwnd*mss*8/rtt/1000)+' Mbit/s; cap it at the link rate.','Calculate window bytes × 8 / RTT, then compare with link rate.'];
}
/**
 * Generates a fresh calculation question (parity bit, usable hosts, fragments, bit stuffing, TTL) with random numbers, so repeating the quiz never repeats the numbers.
 *
 * @returns {Array} a question in the same shape as QBANK entries.
 */
function genQuestion(level = 1) {
  if (level > 1) return tierQuestion(level);
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
    let qs = [], i = 0, pts = 0, answered = false, hinted = false, res = [], level = Math.max(1, Math.min(5, Number(P.stats.quizLevel) || 1));
    const shuffle = items => { const copy=items.slice(); for(let n=copy.length-1;n>0;n--){const j=Math.floor(Math.random()*(n+1));[copy[n],copy[j]]=[copy[j],copy[n]];} return copy; };
    const start = () => {
      const tier = level === 1 ? QBANK : (LEVEL_BANKS[level] || QBANK);
      const bank = shuffle(tier).slice(0, 6);
      qs = shuffle([...bank, genQuestion(level), genQuestion(level)]);
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
        const passed=pct>=70, completedLevel=level, nextLevel=passed?Math.min(5,level+1):level;
        if(nextLevel>(Number(P.stats.quizLevel)||1)) setStat('quizLevel',nextLevel);
        if(nextLevel>(Number(P.stats.quizHighestLevel)||1)) setStat('quizHighestLevel',nextLevel);
        level = nextLevel;
        const history=Array.isArray(P.stats.quizHistory)?P.stats.quizHistory.slice(0,7):[];
        history.unshift({level:completedLevel,score:pct,points:pts,ts:Date.now()}); setStat('quizHistory',history.slice(0,8));
        const tags = {};
        res.forEach(r => {
          tags[r.tag] = tags[r.tag] || [0, 0];
          tags[r.tag][1]++;
          if (r.ok) tags[r.tag][0]++;
        });
        root.innerHTML = panel(
          'Quiz results',
          `<div class="quizq"><small class="tagc">${LEVELS[completedLevel-1]} · Level ${completedLevel}</small><p class="big">${c} of ${qs.length} correct (${pct}%)</p><p>${passed ? (completedLevel < 5 ? 'Level passed — next level unlocked.' : 'Master level cleared — highest tier reached.') : 'Level not passed. Score at least 70% to unlock the next level.'}</p></div>${statRow([[pts + '/' + qs.length * 2, 'points (hints cost half)'],[P.stats.quizBest + '%', 'all-time best'],[P.stats.quizRuns, 'quizzes taken'],[Math.max(1,Number(P.stats.quizHighestLevel)||1)+'/5', 'highest level unlocked']])}<div class="quizq"><b>Difficulty progress</b><div class="bar"><i style="width:${(Math.max(1,Number(P.stats.quizHighestLevel)||1)/5)*100}%"></i></div><small>Next: ${LEVELS[nextLevel-1]}</small></div>${tbl(['Topic','Correct'],Object.entries(tags).map(([t,v])=>[t,v[0]+' of '+v[1]]))}${tbl(['Recent level','Score'],history.slice(0,5).map(run=>[LEVELS[Math.max(1,Math.min(5,run.level))-1],run.score+'%']))}${passed ? vd('ok','Well done.','Your performance unlocked the next step.') : vd('info','Keep practising.','Review the topic breakdown and retry this level.')}<div class="btnrow"><button class="btn" id="qagain">${passed && completedLevel < 5 ? 'Start next level' : 'Retry level'}</button></div>`
        );
        $('#qagain', root).onclick = start;
        return;
      }
      const q = qs[i];
      answered = false;
      hinted = false;
      root.innerHTML = panel(
        `Question ${i + 1} of ${qs.length}`,
        `<div class="quizq"><small class="tagc">Level ${level} · ${esc(LEVELS[level-1])} · Question ${i+1}/${qs.length}</small><div class="bar"><i style="width:${(i / qs.length) * 100}%"></i></div><small class="tagc">${q[0]}</small><p class="big">${esc(q[1])}</p></div>
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
