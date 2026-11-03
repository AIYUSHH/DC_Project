/**
 * fault scenarios and a simulated network for the troubleshooting lab
 *
 * Defines seven possible diagnoses (FAULTS), five scripted cases (TROUBLE) and netsim(), a tiny network model that
 * answers ping, traceroute, nslookup, curl and ip commands the way the faulty network would, so a learner can
 * diagnose the fault from command output alone.
 *
 * Imports:
 *   - ../core/addressing.js (IPv4/IPv6 address and CIDR calculations): ip4, mk, p4
 *   - ./packet-builders.js (byte-accurate Ethernet / IPv4 / TCP / UDP builders): MAC, macStr
 *
 * Exports: FAULTS, TROUBLE, netsim
 *
 * Used by: modules/advanced/troubleshooting.js
 */

import { ip4, mk, p4 } from '../core/addressing.js';
import { MAC, macStr } from './packet-builders.js';

/**
 * The possible diagnoses the learner can choose from: [id, description].
 */
export const FAULTS = [
  ['dns', 'The configured DNS server is wrong or not answering'],
  ['gateway', 'The default gateway setting is wrong'],
  ['firewall', 'A firewall blocks HTTPS (TCP port 443)'],
  ['uplink', 'The link beyond the local gateway is down'],
  ['stale', 'A DNS record points at the wrong address'],
  ['mask', 'The subnet mask is wrong'],
  ['cable', 'The local network cable or Wi-Fi is down'],
  ['dhcp', 'The client did not receive a valid DHCP configuration'],
  ['http', 'A firewall blocks HTTP traffic on TCP port 80'],
  ['server', 'The destination server is unavailable'],
  ['routing', 'The client has an incorrect route to external networks'],
  ['wifi', 'The wireless adapter is disconnected from the access point'],
  ['conflict', 'Another device is using the same IP address'],
  ['cache', 'The client is using an outdated cached DNS record'],
  ['mtu', 'The path MTU is too small for larger packets'],
];

/**
 * Router hops (IP, name) shown by the simulated traceroute.
 */
const HOPS = [
  ['10.0.1.1', 'gateway.lan'],
  ['172.16.8.1', 'edge1.isp.net'],
  ['198.51.100.9', 'core2.isp.net'],
];

/**
 * The five troubleshooting cases: symptom text plus the hidden network configuration.
 */
export const TROUBLE = [
  {
    id: 'dns',
    title: 'Websites will not open by name',
    brief:
      'A user says “the internet is down”, but chat apps still work. Browsing to any website fails with a name error.',
    cli: { ip: '10.0.1.20', p: 24, gw: '10.0.1.1', dns: '10.0.1.99' },
    local: ['10.0.1.1', '10.0.1.5'],
    dnsUp: false,
    hosts: { 'example.com': '93.184.216.34' },
    hops: HOPS,
    blocked: [],
    hints: [
      'Compare what works by address with what works by name.',
      'Try pinging 93.184.216.34 and then example.com.',
      'Look at which server the machine uses for name lookups (cat /etc/resolv.conf) and test it with nslookup.',
    ],
    why: 'Pinging by IP works, so routing is fine. nslookup times out because 10.0.1.99 is not a working DNS server. Fix the resolver address.',
  },
  {
    id: 'gateway',
    title: 'The printer works, the internet does not',
    brief:
      'A laptop can print to a local printer but cannot reach anything outside the office network.',
    cli: { ip: '10.0.1.20', p: 24, gw: '10.0.2.1', dns: '10.0.1.2' },
    local: ['10.0.1.1', '10.0.1.2', '10.0.1.5'],
    dnsUp: true,
    hosts: { 'example.com': '93.184.216.34' },
    hops: HOPS,
    blocked: [],
    hints: [
      'Ping something on the local network, then something far away.',
      'The error for far-away hosts is not a timeout. Read it carefully.',
      'Check the routing table with ip route. Is the gateway inside your own subnet?',
    ],
    why: 'The default gateway 10.0.2.1 is outside the client’s own /24, so it cannot be reached directly. The real gateway is 10.0.1.1.',
  },
  {
    id: 'firewall',
    title: 'Ping works but the website does not',
    brief: 'The server answers ping and DNS is fine, yet the browser times out on https sites.',
    cli: { ip: '10.0.1.20', p: 24, gw: '10.0.1.1', dns: '10.0.1.2' },
    local: ['10.0.1.1', '10.0.1.2', '10.0.1.5'],
    dnsUp: true,
    hosts: { 'example.com': '93.184.216.34' },
    hops: HOPS,
    blocked: [443],
    hints: [
      'Rule out name resolution and routing first.',
      'Compare curl with http:// and with https://.',
      'If ping and HTTP work but only port 443 times out, something is filtering that port.',
    ],
    why: 'The path and DNS are fine, and plain HTTP on port 80 works. Only TCP 443 times out, which means a firewall is dropping that traffic.',
  },
  {
    id: 'uplink',
    title: 'Everything outside is unreachable',
    brief:
      'Local resources work, but no external site responds and nobody can ping outside addresses.',
    cli: { ip: '10.0.1.20', p: 24, gw: '10.0.1.1', dns: '10.0.1.2' },
    local: ['10.0.1.1', '10.0.1.2', '10.0.1.5'],
    dnsUp: true,
    hosts: { 'example.com': '93.184.216.34' },
    hops: HOPS,
    cutAt: 2,
    blocked: [],
    hints: [
      'Can you reach the gateway? Can you resolve names?',
      'Use traceroute to find where the replies stop.',
      'The trace dies after the second hop, so the problem is beyond the first routers, not on your side.',
    ],
    why: 'The gateway and the first upstream router answer, then replies stop. The ISP-side link after hop 2 is down.',
  },
  {
    id: 'stale',
    title: 'The intranet site moved',
    brief:
      'http://intranet.local used to work. Now it hangs, but colleagues say the server is up at its usual address.',
    cli: { ip: '10.0.1.20', p: 24, gw: '10.0.1.1', dns: '10.0.1.2' },
    local: ['10.0.1.1', '10.0.1.2', '10.0.1.5'],
    dnsUp: true,
    hosts: { 'example.com': '93.184.216.34', 'intranet.local': '10.0.1.9' },
    hops: HOPS,
    blocked: [],
    hints: [
      'Find out what address the name resolves to.',
      'Use nslookup intranet.local and compare with ping 10.0.1.5.',
      'The server answers at 10.0.1.5, but DNS hands out a different address.',
    ],
    why: 'DNS still says intranet.local is 10.0.1.9, but the server now lives at 10.0.1.5. The A record must be updated.',
  },

  {
    id: 'mask',
    title: 'Local devices work, but the gateway cannot be reached',
    brief: 'A workstation can communicate with a nearby device but reports that its default gateway is unreachable.',
    cli: { ip: '10.0.1.20', p: 28, gw: '10.0.1.1', dns: '10.0.1.2' },
    local: ['10.0.1.21', '10.0.1.2', '10.0.1.5'], dnsUp: true,
    hosts: { 'example.com': '93.184.216.34' }, hops: HOPS, blocked: [],
    hints: ['Check the interface address and prefix length.', 'Compare the gateway address with the client subnet.', 'The /28 prefix places 10.0.1.1 outside the client subnet; the intended mask is /24.'],
    why: 'The /28 mask makes the client treat 10.0.1.1 as off-link. Correct the subnet mask to /24.'
  },
  {
    id: 'cable',
    title: 'The laptop has no network connection',
    brief: 'The user cannot reach even nearby devices. The network icon reports that the connection is disconnected.',
    cli: { ip: '10.0.1.20', p: 24, gw: '10.0.1.1', dns: '10.0.1.2' },
    local: ['10.0.1.1', '10.0.1.2', '10.0.1.5'], dnsUp: true,
    hosts: { 'example.com': '93.184.216.34' }, hops: HOPS, blocked: [], linkDown: true,
    hints: ['Start by checking the interface state.', 'Try pinging the default gateway.', 'The interface is DOWN, indicating a disconnected cable or link.'],
    why: 'The network interface is down, so no network traffic can leave the laptop. Reconnect the cable or restore the link.'
  },
  {
    id: 'dhcp',
    title: 'The laptop received an automatic private address',
    brief: 'After joining the office network, the laptop has an address beginning with 169.254 and cannot access shared resources.',
    cli: { ip: '169.254.10.20', p: 16, gw: '0.0.0.0', dns: '0.0.0.0' },
    local: [], dnsUp: false, hosts: {}, hops: HOPS, blocked: [],
    hints: ['Inspect the assigned IP address.', 'Look for a usable default gateway and DNS server.', 'A 169.254.x.x address is link-local and usually means DHCP did not provide a lease.'],
    why: 'The client has an APIPA/link-local address and no usable gateway or DNS server. Restore DHCP service or renew the lease.'
  },
  {
    id: 'http',
    title: 'Secure websites work, but older HTTP sites time out',
    brief: 'Users can open HTTPS websites, but plain HTTP websites consistently time out.',
    cli: { ip: '10.0.1.20', p: 24, gw: '10.0.1.1', dns: '10.0.1.2' },
    local: ['10.0.1.1', '10.0.1.2', '10.0.1.5'], dnsUp: true,
    hosts: { 'example.com': '93.184.216.34' }, hops: HOPS, blocked: [80],
    hints: ['Check name resolution and basic reachability.', 'Compare curl http://example.com with curl https://example.com.', 'Only TCP port 80 is filtered.'],
    why: 'The network and DNS work, and HTTPS succeeds. TCP port 80 is blocked by a firewall rule.'
  },
  {
    id: 'server',
    title: 'One external service is offline',
    brief: 'Other websites work normally, but the monitoring team reports that example.com is not responding.',
    cli: { ip: '10.0.1.20', p: 24, gw: '10.0.1.1', dns: '10.0.1.2' },
    local: ['10.0.1.1', '10.0.1.2', '10.0.1.5'], dnsUp: true,
    hosts: { 'example.com': '93.184.216.34', 'status.example.net': '203.0.113.20' }, hops: HOPS, blocked: [], downHosts: ['93.184.216.34'],
    hints: ['Check whether DNS resolves the destination.', 'Try another known destination to verify general connectivity.', 'The route is available, but the specific destination host does not respond.'],
    why: 'The client has working DNS and routing, while the destination server is marked unavailable. The fault is at the server/service end.'
  },
  {
    id: 'routing',
    title: 'The route to the remote network is incorrect',
    brief: 'The client can reach its own subnet, but traffic to remote networks follows an invalid gateway.',
    cli: { ip: '10.0.1.20', p: 24, gw: '10.0.9.1', dns: '10.0.1.2' },
    local: ['10.0.1.1', '10.0.1.2', '10.0.1.5'], dnsUp: true,
    hosts: { 'example.com': '93.184.216.34' }, hops: HOPS, blocked: [],
    hints: ['Test a local address and an external address.', 'Inspect the default route with ip route.', 'The default route points to 10.0.9.1 instead of the local router 10.0.1.1.'],
    why: 'The default route points to a gateway outside the local subnet. Correct the route to use 10.0.1.1.'
  },
  {
    id: 'wifi',
    title: 'The wireless device is disconnected',
    brief: 'A laptop is in range of the office access point but is not associated with the Wi-Fi network.',
    cli: { ip: '10.0.1.20', p: 24, gw: '10.0.1.1', dns: '10.0.1.2' },
    local: ['10.0.1.1', '10.0.1.2', '10.0.1.5'], dnsUp: true,
    hosts: { 'example.com': '93.184.216.34' }, hops: HOPS, blocked: [], linkDown: true, wireless: true,
    hints: ['Inspect the interface state.', 'Try pinging the access point/default gateway.', 'The wireless interface is down because it is not associated with the access point.'],
    why: 'The wireless interface is disconnected from the access point. Reconnect to the correct SSID and verify credentials.'
  },
  {
    id: 'conflict',
    title: 'Intermittent connectivity on a shared workstation',
    brief: 'The workstation intermittently loses access and reports duplicate-address warnings.',
    cli: { ip: '10.0.1.20', p: 24, gw: '10.0.1.1', dns: '10.0.1.2' },
    local: ['10.0.1.1', '10.0.1.2', '10.0.1.5'], dnsUp: true,
    hosts: { 'example.com': '93.184.216.34' }, hops: HOPS, blocked: [], ipConflict: true,
    hints: ['Check the interface address and system messages.', 'The configured address is also claimed by another host.', 'The duplicate IP warning identifies an address conflict.'],
    why: 'Another device is using 10.0.1.20. Assign a unique address or correct the DHCP reservation.'
  },
  {
    id: 'cache',
    title: 'The intranet still points to its old server',
    brief: 'The intranet server moved, but this laptop continues to connect to the previous address.',
    cli: { ip: '10.0.1.20', p: 24, gw: '10.0.1.1', dns: '10.0.1.2' },
    local: ['10.0.1.1', '10.0.1.2', '10.0.1.5'], dnsUp: true,
    hosts: { 'example.com': '93.184.216.34', 'intranet.local': '10.0.1.9' }, hops: HOPS, blocked: [], cachedHosts: { 'intranet.local': '10.0.1.9' },
    hints: ['Run nslookup intranet.local and inspect the returned address.', 'Compare that address with the known current server address 10.0.1.5.', 'The client is using a stale cached DNS answer. Flush the DNS cache after the record is corrected.'],
    why: 'The cached DNS entry points to 10.0.1.9 instead of the current server at 10.0.1.5. Flush the local DNS cache and refresh the record.'
  },
  {
    id: 'mtu',
    title: 'Small packets work, but large transfers stall',
    brief: 'The laptop can ping remote hosts, but large packet transfers and some VPN traffic fail.',
    cli: { ip: '10.0.1.20', p: 24, gw: '10.0.1.1', dns: '10.0.1.2' },
    local: ['10.0.1.1', '10.0.1.2', '10.0.1.5'], dnsUp: true,
    hosts: { 'example.com': '93.184.216.34' }, hops: HOPS, blocked: [], mtu: 1200,
    hints: ['Check the configured interface MTU with ip addr.', 'Compare a normal ping with a large do-not-fragment ping.', 'The path MTU is 1200 bytes, so larger packets are dropped.'],
    why: 'The path MTU is smaller than the packet size being sent. Reduce the interface/tunnel MTU or enable correct path-MTU discovery.'
  },
];

/**
 * Creates the simulated network for one troubleshooting case.
 *
 * @param {Object} sc - one entry of TROUBLE.
 * @returns {{cmd:(line:string)=>Array}} cmd() takes a typed command line and returns the output lines a real terminal would print, based on the case's hidden faults.
 */
export function netsim(sc) {
  const C = sc.cli,
    M = mk(C.p),
    same = ip => (p4(ip) & M) >>> 0 === (p4(C.ip) & M) >>> 0,
    onLinkGw = same(C.gw);
  const resolve = n => {
    if (p4(n) !== null) return { ip: n };
    if (!sc.dnsUp) return { err: 'timeout' };
    return sc.hosts[n] ? { ip: sc.hosts[n] } : { err: 'nx' };
  };
  const reach = ip => {
    if (ip === C.ip || ip === '127.0.0.1') return { ok: true, local: true };
    if (sc.linkDown) return { ok: false, why: 'link' };
    if (sc.ipConflict && ip === C.ip) return { ok: false, why: 'conflict' };
    if (sc.downHosts?.includes(ip)) return { ok: false, why: 'hostdown' };
    if (same(ip))
      return sc.local.includes(ip) ? { ok: true, local: true } : { ok: false, why: 'host' };
    if (!onLinkGw) return { ok: false, why: 'netunreach' };
    if (!sc.local.includes(C.gw)) return { ok: false, why: 'host' };
    if (sc.cutAt !== undefined) return { ok: false, why: 'cut' };
    return { ok: true };
  };
  const ms = (k, base) => (base + ((k * 7) % 5) + ((k * 13) % 10) / 10).toFixed(1);
  const cmd = line => {
    const a = line.trim().split(/\s+/),
      c = a[0],
      arg = a.filter(x => !x.startsWith('-')).slice(1)[0];
    const out = [];
    if (!c) return out;
    if (c === 'help')
      return [
        'Commands: ping, traceroute, nslookup, curl, ip addr, ip route, cat /etc/resolv.conf, clear',
        'Example: ping example.com',
      ];
    if (c === 'ip' && a[1] === 'addr')
      return [
        `2: eth0: <BROADCAST,MULTICAST,${sc.linkDown ? 'NO-CARRIER' : 'UP'}> mtu ${sc.mtu || 1500}`,
        ...(sc.ipConflict ? ['    [DUP] inet ' + C.ip + '/' + C.p + ' - duplicate address detected'] : []),
        `    link/ether ${macStr(MAC.client)}`,
        `    inet ${C.ip}/${C.p} brd ${ip4((p4(C.ip) | ~mk(C.p)) >>> 0)} scope global eth0`,
      ];
    if (c === 'ip' && a[1] === 'route')
      return [
        `default via ${C.gw} dev eth0`,
        `${ip4((p4(C.ip) & mk(C.p)) >>> 0)}/${C.p} dev eth0 proto kernel scope link src ${C.ip}`,
      ];
    if (c === 'cat' && a[1] === '/etc/resolv.conf') return [`nameserver ${C.dns}`];
    if ((c === 'ipconfig' && a[1] === '/flushdns') || (c === 'resolvectl' && a[1] === 'flush-caches'))
      return ['Successfully flushed the DNS resolver cache.'];
    if (c === 'ping' && sc.mtu && Number(a.find(x => /^-s\\d+$/.test(x))?.slice(2) || a[a.indexOf('-s') + 1] || 56) + 28 > sc.mtu)
      return ['ping: local error: message too long, mtu=' + sc.mtu, '100% packet loss'];
    if (c === 'ifconfig') return cmd('ip addr');
    if (!['ping', 'traceroute', 'nslookup', 'curl'].includes(c))
      return [`${c}: command not found. Type help.`];
    if (!arg) return [`${c}: missing target`];
    if (c === 'nslookup') {
      if (!sc.dnsUp) return [';; connection timed out; no servers could be reached'];
      const ip = sc.hosts[arg];
      if (!ip) return [`** server can't find ${arg}: NXDOMAIN`];
      return [
        `Server:\t\t${C.dns}`,
        `Address:\t${C.dns}#53`,
        '',
        'Non-authoritative answer:',
        `Name:\t${arg}`,
        `Address: ${ip}`,
      ];
    }
    let url = arg,
      scheme = 'http',
      port = 80,
      host = arg;
    if (c === 'curl') {
      const m = arg.match(/^(https?):\/\/([^/:]+)(?::(\d+))?/i);
      if (m) {
        scheme = m[1].toLowerCase();
        host = m[2];
        port = m[3] ? +m[3] : scheme === 'https' ? 443 : 80;
      } else host = arg.replace(/\/.*/, '');
    }
    const r = resolve(host);
    if (r.err)
      return c === 'curl'
        ? [`curl: (6) Could not resolve host: ${host}`]
        : c === 'ping'
          ? [
              `ping: ${host}: ${r.err === 'timeout' ? 'Temporary failure in name resolution' : 'Name or service not known'}`,
            ]
          : [`${host}: Name or service not known`];
    const ip = r.ip,
      rc = reach(ip),
      name = host === ip ? ip : `${host} (${ip})`;
    if (c === 'ping') {
      out.push(`PING ${name} 56(84) bytes of data.`);
      if (rc.ok) {
        for (let i = 1; i <= 4; i++)
          out.push(
            `64 bytes from ${ip}: icmp_seq=${i} ttl=${rc.local ? 64 : 54} time=${ms(i, rc.local ? 0.4 : 28)} ms`
          );
        out.push(
          '',
          `--- ${host} ping statistics ---`,
          '4 packets transmitted, 4 received, 0% packet loss'
        );
      } else if (rc.why === 'netunreach') return ['ping: connect: Network is unreachable'];
      else if (rc.why === 'link') return ['ping: connect: Network is down'];
      else if (rc.why === 'conflict') return ['WARNING: duplicate IP address detected for ' + C.ip];
      else if (rc.why === 'hostdown') return ['From ' + C.gw + ' Destination Host Unreachable'];
      else if (rc.why === 'host') {
        for (let i = 1; i <= 3; i++)
          out.push(`From ${C.ip} icmp_seq=${i} Destination Host Unreachable`);
        out.push(
          '',
          `--- ${host} ping statistics ---`,
          '3 packets transmitted, 0 received, +3 errors, 100% packet loss'
        );
      } else
        out.push(
          '',
          `--- ${host} ping statistics ---`,
          '4 packets transmitted, 0 received, 100% packet loss, time 3070ms'
        );
      return out;
    }
    if (c === 'traceroute') {
      if (rc.why === 'netunreach') return ['connect: Network is unreachable'];
      out.push(`traceroute to ${name}, 8 hops max`);
      if (rc.local) {
        out.push(` 1  ${ip}  0.4 ms`);
        return out;
      }
      if (rc.why === 'host' && same(ip)) {
        out.push(' 1  * * *', ' 2  * * *', ' 3  * * *');
        return out;
      }
      const hops = sc.hops,
        cut = sc.cutAt === undefined ? hops.length : sc.cutAt;
      hops.forEach((h, i) => {
        out.push(
          i < cut ? ` ${i + 1}  ${h[1]} (${h[0]})  ${ms(i + 1, 2 + i * 6)} ms` : ` ${i + 1}  * * *`
        );
      });
      if (rc.ok) out.push(` ${hops.length + 1}  ${host} (${ip})  ${ms(9, 31)} ms`);
      else out.push(` ${hops.length + 1}  * * *`, ` ${hops.length + 2}  * * *`);
      return out;
    }
    // curl
    if (rc.why === 'link') return ['curl: (7) Network is down'];
    if (rc.why === 'hostdown') return [`curl: (7) Failed to connect to ${host}: Destination host unavailable`];
    if (rc.why === 'netunreach')
      return [`curl: (7) Failed to connect to ${host} port ${port}: Network is unreachable`];
    if (!rc.ok || sc.blocked.includes(port))
      return [
        `curl: (28) Failed to connect to ${host} port ${port} after 5001 ms: Timeout was reached`,
      ];
    void url;
    return [
      'HTTP/1.1 200 OK',
      'Content-Type: text/html',
      '',
      `<title>${host === '10.0.1.5' || host === 'intranet.local' ? 'Intranet' : 'Example Domain'}</title>`,
    ];
  };
  return { cmd };
}
