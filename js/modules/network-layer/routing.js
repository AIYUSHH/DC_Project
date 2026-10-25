/**
 * learning module: Routing and forwarding
 *
 * Interactive topology (click links to fail them), routing tables and longest-prefix matching.
 *
 * This file registers one learning module with regMod(). Its mount(root) function builds the screen inside
 * `root` and attaches event handlers; the function mount() returns (if any) is its cleanup, called by the router
 * when the learner leaves, so timers and listeners do not outlive the screen. The protocol logic lives in
 * ../../simulations/ and ../../core/; this file is the user interface for it.
 *
 * Imports:
 *   - ../../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): bitRow, hn, on, panel, sel, tabset, tbl, vd
 *   - ../../core/utils.js (tiny DOM, math and timing helpers): $, REDUCE
 *   - ../../core/state.js (shared in-memory state): S
 *   - ../../core/addressing.js (IPv4/IPv6 address and CIDR calculations): cidrInfo, ip32, ip4, mk, p4, parseCidr
 *   - ../../simulations/routing.js (sample topology and shortest-path routing): TOPO, dijkstra, linkKey, pathTo
 *   - ../registry.js (learning-module registry and group definitions): regMod
 *
 * Exports: (none)
 *
 * Used by: (imported only for its side effects by app.js)
 */

import { cidrInfo, ip32, ip4, mk, p4, parseCidr } from '../../core/addressing.js';
import { S } from '../../core/state.js';
import { bitRow, hn, on, panel, sel, tabset, tbl, vd } from '../../core/ui-helpers.js';
import { $, REDUCE } from '../../core/utils.js';
import { dijkstra, linkKey, pathTo, TOPO } from '../../simulations/routing.js';
import { regMod } from '../registry.js';

/* Register "Routing and forwarding". The router calls mount(root) when the learner opens #/m/routing and calls the returned function (if any) when they leave. */
regMod({
  id: 'routing',
  group: 'net',
  title: 'Routing and forwarding',
  desc: 'Follow a packet router by router, break links to force a new path, and see longest-prefix match decide.',
  obj: [
    'Compute shortest paths over a weighted topology and read each router’s table.',
    'Fail a link and watch the network reroute.',
    'Apply the longest-prefix-match rule to a forwarding table.',
  ],
  mount(root) {
    const down = new Set();
    let timer = null;
    root.innerHTML = '<div id="rttabs"></div>';
    const NODES = Object.keys(TOPO.nodes);
    const tabs = tabset(
      $('#rttabs', root),
      [
        {
          label: 'Topology and paths',
          render(p) {
            p.innerHTML = panel(
              'Network',
              `<p class="hint">Numbers are link costs. Click a link to take it down or bring it back up.</p><div id="rtsvg"></div>
          <div class="controls"><div class="field"><label for="rs">From</label>${sel(
            'rs',
            NODES.map(n => [n, n]),
            'A'
          )}</div><div class="field"><label for="rd2">To</label>${sel(
            'rd2',
            NODES.map(n => [n, n]),
            'B'
          )}</div>
          <div class="field"><label for="rttl">Initial TTL</label>${sel(
            'rttl',
            [2, 3, 4, 5, 64].map(x => [x, x]),
            64
          )}</div><div class="btnrow"><button class="btn" id="rsend">Send packet</button><button class="btn ghost" id="rheal">Restore all links</button></div></div>
          <div id="rinfo"></div><ul class="log" id="rlog"></ul>`
            );
            const draw = (path, at) => {
              const pe = new Set();
              if (path)
                for (let i = 0; i < path.length - 1; i++) pe.add(linkKey(path[i], path[i + 1]));
              let s = `<svg class="topo" viewBox="0 0 680 320" role="img" aria-label="Network topology">`;
              TOPO.links.forEach(([a, b, w]) => {
                const A = TOPO.nodes[a],
                  B = TOPO.nodes[b],
                  k = linkKey(a, b),
                  d = down.has(k);
                s += `<g class="lk${d ? ' down' : ''}${pe.has(k) ? ' on' : ''}" data-k="${k}" tabindex="0" role="button" aria-label="Link ${a} to ${b}, cost ${w}, ${d ? 'down' : 'up'}. Press to toggle."><line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" class="hit"/><line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" class="vis"/><rect x="${(A.x + B.x) / 2 - 11}" y="${(A.y + B.y) / 2 - 10}" width="22" height="20" rx="6"/><text x="${(A.x + B.x) / 2}" y="${(A.y + B.y) / 2 + 4}" text-anchor="middle">${d ? '✕' : w}</text></g>`;
              });
              NODES.forEach(n => {
                const o = TOPO.nodes[n];
                s += `<g class="nd ${o.kind}${path && path.includes(n) ? ' on' : ''}"><circle cx="${o.x}" cy="${o.y}" r="${o.kind === 'host' ? 20 : 17}"/><text x="${o.x}" y="${o.y + 4}" text-anchor="middle">${n}</text></g>`;
              });
              if (at) s += `<circle class="pkt" r="8" cx="${at.x}" cy="${at.y}"/>`;
              $('#rtsvg', p).innerHTML = s + '</svg>';
            };
            const info = () => {
              const a = $('#rs', p).value,
                b = $('#rd2', p).value,
                r = pathTo(a, b, down);
              draw(r && r.path);
              $('#rinfo', p).innerHTML =
                a === b
                  ? vd('info', 'Same node.', 'Pick two different nodes.')
                  : r
                    ? vd(
                        'ok',
                        `Best path: ${r.path.join(' → ')}`,
                        `Total cost ${r.cost}, ${r.path.length - 1} hops.`
                      )
                    : vd(
                        'bad',
                        'No route.',
                        `Every path from ${a} to ${b} is cut. Routers would answer “destination unreachable”.`
                      );
            };
            on(p, 'click', '.lk', (e, g) => {
              const k = g.dataset.k;
              down.has(k) ? down.delete(k) : down.add(k);
              info();
            });
            on(p, 'keydown', '.lk', (e, g) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const k = g.dataset.k;
                down.has(k) ? down.delete(k) : down.add(k);
                info();
              }
            });
            ['rs', 'rd2'].forEach(id => {
              $('#' + id, p).onchange = info;
            });
            $('#rheal', p).onclick = () => {
              down.clear();
              info();
            };
            $('#rsend', p).onclick = async () => {
              const a = $('#rs', p).value,
                b = $('#rd2', p).value,
                r = pathTo(a, b, down);
              let ttl = +$('#rttl', p).value;
              clearInterval(timer);
              if (a === b || !r) {
                info();
                return;
              }
              const log = $('#rlog', p);
              log.innerHTML = '';
              const add = (t, c, m) =>
                log.insertAdjacentHTML(
                  'afterbegin',
                  `<li><span class="tag ${c}">${t}</span>${m}</li>`
                );
              const token = S.tok;
              let i = 0;
              const step = () => {
                if (S.tok !== token || !p.isConnected) {
                  clearInterval(timer);
                  return;
                }
                const n = r.path[i],
                  o = TOPO.nodes[n];
                draw(r.path, o);
                if (i === 0) add('SEND', '', `${n} sends the packet with TTL ${ttl}.`);
                else if (TOPO.nodes[n].kind === 'router') {
                  ttl--;
                  if (ttl <= 0) {
                    add(
                      'DROP',
                      'bad',
                      `${n} lowers TTL to 0 and discards the packet. It sends ICMP time-exceeded back to ${a}.`
                    );
                    clearInterval(timer);
                    return;
                  }
                  add(
                    'FWD',
                    'ok',
                    `${n} lowers TTL to ${ttl} and forwards to ${r.path[i + 1]} (best next hop).`
                  );
                } else add('DONE', 'ok', `${n} receives the packet. TTL left: ${ttl}.`);
                if (++i >= r.path.length) clearInterval(timer);
              };
              step();
              timer = setInterval(step, REDUCE ? 40 : 750);
            };
            info();
          },
        },
        {
          label: 'Routing tables',
          render(p) {
            p.innerHTML = panel(
              'Table computed from the current topology',
              `<div class="controls"><div class="field"><label for="rr">Router</label>${sel(
                'rr',
                NODES.filter(n => TOPO.nodes[n].kind === 'router').map(n => [n, n]),
                'R1'
              )}</div></div><div id="rto"></div>
          <p class="hint">The tables follow the link state you set on the first tab. Each router runs Dijkstra’s algorithm on the same map, which is how link-state protocols such as OSPF work.</p>`
            );
            const f = () => {
              const r = $('#rr', p).value,
                { dist, prev } = dijkstra(r, down),
                rows = [];
              NODES.filter(n => n !== r).forEach(n => {
                if (dist[n] === Infinity) {
                  rows.push([
                    n,
                    TOPO.nodes[n].ip ? TOPO.nodes[n].ip + '/24' : '—',
                    { h: '<span class="pill bad">unreachable</span>' },
                    '∞',
                  ]);
                  return;
                }
                let hop = n;
                while (prev[hop] !== r) hop = prev[hop];
                rows.push([
                  n,
                  TOPO.nodes[n].ip ? TOPO.nodes[n].ip.replace(/\.\d+$/, '.0/24') : 'router ' + n,
                  hop === n ? 'direct (' + n + ')' : 'via ' + hop,
                  dist[n],
                ]);
              });
              $('#rto', p).innerHTML = tbl(['Destination', 'Network', 'Next hop', 'Cost'], rows);
            };
            $('#rr', p).onchange = f;
            f();
          },
        },
        {
          label: 'Longest prefix match',
          render(p) {
            const routes = [
              ['10.0.1.0', 24, 'direct on eth1'],
              ['10.0.2.0', 24, 'via 10.0.1.2 on eth1'],
              ['10.0.0.0', 16, 'via 10.0.0.9 on eth0'],
              ['172.16.0.0', 12, 'via 10.0.0.254 on eth0'],
              ['0.0.0.0', 0, 'default via 10.0.0.1 on eth0'],
            ];
            p.innerHTML =
              panel(
                'Forward a packet',
                `<div class="controls"><div class="field grow"><label for="ld">Destination address</label><input id="ld" type="text" value="10.0.2.7" spellcheck="false"></div></div><div id="lo"></div>`
              ) +
              panel(
                'Add a route',
                `<div class="controls"><div class="field grow"><label for="lnew">Network (CIDR)</label><input id="lnew" type="text" placeholder="10.0.2.0/25" spellcheck="false"></div><div class="field grow"><label for="lnh">Next hop</label><input id="lnh" type="text" value="via 10.0.1.77 on eth1"></div><div class="btnrow"><button class="btn" id="ladd">Add route</button></div></div><div id="lerr"></div>`
              );
            const f = () => {
              const a = p4($('#ld', p).value);
              if (a === null) {
                $('#lo', p).innerHTML = vd(
                  'bad',
                  'Invalid address.',
                  'Use four numbers from 0 to 255.'
                );
                return;
              }
              const m = routes.map(([n, pl, nh], i) => ({
                  n,
                  pl,
                  nh,
                  i,
                  hit: (a & mk(pl)) >>> 0 === p4(n),
                })),
                hits = m.filter(x => x.hit).sort((x, y) => y.pl - x.pl),
                best = hits[0];
              $('#lo', p).innerHTML =
                hn('Binary of the destination: coloured bits match the winning prefix.') +
                bitRow(ip32(a), i => (i < best.pl ? 'c2' : 'c4')) +
                tbl(
                  ['Route', 'Prefix length', 'Matches?', 'Next hop'],
                  m.map(x => [
                    ip4(p4(x.n)) + '/' + x.pl,
                    x.pl,
                    {
                      h:
                        x === best
                          ? '<span class="pill live">best match</span>'
                          : x.hit
                            ? '<span class="pill">matches</span>'
                            : '<span class="pill">no</span>',
                    },
                    x.nh,
                  ])
                ) +
                vd(
                  'ok',
                  `Forward using ${best.n}/${best.pl}.`,
                  `${best.nh}. ${hits.length > 1 ? `${hits.length} routes match, and the one with the longest prefix wins because it is the most specific.` : 'Only one route matches.'}`
                );
            };
            $('#ld', p).oninput = f;
            $('#ladd', p).onclick = () => {
              const c = parseCidr($('#lnew', p).value);
              if (!c) {
                $('#lerr', p).innerHTML = vd('bad', 'Enter a network like 10.0.2.0/25.');
                return;
              }
              const n = cidrInfo(c.a, c.p).n;
              routes.push([ip4(n), c.p, $('#lnh', p).value || 'via ?']);
              $('#lerr', p).innerHTML = vd('ok', `Added ${ip4(n)}/${c.p}.`);
              f();
            };
            f();
          },
        },
      ],
      0
    );
    // Cleanup: stop the packet animation timer when the learner leaves this module.
    return () => {
      clearInterval(timer);
      tabs.destroy();
    };
  },
});
