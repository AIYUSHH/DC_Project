/**
 * learning module: Reference and glossary
 *
 * Searchable glossary, layered-model table, port and status-code tables and a subnet cheat sheet.
 *
 * This file registers one learning module with regMod(). Its mount(root) function builds the screen inside
 * `root` and attaches event handlers; the function mount() returns (if any) is its cleanup, called by the router
 * when the learner leaves, so timers and listeners do not outlive the screen. The protocol logic lives in
 * ../../simulations/ and ../../core/; this file is the user interface for it.
 *
 * Imports:
 *   - ../../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): icon, on, panel, tabset, tbl
 *   - ../../core/utils.js (tiny DOM, math and timing helpers): $, $$, REDUCE, esc, fmtN
 *   - ../../core/state.js (shared in-memory state): DC
 *   - ../../core/addressing.js (IPv4/IPv6 address and CIDR calculations): ip4, mk
 *   - ../registry.js (learning-module registry and group definitions): regMod
 *
 * Exports: (none)
 *
 * Used by: (imported only for its side effects by app.js)
 */

import { ip4, mk } from '../../core/addressing.js';
import { DC } from '../../core/state.js';
import { icon, on, panel, tabset, tbl } from '../../core/ui-helpers.js';
import { $, $$, esc, fmtN, REDUCE } from '../../core/utils.js';
import { regMod } from '../registry.js';

/**
 * Glossary entries: [term, layer, definition, related terms, module id to open].
 */
const GLOSS = [
  [
    'ACK',
    'Reliable',
    'A message confirming that data arrived. TCP uses cumulative ACK numbers that name the next byte expected.',
    ['Sequence number', 'Retransmission', 'Window'],
    'saw',
  ],
  [
    'ARP',
    'Link',
    'Address Resolution Protocol: asks “who has this IP address?” on the local network and learns the MAC address in reply.',
    ['MAC address', 'IP address'],
    'encap',
  ],
  [
    'Bandwidth',
    'Physical',
    'How many bits per second a link can carry. Not the same as latency, which is how long one bit takes.',
    ['Latency', 'RTT'],
    'saw',
  ],
  [
    'Bit stuffing',
    'Link',
    'Inserting a 0 after five consecutive 1s so the frame flag 01111110 can never appear inside data.',
    ['Byte stuffing', 'Frame'],
    'framing',
  ],
  [
    'Broadcast address',
    'Network',
    'The last address in a subnet, used to reach every host on that network at once.',
    ['Subnet mask', 'CIDR'],
    'subnets',
  ],
  [
    'Byte stuffing',
    'Link',
    'Preceding any data byte that looks like a flag with an escape byte so frame boundaries stay unambiguous.',
    ['Bit stuffing', 'Frame'],
    'framing',
  ],
  [
    'Checksum',
    'Link',
    'A small value computed from data so a receiver can detect corruption. The Internet checksum is a ones’-complement sum of 16-bit words.',
    ['CRC', 'Parity'],
    'errors',
  ],
  [
    'CIDR',
    'Network',
    'Classless Inter-Domain Routing: writing an address with its prefix length, such as 192.168.1.0/24.',
    ['Subnet mask', 'IP address'],
    'subnets',
  ],
  [
    'Congestion window',
    'Transport',
    'The sender’s own limit on unacknowledged data, grown and shrunk to avoid overloading the network.',
    ['Window', 'RTT'],
    'congestion',
  ],
  [
    'CRC',
    'Link',
    'Cyclic redundancy check: treats data as a polynomial, divides it by a fixed one and sends the remainder. Detects all short bursts and most random errors.',
    ['Checksum', 'Parity'],
    'errors',
  ],
  [
    'Datagram',
    'Network',
    'A self-contained packet sent without a connection, such as a UDP datagram.',
    ['UDP', 'Packet'],
    'tcpudp',
  ],
  [
    'Default gateway',
    'Network',
    'The router a host sends traffic to when the destination is outside its own subnet.',
    ['Router', 'Subnet mask'],
    'routing',
  ],
  [
    'DHCP',
    'Application',
    'Dynamic Host Configuration Protocol: hands out an address, mask, gateway and DNS server to hosts automatically.',
    ['IP address', 'DNS'],
    'trouble',
  ],
  [
    'DNS',
    'Application',
    'The Domain Name System: a distributed database that maps names to addresses and other records.',
    ['Resolver', 'TTL'],
    'dns',
  ],
  [
    'Encapsulation',
    'All',
    'Wrapping data with a header (and sometimes a trailer) at each layer on the way down, and removing them on the way up.',
    ['Header', 'Payload'],
    'encap',
  ],
  [
    'Ethernet',
    'Link',
    'The dominant wired LAN technology. Frames carry MAC addresses, an EtherType and a CRC-32 trailer.',
    ['Frame', 'MAC address'],
    'encap',
  ],
  [
    'Fragmentation',
    'Network',
    'Splitting an IP packet into smaller pieces to fit a link’s MTU. The receiver reassembles by offset.',
    ['MTU', 'IP address'],
    'ipheaders',
  ],
  [
    'Frame',
    'Link',
    'The unit of data at the link layer: a packet plus a header and trailer.',
    ['Packet', 'Ethernet'],
    'framing',
  ],
  [
    'Go-Back-N',
    'Reliable',
    'A sliding-window protocol where the receiver accepts only in-order frames and the sender resends from the first lost one.',
    ['Selective Repeat', 'Window'],
    'window',
  ],
  [
    'Handshake',
    'Transport',
    'The exchange that opens a connection. TCP uses SYN, SYN-ACK, ACK to agree on starting sequence numbers.',
    ['TCP', 'Sequence number'],
    'handshake',
  ],
  [
    'Header',
    'All',
    'Control information a layer adds in front of its payload.',
    ['Payload', 'Encapsulation'],
    'encap',
  ],
  [
    'HTTP',
    'Application',
    'The request and response protocol of the web, carried over TCP, TLS or QUIC.',
    ['TLS', 'Socket'],
    'http',
  ],
  [
    'ICMP',
    'Network',
    'Internet Control Message Protocol: error and diagnostic messages such as echo reply (ping) and time exceeded.',
    ['TTL', 'Router'],
    'ipheaders',
  ],
  [
    'IP address',
    'Network',
    'A number that identifies a host’s network attachment: 32 bits in IPv4, 128 bits in IPv6.',
    ['CIDR', 'Subnet mask'],
    'subnets',
  ],
  [
    'Latency',
    'Physical',
    'The time for data to cross a link or path, from propagation, queueing and processing.',
    ['RTT', 'Bandwidth'],
    'saw',
  ],
  [
    'MAC address',
    'Link',
    'A 48-bit hardware address that identifies a network interface on a local link.',
    ['Ethernet', 'ARP'],
    'encap',
  ],
  [
    'MSS',
    'Transport',
    'Maximum segment size: the largest TCP payload a peer will accept, usually MTU minus 40 bytes.',
    ['MTU', 'Segment'],
    'capture',
  ],
  [
    'MTU',
    'Link',
    'Maximum transmission unit: the largest packet a link can carry, 1500 bytes for Ethernet.',
    ['Fragmentation', 'MSS'],
    'ipheaders',
  ],
  [
    'NAT',
    'Network',
    'Network address translation: rewrites private addresses and ports to a shared public address.',
    ['Port', 'IP address'],
    'sockets',
  ],
  [
    'Packet',
    'Network',
    'The unit of data at the network layer, with a header and a payload.',
    ['Frame', 'Segment'],
    'ipheaders',
  ],
  [
    'Parity',
    'Link',
    'An extra bit that makes the count of 1s even (or odd). Detects any odd number of flips.',
    ['Checksum', 'CRC'],
    'errors',
  ],
  [
    'Payload',
    'All',
    'The data a layer carries, excluding its own header.',
    ['Header', 'Encapsulation'],
    'encap',
  ],
  [
    'Port',
    'Transport',
    'A 16-bit number that identifies an application or service on a host.',
    ['Socket', 'NAT'],
    'sockets',
  ],
  [
    'Protocol',
    'All',
    'A set of rules for formatting and exchanging messages.',
    ['Header', 'Handshake'],
    'tcpudp',
  ],
  [
    'QUIC',
    'Transport',
    'A UDP-based transport that merges the transport and TLS handshakes and carries HTTP/3.',
    ['UDP', 'TLS'],
    'http',
  ],
  [
    'Resolver',
    'Application',
    'The DNS server a host asks, which does the work of finding the answer and caches it.',
    ['DNS', 'TTL'],
    'dns',
  ],
  [
    'Retransmission',
    'Reliable',
    'Sending data again because it was lost, usually after a timer expires or duplicate ACKs arrive.',
    ['ACK', 'RTO'],
    'saw',
  ],
  [
    'Router',
    'Network',
    'A device that forwards packets between networks using a forwarding table.',
    ['Default gateway', 'TTL'],
    'routing',
  ],
  [
    'RTO',
    'Transport',
    'Retransmission timeout: how long TCP waits for an ACK before resending.',
    ['RTT', 'Retransmission'],
    'congestion',
  ],
  [
    'RTT',
    'Transport',
    'Round-trip time: how long a message takes to reach the peer and for the reply to return.',
    ['Latency', 'RTO'],
    'congestion',
  ],
  [
    'Segment',
    'Transport',
    'A TCP unit of data: a header plus a slice of the byte stream.',
    ['TCP', 'Packet'],
    'tcpudp',
  ],
  [
    'Selective Repeat',
    'Reliable',
    'A sliding-window protocol where the receiver buffers out-of-order frames and only lost ones are resent.',
    ['Go-Back-N', 'Window'],
    'window',
  ],
  [
    'Sequence number',
    'Reliable',
    'A number on each frame or byte that lets the receiver order data and spot duplicates.',
    ['ACK', 'Window'],
    'handshake',
  ],
  [
    'Socket',
    'Transport',
    'One endpoint of a conversation, identified by protocol, address and port.',
    ['Port', 'TCP'],
    'sockets',
  ],
  [
    'Stop-and-Wait',
    'Reliable',
    'The simplest ARQ protocol: send one frame, wait for its ACK.',
    ['ACK', 'Window'],
    'saw',
  ],
  [
    'Subnet mask',
    'Network',
    'A 32-bit pattern whose 1s mark the network part of an address.',
    ['CIDR', 'IP address'],
    'subnets',
  ],
  [
    'TCP',
    'Transport',
    'Transmission Control Protocol: a reliable, ordered byte stream with flow and congestion control.',
    ['UDP', 'Handshake'],
    'tcpudp',
  ],
  [
    'TLS',
    'Application',
    'Transport Layer Security: authenticates the server and encrypts the connection.',
    ['HTTP', 'Handshake'],
    'http',
  ],
  [
    'TTL',
    'Network',
    'Time to live: a hop budget lowered by each router. At 0 the packet is dropped. In DNS, TTL is how long an answer may be cached.',
    ['Router', 'ICMP'],
    'ipheaders',
  ],
  [
    'UDP',
    'Transport',
    'User Datagram Protocol: connectionless and unreliable, with an 8-byte header.',
    ['TCP', 'Datagram'],
    'tcpudp',
  ],
  [
    'UTF-8',
    'Presentation',
    'A variable-length encoding of Unicode using one to four bytes per character.',
    ['Payload'],
    'journey',
  ],
  [
    'Window',
    'Reliable',
    'The amount of data allowed in flight and not yet acknowledged.',
    ['Congestion window', 'ACK'],
    'window',
  ],
];

/**
 * Well-known ports: [port, transport, service].
 */
const PORTS = [
  [20, 'TCP', 'FTP data'],
  [21, 'TCP', 'FTP control'],
  [22, 'TCP', 'SSH'],
  [25, 'TCP', 'SMTP (mail submission)'],
  [53, 'UDP/TCP', 'DNS'],
  [67, 'UDP', 'DHCP server'],
  [80, 'TCP', 'HTTP'],
  [110, 'TCP', 'POP3'],
  [123, 'UDP', 'NTP (time)'],
  [143, 'TCP', 'IMAP'],
  [443, 'TCP/UDP', 'HTTPS and HTTP/3'],
  [993, 'TCP', 'IMAP over TLS'],
  [3389, 'TCP', 'Remote Desktop'],
];

/**
 * Common HTTP status codes: [code, meaning].
 */
const CODES = [
  [100, 'Continue'],
  [200, 'OK'],
  [201, 'Created'],
  [204, 'No Content'],
  [301, 'Moved Permanently'],
  [302, 'Found (temporary redirect)'],
  [304, 'Not Modified'],
  [400, 'Bad Request'],
  [401, 'Unauthorized'],
  [403, 'Forbidden'],
  [404, 'Not Found'],
  [405, 'Method Not Allowed'],
  [418, 'I’m a teapot'],
  [429, 'Too Many Requests'],
  [500, 'Internal Server Error'],
  [502, 'Bad Gateway'],
  [503, 'Service Unavailable'],
  [504, 'Gateway Timeout'],
];

/* Register "Reference and glossary". The router calls mount(root) when the learner opens #/m/glossary and calls the returned function (if any) when they leave. */
regMod({
  id: 'glossary',
  group: 'learn',
  title: 'Reference and glossary',
  desc: 'Look up terms, ports, status codes, the layered models and a subnet cheat sheet.',
  obj: [
    'Find a term fast and jump to related concepts.',
    'Compare the OSI and TCP/IP models.',
    'Keep the common ports and status codes handy.',
  ],
  mount(root) {
    root.innerHTML = '<div id="gltabs"></div>';
    const tabs = tabset(
      $('#gltabs', root),
      [
        {
          label: 'Glossary',
          render(p) {
            const layers = ['All', ...new Set(GLOSS.map(g => g[1]))].filter(
              x => x !== 'All' || true
            );
            let layer = 'All',
              open = null;
            p.innerHTML = panel(
              'Search the glossary',
              `<div class="search-row">${icon('search')}<input id="gq" type="search" placeholder="Search terms: ACK, CRC, TTL, MSS…" aria-label="Search glossary" value="${esc(DC.glossQ || '')}"></div>
          <div class="filters" id="gl">${layers.map(l => `<button class="chipbtn${l === 'All' ? ' on' : ''}" data-l="${l}">${l}</button>`).join('')}</div><p class="hint" id="gcount"></p><div id="gdet"></div><div class="dgrid" id="gg"></div>`
            );
            DC.glossQ = '';
            const f = () => {
              const q = $('#gq', p).value.trim().toLowerCase(),
                list = GLOSS.filter(
                  g =>
                    (layer === 'All' || g[1] === layer) &&
                    (!q || (g[0] + ' ' + g[2]).toLowerCase().includes(q))
                );
              $('#gcount', p).textContent = `${list.length} of ${GLOSS.length} terms`;
              $('#gg', p).innerHTML =
                list
                  .map(
                    g =>
                      `<button class="mc gterm${open === g[0] ? ' open' : ''}" data-t="${esc(g[0])}"><span class="pill">${g[1]}</span><h3>${g[0]}</h3><p>${esc(g[2].length > 90 ? g[2].slice(0, 87) + '…' : g[2])}</p></button>`
                  )
                  .join('') || '<p class="hint">No terms match.</p>';
              const t = GLOSS.find(g => g[0] === open);
              $('#gdet', p).innerHTML = t
                ? `<div class="panel detail"><h3>${t[0]} <span class="pill">${t[1]}</span></h3><p>${esc(t[2])}</p><div class="chips">${t[3].map(r => `<button class="chipbtn" data-t="${esc(r)}">${r}</button>`).join('')}${t[4] ? `<a class="btn sm" href="#/m/${t[4]}">Open related module →</a>` : ''}</div></div>`
                : '';
            };
            $('#gq', p).oninput = () => {
              open = null;
              f();
            };
            $('#gl', p).onclick = e => {
              const b = e.target.closest('[data-l]');
              if (!b) return;
              layer = b.dataset.l;
              $$('#gl .chipbtn', p).forEach(x => x.classList.toggle('on', x === b));
              f();
            };
            on(p, 'click', '[data-t]', (e, b) => {
              open = b.dataset.t;
              $('#gq', p).value = '';
              layer = 'All';
              $$('#gl .chipbtn', p).forEach(x => x.classList.toggle('on', x.dataset.l === 'All'));
              f();
              window.scrollTo({ top: 0, behavior: REDUCE ? 'auto' : 'smooth' });
            });
            const q0 = $('#gq', p).value.toLowerCase().trim();
            if (q0) {
              const exact = GLOSS.find(g => g[0].toLowerCase() === q0);
              if (exact) open = exact[0];
            }
            f();
          },
        },
        {
          label: 'Layered models',
          render(p) {
            p.innerHTML = panel(
              'OSI and TCP/IP',
              tbl(
                ['OSI layer', 'TCP/IP layer', 'Unit', 'Examples', 'Where in this lab'],
                [
                  [
                    '7 Application',
                    'Application',
                    'message',
                    'HTTP, DNS, SMTP',
                    'DNS, HTTP and TLS',
                  ],
                  [
                    '6 Presentation',
                    'Application',
                    'message',
                    'UTF-8, TLS encryption',
                    'Message & Encoding',
                  ],
                  [
                    '5 Session',
                    'Application',
                    'message',
                    'TLS sessions, sockets',
                    'Sockets and multiplexing',
                  ],
                  [
                    '4 Transport',
                    'Transport',
                    'segment / datagram',
                    'TCP, UDP, QUIC',
                    'TCP and UDP, Handshake, Congestion',
                  ],
                  [
                    '3 Network',
                    'Internet',
                    'packet',
                    'IP, ICMP, routing',
                    'Subnets, IP headers, Routing',
                  ],
                  [
                    '2 Data link',
                    'Link',
                    'frame',
                    'Ethernet, Wi-Fi',
                    'Framing, Error detection, ARQ',
                  ],
                  ['1 Physical', 'Link', 'bit', 'Copper, fibre, radio', 'Transmission Lab'],
                ]
              ),
              'The OSI model has seven layers and is mostly used for teaching. The Internet is built on the four-layer TCP/IP model.'
            );
          },
        },
        {
          label: 'Ports and status codes',
          render(p) {
            p.innerHTML = `<div class="cols2"><div class="panel"><h3>Well-known ports</h3>${tbl(['Port', 'Protocol', 'Service'], PORTS)}</div><div class="panel"><h3>HTTP status codes</h3><div class="search-row">${icon('search')}<input id="sq" type="search" placeholder="Filter: 404, redirect, error…" aria-label="Filter status codes"></div><div id="sc"></div></div></div>`;
            const f = () => {
              const q = $('#sq', p).value.toLowerCase();
              $('#sc', p).innerHTML = tbl(
                ['Code', 'Meaning'],
                CODES.filter(
                  c =>
                    !q ||
                    (c[0] + ' ' + c[1]).toLowerCase().includes(q) ||
                    (q === 'error' && c[0] >= 400) ||
                    (q === 'redirect' && c[0] >= 300 && c[0] < 400)
                )
              );
            };
            $('#sq', p).oninput = f;
            f();
          },
        },
        {
          label: 'Subnet cheat sheet',
          render(p) {
            const rows = [];
            for (let pl = 16; pl <= 30; pl++)
              rows.push([
                `/${pl}`,
                ip4(mk(pl)),
                fmtN(2 ** (32 - pl)),
                fmtN(2 ** (32 - pl) - 2),
                pl >= 24 ? `${256 / 2 ** (32 - pl)} per /24` : `${2 ** (24 - pl)} × /24`,
              ]);
            p.innerHTML = panel(
              'Prefix lengths',
              tbl(['Prefix', 'Mask', 'Addresses', 'Usable hosts', 'Size'], rows),
              'Each extra prefix bit halves the block. Subtract 2 from the address count for the network and broadcast addresses.'
            );
          },
        },
      ],
      0
    );
    return () => tabs.destroy();
  },
});
