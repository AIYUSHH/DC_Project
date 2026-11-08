/**
 * game data: zones, per-module metadata, 20-second "Watch" scenes and 5-question quizzes.
 * The simulators themselves are untouched (js/modules/*); this file only describes how they are presented.
 * Quiz strings are "question|correct answer|wrong|wrong", ordered Easy, Easy, Medium, Medium, Hard.
 * Watch scenes: n = nodes ("emoji|label"), s = steps [node index the packet moves to, packet label, caption].
 */

export const ZONES = [
  { id: 'link', name: 'Link', e: '🔗', l: '#bfe3ff', d: '#2f8cff', blurb: 'Frames, errors and reliable delivery' },
  { id: 'network', name: 'Network', e: '🌐', l: '#ffd1e1', d: '#ec4f9c', blurb: 'Interfaces, addresses, neighbours and routes' },
  { id: 'transport', name: 'Transport', e: '🚚', l: '#d4f5cf', d: '#21b573', blurb: 'TCP, UDP, ports and congestion' },
  { id: 'application', name: 'Application', e: '💬', l: '#ffe0c2', d: '#f2a30a', blurb: 'DNS, HTTP and TLS' },
  { id: 'security', name: 'Security', e: '🛡️', l: '#e3dcff', d: '#8a5cff', blurb: 'Encryption, firewalls, captures' },
];

/** Modules without a quiz (reference and learning tools): shown in the Toolbox as free play. */
export const TOOLS = ['journey', 'tutorials', 'challenges', 'protocolcompare', 'glossary'];

export const META = {
  framing: { z: 'link', d: 'Easy', e: '📦',
    w: { n: ['💻|Sender', '🔌|Link', '🖥️|Receiver'], s: [[1, '7E…7E', 'Flag bytes mark where a frame starts and ends.'], [1, '7E 7D 5E', 'If the data contains a flag, an escape byte is added: byte stuffing.'], [2, 'DATA', 'The receiver removes the escapes and gets the exact data back.']] },
    q: ['Why do networks use framing?|To mark where one frame ends and the next begins|To make data smaller|To encrypt data', 'What does a flag byte do?|Marks a frame boundary|Counts the errors|Chooses the route', 'Why is byte stuffing needed?|The data itself may contain a flag byte|To speed up the link|To hide the data', 'In bit stuffing, after five 1s in a row the sender inserts a…|0|1|Flag', 'With length-count framing, what if the length field is corrupted?|The receiver loses the frame boundaries|Nothing, it self-corrects|The frame is resent automatically'] },
  errors: { z: 'link', d: 'Medium', e: '🧮',
    w: { n: ['✉️|Sender', '〰️|Wire', '📬|Receiver'], s: [[1, '1011·1', 'Sender adds a parity bit so the count of 1s is even.'], [1, '1001·1', 'Zap! One bit flips on the wire.'], [2, '1001·1', 'Receiver counts the 1s: odd, so an error is found! 🚨']] },
    q: ['What does an error-detecting code do?|Lets the receiver notice corrupted bits|Prevents all noise|Encrypts the frame', 'Even parity means the number of 1s is…|Even|Odd|Zero', 'Which check is much stronger than one parity bit?|CRC|A second flag|A longer cable', 'Hamming codes can…|Correct a single-bit error|Only detect errors|Encrypt data', 'Two bits flip in one byte. Does single parity notice?|No, it misses it|Always|It repairs them'] },
  saw: { z: 'link', d: 'Easy', e: '⏱️',
    w: { n: ['💻|Sender', '🖥️|Receiver'], s: [[1, 'F0', 'Sender sends frame 0 and starts a timer.'], [0, 'ACK', 'The receiver replies with an ACK.'], [1, 'F1', 'Only now does the next frame go out.']] },
    q: ['In Stop-and-Wait the sender sends the next frame after…|Receiving an ACK|Sending ten frames|A random delay', 'What starts when a frame is sent?|A retransmission timer|An encryption key|A DNS query', 'If the timer expires with no ACK, the sender…|Retransmits the frame|Gives up silently|Sends the next frame', 'Why is Stop-and-Wait slow on long links?|The sender idles waiting for each ACK|Frames are too big|ACKs are encrypted', 'Why does it need sequence numbers?|To tell a retransmission from a new frame|To count bytes|To choose the route'] },
  window: { z: 'link', d: 'Hard', e: '🪟',
    w: { n: ['💻|Sender', '🖥️|Receiver'], s: [[1, 'F0 F1 F2', 'Sender sends a whole window of frames without waiting.'], [0, 'ACK 2', 'Cumulative ACKs slide the window forward.'], [1, 'F3 F4', 'The window moves and new frames go out.']] },
    q: ['A sliding window allows…|Several frames in flight before an ACK|Only one frame at a time|No ACKs at all', 'Go-Back-N, on a lost frame, resends…|That frame and all after it|Only that frame|Nothing', 'Selective Repeat resends…|Only the lost frame|Every frame|The first frame', 'Which one buffers out-of-order frames at the receiver?|Selective Repeat|Go-Back-N|Stop-and-Wait', 'With n-bit sequence numbers, the largest Go-Back-N window is…|2^n − 1|2^n|n'] },
  subnets: { z: 'network', d: 'Hard', e: '🧮',
    w: { n: ['💻|Host', '🧮|Mask', '🌐|Network'], s: [[1, '192.168.1.10', 'The host IP is combined with the subnet mask.'], [2, '192.168.1.0', 'AND with the mask gives the network address.'], [0, '/24', '/24 means 24 network bits and 8 host bits.']] },
    q: ['How many bits are in an IPv4 address?|32|16|128', 'In 192.168.1.0/24, how many bits are the network part?|24|8|32', 'What is the mask for /24?|255.255.255.0|255.255.0.0|255.0.0.0', 'How many usable hosts are in a /24?|254|256|255', 'How many usable hosts are in a /26?|62|64|30'] },
  ipheaders: { z: 'network', d: 'Medium', e: '🏷️',
    w: { n: ['💻|Source', '🛜|Router', '🖥️|Dest'], s: [[1, 'IP hdr', 'The header carries source, destination and TTL.'], [1, 'TTL−1', 'Each router lowers the TTL by one.'], [2, 'Frags', 'Big packets are split into fragments if the MTU is small.']] },
    q: ['Which header field limits how long a packet can live?|TTL|Checksum|Version', 'What does the destination address field hold?|Where the packet is going|The sender’s password|The packet’s colour', 'A packet bigger than the MTU may be…|Fragmented|Encrypted|Renamed', 'Which IP version has 128-bit addresses?|IPv6|IPv4|IPv5', 'Where are IP fragments reassembled?|At the destination host|At every router|At the sender'] },
  routing: { z: 'network', d: 'Medium', e: '🗺️',
    w: { n: ['💻|Host', '🛜|R1', '🛜|R2', '🖥️|Server'], s: [[1, '📦', 'The router looks up the destination in its routing table.'], [2, '📦', 'Longest prefix match picks the best route.'], [3, '📦', 'The last router delivers it to the server.']] },
    q: ['What does a router consult to forward a packet?|Its routing table|Its browser history|The sender’s disk', 'A default route is used when…|No more specific route matches|The link is fast|The TTL is high', 'Longest prefix match prefers…|The most specific route|The shortest table entry|The oldest route', 'Which kind of routing shares routes automatically?|Dynamic routing|Static routing|Framing', 'Distance-vector routing shares…|Distances to destinations with neighbours|The full map with everyone|Passwords'] },
  'topology-builder': { z: 'network', d: 'Easy', e: '🧩',
    w: { n: ['🖥️|PC', '🔀|Switch', '🛜|Router'], s: [[1, '📦', 'Devices connect to a switch to form a LAN.'], [2, '📦', 'A router joins different networks together.'], [2, '🌐', 'Routers link your LAN to the wider internet.']] },
    q: ['Which device connects devices in one LAN?|Switch|Printer|Monitor', 'Which device connects different networks?|Router|Keyboard|Speaker', 'In a star topology, devices connect to…|A central switch|Each other in a ring|One long cable', 'A drawback of a star topology is…|The centre is a single point of failure|Too many cables|It cannot grow', 'Which topology gives the most redundancy?|Full mesh|Bus|Star'] },
  'live-network-inventory': { z: 'network', d: 'Medium', e: '🛰️',
    w: { n: ['💻|Your device', '🔀|Local network', '🌐|Gateway'], s: [[1, 'IP + MAC', 'Your operating system exposes addresses assigned to local interfaces.'], [2, 'Neighbour cache', 'The OS remembers link-layer addresses it has recently resolved.'], [2, 'Default route', 'The routing table identifies the next hop for traffic leaving the local subnet.']] },
    q: ['What does a default route identify?|The next hop used when no more specific route matches|Every device on the internet|The DNS server only', 'An ARP or neighbour-cache entry represents…|A recently resolved IP-to-link-layer address mapping|A complete physical network map|A list of every online host', 'Which command commonly displays Linux interface addresses?|ip addr|mkdir|chmod', 'Can a normal client always read signal strength for every Wi-Fi device?|No, it usually sees only its own connection|Yes, for every nearby client|Only through DNS', 'Does reading the local neighbour cache actively scan the network?|No, it reads entries already held by the OS|Yes, it sends a ping to every IP|Yes, it opens every port'] },
  'wifi-simulator': { z: 'network', d: 'Medium', e: '📶',
    w: { n: ['📱|Client', '📶|Access point', '🌐|Internet'], s: [[1, 'SSID?', 'The client scans for networks by SSID.'], [1, 'Join', 'It connects to the access point on one channel.'], [2, '📦', 'Traffic then flows on to the wired network.']] },
    q: ['What is an SSID?|The name of a Wi-Fi network|A password|A cable type', 'As you move away from the access point the signal…|Gets weaker|Gets stronger|Stays the same', 'Which 2.4 GHz channels do not overlap?|1, 6 and 11|1, 2 and 3|5, 6 and 7', 'Which band usually reaches farther?|2.4 GHz|5 GHz|They are equal', 'Why do nearby APs on one channel slow each other?|They share airtime and interfere|They use different cables|They encrypt twice'] },
  tcpudp: { z: 'transport', d: 'Easy', e: '⚖️',
    w: { n: ['💻|Client', '🖥️|Server'], s: [[1, 'TCP', 'TCP sets up a connection and guarantees order.'], [0, 'ACK', 'Lost data is noticed and sent again.'], [1, 'UDP', 'UDP just sends datagrams with no guarantees.']] },
    q: ['Which protocol guarantees delivery and order?|TCP|UDP|Neither', 'Which has less overhead?|UDP|TCP|They are equal', 'Which suits a live video call better?|UDP|TCP|Neither', 'A port number identifies…|An application on a host|A cable|A router', 'Which field is NOT in a UDP header?|Sequence number|Source port|Checksum'] },
  handshake: { z: 'transport', d: 'Easy', e: '🤝',
    w: { n: ['💻|Client', '🖥️|Server'], s: [[1, 'SYN', 'Client: “Hello, can we talk?” (SYN)'], [0, 'SYN-ACK', 'Server: “Yes! Can you hear me?” (SYN-ACK)'], [1, 'ACK', 'Client: “Loud and clear.” (ACK) Connected!']] },
    q: ['What does the TCP handshake do?|Sets up a connection|Deletes data|Draws a map', 'How many steps does it have?|3|1|7', 'What is the order?|SYN, SYN-ACK, ACK|ACK, SYN, SYN-ACK|SYN-ACK, SYN, ACK', 'Which flag politely closes a connection?|FIN|SYN|URG', 'Besides flags, SYN and SYN-ACK exchange…|Initial sequence numbers|Passwords|Colours'] },
  congestion: { z: 'transport', d: 'Hard', e: '🚦',
    w: { n: ['💻|Sender', '🌐|Network'], s: [[1, 'cwnd 1', 'Slow start: the window starts small.'], [1, '2→4→8', 'It doubles every round trip.'], [0, 'loss!', 'On loss the sender cuts its window and slows down.']] },
    q: ['What is congestion?|Too much traffic for the network|A broken cable|A slow keyboard', 'Slow start grows the window…|Exponentially|Never|Linearly forever', 'After a loss, TCP usually…|Reduces its window|Doubles its window|Closes the app', 'What does cwnd stand for?|Congestion window|Cable width|Client window', 'Three duplicate ACKs trigger…|Fast retransmit|A DNS query|A reset'] },
  sockets: { z: 'transport', d: 'Medium', e: '🔌',
    w: { n: ['💻|Client', '🖥️|Server'], s: [[1, ':443', 'A socket is an IP address plus a port.'], [1, ':25', 'Different ports let one host run many services.'], [0, 'reply', 'Demultiplexing hands data to the right application.']] },
    q: ['A socket is…|IP address + port|A power outlet|A cable end', 'What is the default HTTPS port?|443|80|25', 'What lets many apps share one IP address?|Ports|Longer cables|Bigger packets', 'A TCP connection is identified by…|Both IPs and both ports|Only the port|Only the IP', 'Demultiplexing…|Delivers incoming data to the right socket|Merges two links|Splits packets'] },
  'network-performance': { z: 'transport', d: 'Hard', e: '📈',
    w: { n: ['💻|Sender', '🖥️|Receiver'], s: [[1, '📦×N', 'Bandwidth sets how fast bits go onto the wire.'], [0, 'ACK', 'RTT is the round-trip delay.'], [1, 'loss', 'Loss causes retransmissions and lowers goodput.']] },
    q: ['Bandwidth measures…|Data per second a link can carry|How far data travels|How secure it is', 'RTT stands for…|Round-trip time|Real transfer time|Router test time', 'More packet loss means…|More retransmissions|Faster transfers|Less delay', 'Throughput is…|Data actually delivered per second|The link’s rated maximum|The packet size', 'The bandwidth-delay product tells you…|How much data fits in flight on the link|The packet size|The IP address'] },
  dns: { z: 'application', d: 'Easy', e: '🔍',
    w: { n: ['💻|Browser', '🔎|Resolver', '🌍|Servers'], s: [[1, 'IP?', 'The browser asks the resolver for example.com.'], [2, 'IP?', 'The resolver asks the root, .com and owner servers.'], [0, '93.184.216.34', 'The resolver returns the IP address and caches it.']] },
    q: ['DNS turns names into…|IP addresses|Passwords|Colours', 'DNS works like a…|Phone book|Calculator|Camera', 'Who asks the root, TLD and owner servers?|The resolver|A printer|The monitor', 'Which server knows about .com?|TLD server|Your router|A keyboard', 'Why cache DNS answers?|Faster repeat lookups|More hops|Bigger packets'] },
  http: { z: 'application', d: 'Easy', e: '🌍',
    w: { n: ['💻|Browser', '🖥️|Server'], s: [[1, 'GET /', 'The browser sends an HTTP request.'], [0, '200 OK', 'The server replies with a status code and content.'], [1, '🔒 TLS', 'HTTPS wraps it all in TLS encryption.']] },
    q: ['Which method fetches a page?|GET|SEND|MAKE', 'Which status code means success?|200|404|500', 'What does 404 mean?|Not found|Server error|Redirect', 'What does HTTPS add to HTTP?|TLS encryption|Faster images|More colours', 'What does the TLS handshake establish?|A shared session key|A DNS record|A route'] },
  encap: { z: 'network', d: 'Easy', e: '🎁',
    w: { n: ['💻|App', '📦|Network', '🔌|Link'], s: [[1, 'TCP+data', 'Each layer adds its own header.'], [2, 'IP+TCP+data', 'The network layer adds an IP header.'], [2, 'Frame', 'The link layer adds a frame header and trailer.']] },
    q: ['Encapsulation means…|Wrapping data with a header at each layer|Deleting headers|Compressing files', 'Which layer adds IP addresses?|Network|Link|Application', 'Which layer adds MAC addresses?|Link|Transport|Application', 'A TCP unit of data is called a…|Segment|Frame|Bit', 'Order of units from app down to wire?|Data, segment, packet, frame|Frame, packet, segment, data|Packet, data, frame, segment'] },
  encryption: { z: 'security', d: 'Hard', e: '🔐',
    w: { n: ['💻|Sender', '🔒|Cipher', '🖥️|Receiver'], s: [[1, 'Hello', 'Plaintext goes into an algorithm together with a key.'], [2, 'x9#Qa', 'Only ciphertext travels over the network.'], [2, 'Hello', 'The receiver’s key turns it back into plaintext.']] },
    q: ['Encryption turns plaintext into…|Ciphertext|Packets|Frames', 'The Caesar cipher is…|Easy to break|Unbreakable|Used by TLS today', 'SHA-256 is a…|One-way hash|Reversible cipher|Compression', 'In public-key crypto, which key encrypts for a recipient?|Their public key|Their private key|Your password', 'Why combine RSA or ECDH with AES?|Asymmetric sets up keys, AES encrypts fast|AES is slower|They are the same'] },
  firewall: { z: 'security', d: 'Medium', e: '🧱',
    w: { n: ['🌐|Traffic', '🧱|Firewall', '🖥️|Server'], s: [[1, 'TCP:22', 'Rules are checked from top to bottom.'], [1, 'match', 'The first matching rule decides: allow or deny.'], [2, 'allowed', 'Allowed traffic reaches the server.']] },
    q: ['What does a firewall do?|Filters traffic with rules|Stores files|Prints pages', 'Which rule action blocks traffic?|Deny|Allow|Forward', 'Firewall rules are evaluated…|In order, first match wins|All at once|Randomly', 'A good default policy is…|Deny by default|Allow everything|No rules', 'An “allow all” rule above a specific “deny”…|Makes the deny unreachable|Strengthens the deny|Is ignored'] },
  capture: { z: 'security', d: 'Hard', e: '🔬',
    w: { n: ['🔌|Wire', '🔍|Capture', '👀|You'], s: [[1, '📦📦📦', 'A capture records packets as they pass.'], [2, 'filter', 'Display filters narrow the view.'], [2, 'headers', 'Each packet shows its layered headers.']] },
    q: ['A packet capture tool…|Records traffic for inspection|Blocks traffic|Speeds up Wi-Fi', 'A display filter…|Hides packets you don’t want to see|Deletes packets on the wire|Encrypts packets', 'Which port does DNS commonly use?|53|8080|22', 'Plain HTTP in a capture is…|Readable by anyone capturing|Always encrypted|Hidden', 'Why can’t you read HTTPS payloads in a capture?|They are TLS encrypted|Capture drops them|They are too small'] },
  trouble: { z: 'security', d: 'Medium', e: '🩺',
    w: { n: ['🔧|You', '🧪|Test', '🖥️|Server'], s: [[1, 'ping', 'Start at the bottom: is the link up?'], [1, 'ping GW', 'Then check IP, gateway and DNS in order.'], [2, 'fixed', 'Change one thing at a time and re-test.']] },
    q: ['What does ping test?|Reachability|Disk speed|Screen size', 'You can ping an IP but not a name. Suspect…|DNS|The cable|The monitor', 'Good troubleshooting starts with…|The lowest layer first|Replacing everything|Rebooting randomly', 'What does traceroute show?|The hops along the path|Your password|File sizes', 'Packets reach the gateway but go no further. Likely…|A routing or upstream problem|A bad monitor|The wrong keyboard'] },
  journey: { z: 'tools', d: 'Easy', e: '🧭' },
  tutorials: { z: 'tools', d: 'Easy', e: '🧪' },
  challenges: { z: 'tools', d: 'Medium', e: '🎯' },
  protocolcompare: { z: 'tools', d: 'Medium', e: '⚔️' },
  glossary: { z: 'tools', d: 'Easy', e: '📖' },
};

/** Core-lab stages (route #/lab/n): shown as a numbered path on the home screen. */
export const LAB = [['✍️', 'Message & Encoding', 'Words to bytes'], ['🧱', 'Packetization', 'Split the stream'], ['🌩️', 'Transmission Lab', 'Cross the link'], ['🧩', 'Receiver', 'Rebuild the message']];

/** Underlined glossary words (tap for the meaning). */
export const TERMS = {
  packet: 'A small chunk of data with an address on it.', router: 'A device that forwards packets toward their destination.',
  TTL: 'Time To Live: a hop counter that stops packets looping forever.', parity: 'An extra bit that makes the count of 1s even.',
  SYN: '“Synchronise”: the message that starts a TCP connection.', ACK: '“Acknowledge”: confirms that data arrived.',
  resolver: 'A server that looks names up for you.', DNS: 'Domain Name System: the internet’s phone book.',
  IP: 'Internet Protocol: the addressing system of the internet.', TLS: 'Transport Layer Security: encrypts web traffic.',
  MTU: 'Maximum Transmission Unit: the largest packet a link carries.', cwnd: 'Congestion window: how much data may be in flight.',
  SSID: 'The name of a Wi-Fi network.', CRC: 'Cyclic Redundancy Check: a strong error-detecting code.',
};

export const FACTS = [
  'The first message ever sent over ARPANET, in 1969, was meant to be “LOGIN”. The system crashed after “LO”.',
  'A single web page can need dozens of DNS lookups before it finishes loading.',
  'TCP and IP were designed in the 1970s, and they still carry most of the internet.',
  'IPv4 has about 4.3 billion addresses. IPv6 has 340 undecillion.',
  'Undersea cables, not satellites, carry almost all intercontinental internet traffic.',
];
