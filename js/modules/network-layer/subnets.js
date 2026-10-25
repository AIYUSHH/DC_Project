/**
 * learning module: Addressing and subnets
 *
 * CIDR calculator, subnet splitting with VLSM, and generated practice questions.
 *
 * This file registers one learning module with regMod(). Its mount(root) function builds the screen inside
 * `root` and attaches event handlers; the function mount() returns (if any) is its cleanup, called by the router
 * when the learner leaves, so timers and listeners do not outlive the screen. The protocol logic lives in
 * ../../simulations/ and ../../core/; this file is the user interface for it.
 *
 * Imports:
 *   - ../../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): bitRow, hn, kb, panel, sel, statRow, tabset, tbl, vd
 *   - ../../core/utils.js (tiny DOM, math and timing helpers): $, fmtN, pickOne
 *   - ../../core/addressing.js (IPv4/IPv6 address and CIDR calculations): cidrInfo, classOf, ip32, ip4, ipKind, mk, p4, parseCidr
 *   - ../../core/encoding.js (bytes, hex, bits and UTF-8 helpers): bin8
 *   - ../../core/storage.js (saved progress (localStorage) and the shared P object): P
 *   - ../registry.js (learning-module registry and group definitions): regMod
 *   - ../../app/progress.js (achievements, flags and statistics): flag, stat
 *
 * Exports: (none)
 *
 * Used by: (imported only for its side effects by app.js)
 */

import { cidrInfo, classOf, ip32, ip4, ipKind, mk, p4, parseCidr } from '../../core/addressing.js';
import { bin8 } from '../../core/encoding.js';
import { P } from '../../core/storage.js';
import { bitRow, hn, kb, panel, sel, statRow, tabset, tbl, vd } from '../../core/ui-helpers.js';
import { $, fmtN, pickOne } from '../../core/utils.js';
import { regMod } from '../registry.js';
import { flag, stat } from '../../app/progress.js';

/* Register "Addressing and subnets". The router calls mount(root) when the learner opens #/m/subnets and calls the returned function (if any) when they leave. */
regMod({
  id: 'subnets',
  group: 'net',
  title: 'Addressing and subnets',
  desc: 'Split an address into network and host bits, carve a block into subnets, then test yourself.',
  obj: [
    'Read CIDR notation and compute the network, broadcast and host range.',
    'Divide an address block into equal subnets and with variable-length masks (VLSM).',
    'Practise with generated questions and get instant feedback.',
  ],
  mount(root) {
    root.innerHTML = '<div id="sntabs"></div>';
    const tabs = tabset(
      $('#sntabs', root),
      [
        {
          label: 'Calculator',
          render(p) {
            p.innerHTML =
              panel(
                'IPv4 address and prefix',
                `<div class="controls"><div class="field grow"><label for="ci">IPv4 address</label><input id="ci" type="text" value="192.168.1.10" spellcheck="false" autocomplete="off"></div>
          <div class="field grow"><label for="cp">Prefix length: <b id="cv">24</b></label><input id="cp" type="range" min="0" max="32" value="24"></div></div><div id="co"></div>`
              ) +
              panel(
                'Is this address on the same network?',
                `<div class="controls"><div class="field grow"><label for="cj">Another address</label><input id="cj" type="text" value="192.168.1.200" spellcheck="false" autocomplete="off"></div></div><div id="cjo"></div>`
              );
            const f = () => {
              const a = p4($('#ci', p).value),
                pl = +$('#cp', p).value;
              $('#cv', p).textContent = pl;
              if (a === null) {
                $('#co', p).innerHTML = vd(
                  'bad',
                  'Invalid address.',
                  'Use four numbers from 0 to 255, like 192.168.1.10.'
                );
                $('#cjo', p).innerHTML = '';
                return;
              }
              const c = cidrInfo(a, pl);
              if (a === p4('172.16.5.9') && pl === 20) flag('cidr20');
              $('#co', p).innerHTML =
                kb([
                  ['Network', ip4(c.n) + '/' + pl, 'c0'],
                  ['Subnet mask', ip4(c.m), 'c0'],
                  ['Wildcard', ip4(c.wild), 'c4'],
                  ['Broadcast', ip4(c.b), 'c3'],
                  ['First host', ip4(c.first), 'c2'],
                  ['Last host', ip4(c.last), 'c2'],
                  ['Usable hosts', fmtN(c.usable), 'c2'],
                  ['Total addresses', fmtN(c.size), 'c4'],
                  ['Type', ipKind(a) + ', class ' + classOf(a), 'c1'],
                ]) +
                hn(
                  `<b>Address</b>: the first ${pl} bits (blue) name the network, the remaining ${32 - pl} bits (yellow) name the host.`
                ) +
                bitRow(ip32(a), i => (i < pl ? 'c0' : 'c3')) +
                hn('<b>Mask</b>') +
                bitRow(ip32(c.m), i => (i < pl ? 'c0' : 'c4')) +
                `<p class="hint">Octets: ${ip4(a)
                  .split('.')
                  .map((o, i) => `${o} = ${bin8(+o)}`)
                  .join(' . ')}</p>`;
              const b = p4($('#cj', p).value);
              $('#cjo', p).innerHTML =
                b === null
                  ? vd('warn', 'Enter a valid address to compare.')
                  : (b & c.m) >>> 0 === c.n
                    ? vd(
                        'ok',
                        `${ip4(b)} is inside ${ip4(c.n)}/${pl}.`,
                        'Its network bits match, so the two hosts can talk directly without a router.'
                      )
                    : vd(
                        'bad',
                        `${ip4(b)} is outside ${ip4(c.n)}/${pl}.`,
                        `Its network is ${ip4((b & c.m) >>> 0)}/${pl}. Traffic between them must pass through a router.`
                      );
            };
            $('#ci', p).oninput = $('#cp', p).oninput = $('#cj', p).oninput = f;
            f();
          },
        },
        {
          label: 'Split and allocate',
          render(p) {
            p.innerHTML =
              panel(
                'Divide a block into equal subnets',
                `<div class="controls"><div class="field grow"><label for="sb">Block (CIDR)</label><input id="sb" type="text" value="192.168.10.0/24" spellcheck="false"></div>
          <div class="field"><label for="sc">Number of subnets</label>${sel(
            'sc',
            [2, 4, 8, 16, 32, 64].map(x => [x, x]),
            4
          )}</div></div><div id="so"></div>`
              ) +
              panel(
                'Variable-length subnet masks (VLSM)',
                `<p class="hint">Give each department only the space it needs. Largest requests are placed first so everything stays aligned.</p>
          <div class="controls"><div class="field grow"><label for="vb">Block (CIDR)</label><input id="vb" type="text" value="10.1.0.0/24" spellcheck="false"></div>
          <div class="field grow"><label for="vr">Hosts needed per subnet (comma separated)</label><input id="vr" type="text" value="100, 50, 25, 10, 2" spellcheck="false"></div></div><div id="vo"></div>`
              );
            const split = () => {
              const b = parseCidr($('#sb', p).value),
                n = +$('#sc', p).value,
                extra = Math.log2(n);
              if (!b) {
                $('#so', p).innerHTML = vd('bad', 'Enter a block like 192.168.10.0/24.');
                return;
              }
              const np = b.p + extra;
              if (np > 30) {
                $('#so', p).innerHTML = vd(
                  'bad',
                  'Too many subnets for this block.',
                  `That would need a /${np} prefix. Use a bigger block or fewer subnets.`
                );
                return;
              }
              const base = cidrInfo(b.a, b.p).n,
                step = 2 ** (32 - np),
                rows = [];
              for (let i = 0; i < n; i++) {
                const c = cidrInfo(base + i * step, np);
                rows.push([
                  i + 1,
                  ip4(c.n) + '/' + np,
                  ip4(c.first) + ' – ' + ip4(c.last),
                  ip4(c.b),
                  fmtN(c.usable),
                ]);
              }
              $('#so', p).innerHTML =
                hn(
                  `Borrowing ${extra} bit${extra > 1 ? 's' : ''} turns /${b.p} into /${np}: ${n} subnets of ${fmtN(step)} addresses each, mask ${ip4(mk(np))}.`
                ) + tbl(['#', 'Subnet', 'Usable range', 'Broadcast', 'Hosts'], rows);
            };
            const vlsm = () => {
              const b = parseCidr($('#vb', p).value),
                reqs = $('#vr', p)
                  .value.split(',')
                  .map(x => parseInt(x, 10))
                  .filter(x => x > 0);
              if (!b || !reqs.length || reqs.length > 24) {
                $('#vo', p).innerHTML = vd(
                  'bad',
                  'Check the inputs.',
                  'Use a block like 10.1.0.0/24 and a list like 100, 50, 25.'
                );
                return;
              }
              const base = cidrInfo(b.a, b.p),
                end = base.b + 1;
              let cur = base.n;
              const rows = [];
              let used = 0,
                fail = null;
              reqs
                .slice()
                .sort((x, y) => y - x)
                .forEach(h => {
                  if (fail) return;
                  let bits = 2;
                  while (2 ** bits - 2 < h) bits++;
                  const size = 2 ** bits,
                    pl = 32 - bits;
                  if (cur + size > end) {
                    fail = h;
                    return;
                  }
                  const c = cidrInfo(cur, pl);
                  rows.push([
                    h,
                    ip4(c.n) + '/' + pl,
                    ip4(c.first) + ' – ' + ip4(c.last),
                    fmtN(c.usable),
                    fmtN(c.usable - h),
                  ]);
                  cur += size;
                  used += size;
                });
              $('#vo', p).innerHTML =
                (fail
                  ? vd(
                      'bad',
                      `Out of space at the request for ${fail} hosts.`,
                      'The block is too small for all requests.'
                    )
                  : vd(
                      'ok',
                      'Everything fits.',
                      `${fmtN(used)} of ${fmtN(base.size)} addresses allocated (${Math.round((used / base.size) * 100)}%).`
                    )) + tbl(['Needed', 'Subnet', 'Usable range', 'Capacity', 'Spare'], rows);
            };
            ['sb', 'sc'].forEach(id => {
              $('#' + id, p).oninput = split;
            });
            ['vb', 'vr'].forEach(id => {
              $('#' + id, p).oninput = vlsm;
            });
            split();
            vlsm();
          },
        },
        {
          label: 'Practice',
          render(p) {
            let q = null,
              streak = 0,
              asked = 0,
              right = 0;
            const gen = () => {
              const pl = 16 + Math.floor(Math.random() * 13),
                a =
                  (((10 + Math.floor(Math.random() * 200)) << 24) |
                    (Math.floor(Math.random() * 256) << 16) |
                    (Math.floor(Math.random() * 256) << 8) |
                    Math.floor(Math.random() * 256)) >>>
                  0;
              const c = cidrInfo(a, pl),
                kind = pickOne(['net', 'bc', 'hosts', 'first']);
              q = {
                c,
                kind,
                ans:
                  kind === 'net'
                    ? ip4(c.n)
                    : kind === 'bc'
                      ? ip4(c.b)
                      : kind === 'first'
                        ? ip4(c.first)
                        : String(c.usable),
              };
              q.text = {
                net: 'What is the network address?',
                bc: 'What is the broadcast address?',
                hosts: 'How many usable host addresses are there?',
                first: 'What is the first usable host address?',
              }[kind];
              $('#qq', p).innerHTML =
                `<div class="quizq"><code class="big">${ip4(a)}/${pl}</code><p>${q.text}</p></div>`;
              $('#qa', p).value = '';
              $('#qf', p).innerHTML = '';
              $('#qa', p).focus();
            };
            p.innerHTML = panel(
              'Subnet challenge',
              `<div id="qq"></div><div class="controls"><div class="field grow"><label for="qa">Your answer</label><input id="qa" type="text" autocomplete="off" spellcheck="false"></div>
          <div class="btnrow"><button class="btn" id="qc">Check</button><button class="btn ghost" id="qn">New question</button></div></div><div id="qf"></div>${statRow(
            [
              [right + '/' + asked, 'correct'],
              [streak, 'streak'],
              [P.stats.subnetOk, 'total correct (all time)'],
            ]
          ).replace('stats wide', 'stats wide" id="qs')}`,
              'Tip: the mask tells you where the network bits end. Work in binary on the octet that is cut by the prefix.'
            );
            const upd = () => {
              $('#qs', p).innerHTML = [
                [right + '/' + asked, 'correct'],
                [streak, 'streak'],
                [P.stats.subnetOk, 'total correct (all time)'],
              ]
                .map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`)
                .join('');
            };
            const check = () => {
              if (!q || q.done) return;
              const v = $('#qa', p).value.trim().replace(/,/g, '');
              asked++;
              const ok = v === q.ans;
              q.done = true;
              if (ok) {
                right++;
                streak++;
                stat('subnetOk');
              } else streak = 0;
              const c = q.c;
              $('#qf', p).innerHTML = ok
                ? vd('ok', 'Correct.', `The answer is ${q.ans}.`)
                : vd(
                    'bad',
                    `Not quite. The answer is ${q.ans}.`,
                    `${ip4(c.a)}/${c.p} has mask ${ip4(c.m)}. Network = address AND mask = ${ip4(c.n)}; broadcast = ${ip4(c.b)}; ${fmtN(c.size)} addresses, ${fmtN(c.usable)} usable.`
                  );
              upd();
            };
            $('#qc', p).onclick = check;
            $('#qn', p).onclick = gen;
            $('#qa', p).onkeydown = e => {
              if (e.key === 'Enter') {
                q && q.done ? gen() : check();
              }
            };
            gen();
          },
        },
      ],
      0
    );
    return () => tabs.destroy();
  },
});
