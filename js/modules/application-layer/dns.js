/**
 * learning module: DNS
 *
 * Name resolution with a cache and virtual clock, wire-format messages and record types.
 *
 * This file registers one learning module with regMod(). Its mount(root) function builds the screen inside
 * `root` and attaches event handlers; the function mount() returns (if any) is its cleanup, called by the router
 * when the learner leaves, so timers and listeners do not outlive the screen. The protocol logic lives in
 * ../../simulations/ and ../../core/; this file is the user interface for it.
 *
 * Imports:
 *   - ../../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): chipRow, hn, ladder, panel, sel, statRow, tabset, tbl, vd
 *   - ../../core/utils.js (tiny DOM, math and timing helpers): $, $$
 *   - ../../core/encoding.js (bytes, hex, bits and UTF-8 helpers): hex
 *   - ../../simulations/dns.js (simulated DNS hierarchy and resolver with a cache): DNS_DATA, dnsLookup
 *   - ../../simulations/dns-wire.js (DNS message encoding and decoding (wire format)): dnsQuery, dnsResponse, parseDns
 *   - ../registry.js (learning-module registry and group definitions): regMod
 *   - ../../app/progress.js (achievements, flags and statistics): flag
 *
 * Exports: (none)
 *
 * Used by: (imported only for its side effects by app.js)
 */

import { hex } from '../../core/encoding.js';
import {
  chipRow,
  hn,
  ladder,
  panel,
  sel,
  statRow,
  tabset,
  tbl,
  vd,
} from '../../core/ui-helpers.js';
import { $, $$ } from '../../core/utils.js';
import { dnsQuery, dnsResponse, parseDns } from '../../simulations/dns-wire.js';
import { DNS_DATA, dnsLookup } from '../../simulations/dns.js';
import { regMod } from '../registry.js';
import { flag } from '../../app/progress.js';

/* Register "DNS". The router calls mount(root) when the learner opens #/m/dns and calls the returned function (if any) when they leave. */
regMod({
  id: 'dns',
  group: 'app',
  title: 'DNS',
  desc: 'Follow a name lookup from your resolver through the root, the TLD and the authoritative server, with a working cache.',
  obj: [
    'Walk the resolver chain: root, TLD, authoritative.',
    'Watch CNAME chains and NXDOMAIN answers.',
    'See the cache answer instantly, then expire when its TTL runs out.',
  ],
  mount(root) {
    const cache = new Map();
    let now = 0,
      last = null;
    root.innerHTML = '<div id="dnstabs"></div>';
    const tabs = tabset(
      $('#dnstabs', root),
      [
        {
          label: 'Lookup',
          render(p) {
            p.innerHTML =
              panel(
                'Resolve a name',
                `<div class="controls"><div class="field grow"><label for="dn">Name</label><input id="dn" type="text" value="www.example.com" list="dnl" spellcheck="false" autocomplete="off"><datalist id="dnl">${Object.keys(
                  DNS_DATA
                )
                  .map(n => `<option value="${n}">`)
                  .join('')}</datalist></div>
          <div class="field"><label for="dt">Record type</label>${sel(
            'dt',
            ['A', 'AAAA', 'MX', 'CNAME', 'NS', 'TXT'].map(x => [x, x]),
            'A'
          )}</div>
          <div class="btnrow"><button class="btn" id="dgo">Resolve</button></div></div>
          <div class="presets" id="dsamp">${['www.example.com', 'mail.example.com', 'cdn.example.com', 'docs.example.org', 'example.com', 'nope.example.com', 'host.invalid'].map(x => `<button class="chipbtn">${x}</button>`).join('')}</div>`,
                'Resolve the same name twice to see the cache. Use the clock buttons to let cached answers expire.'
              ) +
              '<div id="dres"></div>' +
              panel(
                'Resolver cache',
                `<div class="btnrow wrap"><span class="hint" id="dclk"></span><button class="btn ghost sm" id="d1">Wait 1 minute</button><button class="btn ghost sm" id="d2">Wait 10 minutes</button><button class="btn ghost sm" id="dfl">Flush cache</button></div><div id="dcache"></div>`
              );
            const drawCache = () => {
              $('#dclk', p).textContent = `Clock: +${Math.floor(now / 60)} min ${now % 60} s`;
              const rows = [...cache.entries()]
                .filter(([, v]) => v.exp > now)
                .map(([k, v]) => [
                  k.startsWith('ns|')
                    ? { h: `<span class="pill">delegation</span> ${k.slice(3)}` }
                    : k.replace('|', '  '),
                  v.rrs ? v.rrs.map(r => r.v).join(', ') : 'name servers',
                  `${v.exp - now} s`,
                ]);
              $('#dcache', p).innerHTML = rows.length
                ? tbl(['Entry', 'Value', 'TTL left'], rows)
                : hn('The cache is empty.');
            };
            const go = () => {
              const name = $('#dn', p).value,
                type = $('#dt', p).value,
                key = name.trim().toLowerCase().replace(/\.$/, '') + '|' + type,
                was = cache.get(key) && cache.get(key).exp > now;
              const r = dnsLookup(name, type, cache, now);
              last = r;
              if (r.cached && was) flag('dnsCache');
              const total = r.ms + 2;
              $('#dres', p).innerHTML =
                r.rcode === 'FORMERR'
                  ? vd('bad', 'Not a valid host name.', 'Use something like www.example.com.')
                  : panel(
                      'Resolver conversation',
                      r.msgs.length
                        ? ladder({
                            left: 'Your resolver',
                            right: 'DNS servers',
                            msgs: r.msgs,
                            marks: r.marks,
                            maxH: 460,
                          })
                        : '<p class="hint">No network traffic was needed.</p>'
                    ) +
                    panel(
                      'Result',
                      statRow([
                        [r.rcode, 'status'],
                        [
                          r.cached ? '0 ms' : total + ' ms',
                          r.cached ? 'time (cache hit)' : 'total time',
                        ],
                        [r.msgs.filter(m => m.dir === 'lr').length, 'queries sent'],
                        [r.answers.length, 'records'],
                      ]) +
                        (r.answers.length
                          ? tbl(
                              ['Name', 'Type', 'TTL', 'Value'],
                              r.answers.map(a => [a.name, a.type, a.ttl, a.v])
                            )
                          : '') +
                        (r.cached
                          ? vd(
                              'ok',
                              'Served from cache.',
                              `Valid for another ${r.left} seconds, so no server was contacted.`
                            )
                          : r.rcode === 'NXDOMAIN'
                            ? vd(
                                'bad',
                                'NXDOMAIN',
                                'The name does not exist. Resolvers cache these negative answers too, for a short time.'
                              )
                            : r.rcode === 'NODATA'
                              ? vd(
                                  'warn',
                                  'The name exists but has no record of this type.',
                                  'Try another type, such as A.'
                                )
                              : vd(
                                  'ok',
                                  'Resolved.',
                                  `Answer cached for ${Math.min(...r.answers.map(a => a.ttl))} seconds.`
                                ))
                    );
              drawCache();
            };
            $('#dgo', p).onclick = go;
            $('#dn', p).onkeydown = e => {
              if (e.key === 'Enter') go();
            };
            $('#dsamp', p).onclick = e => {
              const b = e.target.closest('.chipbtn');
              if (b) {
                $('#dn', p).value = b.textContent;
                go();
              }
            };
            $('#d1', p).onclick = () => {
              now += 60;
              drawCache();
            };
            $('#d2', p).onclick = () => {
              now += 600;
              drawCache();
            };
            $('#dfl', p).onclick = () => {
              cache.clear();
              drawCache();
            };
            drawCache();
            go();
          },
        },
        {
          label: 'Message bytes',
          render(p) {
            p.innerHTML = panel(
              'A real DNS message',
              `<div class="controls"><div class="field grow"><label for="mn">Name</label><input id="mn" type="text" value="example.com" spellcheck="false"></div><div class="field"><label for="mt">Type</label>${sel(
                'mt',
                ['A', 'AAAA', 'MX', 'TXT'].map(x => [x, x]),
                'A'
              )}</div></div><div id="mo"></div>`,
              'DNS runs over UDP port 53. The query below is exactly what your device would send, byte for byte.'
            );
            const f = () => {
              const n = $('#mn', p).value.trim().toLowerCase(),
                t = $('#mt', p).value;
              if (!/^[a-z0-9.-]+$/.test(n) || n.length > 80) {
                $('#mo', p).innerHTML = vd('bad', 'Use letters, digits, dots and hyphens.');
                return;
              }
              const q = dnsQuery(0x1a2b, n, t),
                parsed = parseDns(q, 0),
                rec = DNS_DATA[n],
                ans = rec && rec[t] ? rec[t] : (t === 'A' && rec && rec.A) || null;
              let html =
                hn('Query (' + q.length + ' bytes)') +
                chipRow(q.map(hex), i =>
                  i < 2 ? 'c3' : i < 4 ? 'c2' : i < 12 ? 'c4' : i >= q.length - 4 ? 'c1' : 'c0'
                ) +
                tbl(
                  ['Field', 'Value'],
                  parsed.fields.map(f2 => [f2.k, f2.v])
                ) +
                hn(
                  'Header (12 bytes): ID, flags, counts. Then the question: each label is a length byte followed by its characters, a zero byte ends the name, then the type and class.'
                );
              if (ans && t === 'A') {
                const r = dnsResponse(
                    0x1a2b,
                    n,
                    'A',
                    ans.map(v => ({ type: 1, ttl: 300, rdata: v.split('.').map(Number) })),
                    0
                  ),
                  pr = parseDns(r, 0);
                html +=
                  hn(
                    'Response (' +
                      r.length +
                      ' bytes). The answer reuses the name through a compression pointer (c0 0c).'
                  ) +
                  chipRow(r.map(hex), i =>
                    i < 2 ? 'c3' : i < 4 ? 'c2' : i < 12 ? 'c4' : i >= r.length - 4 ? 'c1' : 'c0'
                  ) +
                  tbl(
                    ['Field', 'Value'],
                    pr.fields.map(f2 => [f2.k, f2.v])
                  );
              } else
                html += vd(
                  'info',
                  'Response omitted.',
                  'This demo builds the response bytes only for A records that exist in the sample zone.'
                );
              $('#mo', p).innerHTML = html;
            };
            $$('input,select', p).forEach(e => {
              e.oninput = f;
              e.onchange = f;
            });
            f();
          },
        },
        {
          label: 'Record types',
          render(p) {
            p.innerHTML = panel(
              'Common record types',
              tbl(
                ['Type', 'Purpose', 'Example'],
                [
                  ['A', 'Name to IPv4 address', 'example.com → 93.184.216.34'],
                  ['AAAA', 'Name to IPv6 address', 'example.com → 2606:2800:220:1::1946'],
                  ['CNAME', 'Alias to another name', 'www.example.com → example.com'],
                  ['MX', 'Mail servers, with priority', '10 mail.example.com'],
                  ['NS', 'Authoritative name servers for a zone', 'ns1.example.com'],
                  ['TXT', 'Free text: SPF, domain verification', '"v=spf1 -all"'],
                  [
                    'PTR',
                    'Address to name (reverse lookup)',
                    '34.216.184.93.in-addr.arpa → example.com',
                  ],
                  ['SOA', 'Zone parameters and serial', 'refresh, retry, expire, minimum TTL'],
                ]
              )
            );
          },
        },
      ],
      0
    );
    // Cleanup: tabset runs the active tab's own cleanup function.
    return () => tabs.destroy();
  },
});
