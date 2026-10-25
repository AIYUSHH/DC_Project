/**
 * learning module: Sockets and multiplexing
 *
 * How the OS delivers segments to the right socket, and how NAT rewrites addresses and ports.
 *
 * This file registers one learning module with regMod(). Its mount(root) function builds the screen inside
 * `root` and attaches event handlers; the function mount() returns (if any) is its cleanup, called by the router
 * when the learner leaves, so timers and listeners do not outlive the screen. The protocol logic lives in
 * ../../simulations/ and ../../core/; this file is the user interface for it.
 *
 * Imports:
 *   - ../../core/utils.js (tiny DOM, math and timing helpers): $, $$, pickOne
 *   - ../../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): hn, on, panel, sel, tabset, tbl, vd
 *   - ../../core/addressing.js (IPv4/IPv6 address and CIDR calculations): p4
 *   - ../registry.js (learning-module registry and group definitions): regMod
 *
 * Exports: (none)
 *
 * Used by: (imported only for its side effects by app.js)
 */

import { p4 } from '../../core/addressing.js';
import { hn, on, panel, sel, tabset, tbl, vd } from '../../core/ui-helpers.js';
import { $, $$, pickOne } from '../../core/utils.js';
import { regMod } from '../registry.js';

/* Register "Sockets and multiplexing". The router calls mount(root) when the learner opens #/m/sockets and calls the returned function (if any) when they leave. */
regMod({
  id: 'sockets',
  group: 'adv',
  title: 'Sockets and multiplexing',
  desc: 'Many conversations share one address through ports. See how segments find the right socket, and how NAT shares one public address.',
  obj: [
    'Match an incoming segment to a listening or established socket.',
    'See why a server can serve thousands of clients on port 443.',
    'Follow a NAT table as private hosts share one public address.',
  ],
  mount(root) {
    root.innerHTML = '<div id="sktabs"></div>';
    const SERVER = '203.0.113.5';
    let socks = [
      ['TCP', '*:22', '*', 'LISTEN'],
      ['TCP', '*:80', '*', 'LISTEN'],
      ['TCP', '*:443', '*', 'LISTEN'],
      ['UDP', '*:53', '*', 'BOUND'],
      ['UDP', '*:123', '*', 'BOUND'],
    ];
    const eph = () => 49152 + Math.floor(Math.random() * 16383),
      rip = () =>
        `${pickOne(['198.51.100', '192.0.2', '203.0.113'])}.${1 + Math.floor(Math.random() * 250)}`;
    const tabs = tabset(
      $('#sktabs', root),
      [
        {
          label: 'Demultiplexing',
          render(p) {
            p.innerHTML =
              panel(
                `Server ${SERVER}`,
                `<p class="hint">A socket is identified by protocol, local address and port, remote address and port. The kernel looks up each arriving segment in this table.</p><div id="skt"></div>`
              ) +
              panel(
                'Send a segment to the server',
                `<div class="controls"><div class="field"><label for="kp">Protocol</label>${sel(
                  'kp',
                  [
                    ['TCP', 'TCP'],
                    ['UDP', 'UDP'],
                  ],
                  'TCP'
                )}</div><div class="field"><label for="ki">From IP</label><input id="ki" type="text" value="198.51.100.20"></div>
            <div class="field"><label for="ks">From port</label><input id="ks" type="number" min="1" max="65535" value="51000"></div><div class="field"><label for="kd">To port</label><input id="kd" type="number" min="1" max="65535" value="443"></div>
            <div class="field"><label for="kf">TCP segment</label>${sel(
              'kf',
              [
                ['syn', 'SYN (new connection)'],
                ['data', 'Data on a connection'],
              ],
              'syn'
            )}</div><div class="btnrow"><button class="btn" id="ksend">Deliver</button><button class="btn ghost" id="kmany">Add 5 random clients</button><button class="btn ghost" id="kreset">Reset</button></div></div><div id="kres"></div>`
              );
            const draw = hl => {
              $('#skt', p).innerHTML = tbl(
                ['Proto', 'Local', 'Remote', 'State'],
                socks.map((s, i) => [
                  s[0],
                  s[1].replace('*', SERVER === '' ? '' : '*'),
                  s[2],
                  { h: `<span class="${i === hl ? 'hlrow' : ''}">${s[3]}</span>` },
                ])
              );
              if (hl !== undefined) $$('#skt tbody tr', p)[hl]?.classList.add('hl');
            };
            const deliver = () => {
              const pr = $('#kp', p).value,
                ip = $('#ki', p).value.trim(),
                sp = +$('#ks', p).value,
                dp = +$('#kd', p).value,
                syn = $('#kf', p).value === 'syn';
              if (p4(ip) === null || !(sp > 0 && sp < 65536 && dp > 0 && dp < 65536)) {
                $('#kres', p).innerHTML = vd('bad', 'Check the address and ports.');
                return;
              }
              const remote = `${ip}:${sp}`;
              if (pr === 'UDP') {
                const i = socks.findIndex(s => s[0] === 'UDP' && s[1] === '*:' + dp);
                $('#kres', p).innerHTML =
                  i >= 0
                    ? vd(
                        'ok',
                        'Delivered to the socket bound to UDP port ' + dp + '.',
                        'UDP looks only at the destination port. Datagrams from any sender land in the same socket.'
                      )
                    : vd(
                        'bad',
                        'No socket on UDP port ' + dp + '.',
                        'The host replies with an ICMP “port unreachable” message.'
                      );
                draw(i >= 0 ? i : undefined);
                return;
              }
              const est = socks.findIndex(
                s =>
                  s[0] === 'TCP' && s[3] === 'ESTABLISHED' && s[1] === '*:' + dp && s[2] === remote
              );
              if (est >= 0) {
                $('#kres', p).innerHTML = vd(
                  'ok',
                  'Delivered to an established connection.',
                  `The full four-value match (${remote} → ${SERVER}:${dp}) picked this exact socket, even though many others use port ${dp}.`
                );
                draw(est);
                return;
              }
              const lis = socks.findIndex(
                s => s[0] === 'TCP' && s[3] === 'LISTEN' && s[1] === '*:' + dp
              );
              if (lis >= 0 && syn) {
                socks.push(['TCP', '*:' + dp, remote, 'ESTABLISHED']);
                draw(socks.length - 1);
                $('#kres', p).innerHTML = vd(
                  'ok',
                  'Accepted by the listening socket.',
                  `A SYN-ACK goes back, and the kernel creates a new ESTABLISHED socket for ${remote}. The listener stays open for the next client.`
                );
                return;
              }
              if (lis >= 0) {
                $('#kres', p).innerHTML = vd(
                  'bad',
                  'Reset.',
                  'Data arrived for a connection that does not exist. The listener only accepts a SYN, so the host sends a TCP RST.'
                );
                draw(lis);
                return;
              }
              $('#kres', p).innerHTML = vd(
                'bad',
                'Connection refused.',
                `Nothing is listening on TCP port ${dp}, so the host answers with a TCP RST.`
              );
              draw();
            };
            $('#ksend', p).onclick = deliver;
            $('#kmany', p).onclick = () => {
              for (let i = 0; i < 5; i++)
                socks.push(['TCP', '*:' + pickOne([80, 443]), `${rip()}:${eph()}`, 'ESTABLISHED']);
              draw();
              $('#kres', p).innerHTML = vd(
                'info',
                'Five clients connected.',
                'Notice how several rows share one local port and differ only in the remote address or port.'
              );
            };
            $('#kreset', p).onclick = () => {
              socks = socks.slice(0, 5);
              $('#kres', p).innerHTML = '';
              draw();
            };
            draw();
          },
        },
        {
          label: 'NAT',
          render(p) {
            const PUB = '198.51.100.7',
              HOSTS = ['192.168.1.10', '192.168.1.11', '192.168.1.12'],
              REMOTE = '93.184.216.34:443';
            let map = [],
              nextPort = 40000;
            p.innerHTML = panel(
              'One public address for many hosts',
              `<p class="hint">The router rewrites the source address and port of outgoing packets and remembers the mapping so it can rewrite replies.</p>
          <div class="btnrow wrap">${HOSTS.map(h => `<button class="btn ghost sm" data-h="${h}">${h} opens a connection</button>`).join('')}</div><div id="nt"></div>
          <div class="btnrow wrap"><button class="btn ghost sm" id="nrep">Server replies to latest mapping</button><button class="btn ghost sm" id="ncold">Unsolicited packet from outside</button><button class="btn ghost sm" id="nclr">Clear table</button></div><div id="nlog"></div>`
            );
            const draw = () => {
              $('#nt', p).innerHTML = map.length
                ? tbl(
                    ['Protocol', 'Inside (private)', 'Outside (public)', 'Remote'],
                    map.map(m => ['TCP', `${m.ip}:${m.sp}`, `${PUB}:${m.ep}`, REMOTE])
                  )
                : hn('The NAT table is empty. Open a connection from one of the hosts.');
            };
            on(p, 'click', '[data-h]', (e, b) => {
              const m = { ip: b.dataset.h, sp: eph(), ep: nextPort++ };
              map.push(m);
              draw();
              $('#nlog', p).innerHTML = vd(
                'ok',
                'Outbound packet translated.',
                `${m.ip}:${m.sp} → ${REMOTE} leaves as ${PUB}:${m.ep} → ${REMOTE}. The server only ever sees the public address.`
              );
            });
            $('#nrep', p).onclick = () => {
              const m = map[map.length - 1];
              $('#nlog', p).innerHTML = m
                ? vd(
                    'ok',
                    'Reply translated back.',
                    `${REMOTE} → ${PUB}:${m.ep} matches a mapping, so the router rewrites the destination to ${m.ip}:${m.sp} and delivers it.`
                  )
                : vd('warn', 'No mapping yet.', 'Open a connection first.');
            };
            $('#ncold', p).onclick = () => {
              $('#nlog', p).innerHTML = vd(
                'bad',
                'Dropped.',
                `A packet to ${PUB}:${nextPort + 123} has no mapping, so the router does not know which inside host it is for and discards it. This is why NAT blocks unsolicited inbound connections by default.`
              );
            };
            $('#nclr', p).onclick = () => {
              map = [];
              $('#nlog', p).innerHTML = '';
              draw();
            };
            draw();
          },
        },
      ],
      0
    );
    return () => tabs.destroy();
  },
});
