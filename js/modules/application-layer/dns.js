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
      last = null,
      stepIndex = 0,
      playTimer = null;
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
          <div class="field"><label for="dmode">Resolution mode</label>${sel('dmode', [['recursive','Recursive'],['iterative','Iterative']], 'recursive')}</div>
          <div class="field"><label for="dttl">Answer TTL</label>${sel('dttl', [['default','Default by type'],['30','30 seconds'],['60','1 minute'],['300','5 minutes'],['900','15 minutes']], 'default')}</div>
          <div class="btnrow"><button class="btn" id="dgo">Resolve</button><button class="btn ghost" id="dcompare">Compare cache</button></div></div>
          <div class="presets" id="dsamp">${['www.example.com', 'mail.example.com', 'cdn.example.com', 'docs.example.org', 'example.com', 'nope.example.com', 'host.invalid'].map(x => `<button class="chipbtn">${x}</button>`).join('')}</div>`,
                'Resolve the same name twice to see the cache. Use the clock buttons to let cached answers expire.'
              ) +
              '<div id="dres"></div>' +
              panel('Resolution walkthrough', '<div class="btnrow wrap"><button class="btn sm" id="dprev">Previous step</button><button class="btn sm" id="dnext">Next step</button><button class="btn sm" id="dplay">Play</button><button class="btn ghost sm" id="dreset">Reset steps</button><span class="hint" id="dstepcount"></span></div><div id="dstepdetail" class="stepmsg" aria-live="polite">Resolve a name to inspect each DNS message.</div><div id="dstepladder"></div><div id="dcompareout"></div>', 'Step through client, resolver, root, TLD and authoritative DNS messages. This is a simulated teaching network.') +
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
                  v.negative ? 'Negative answer (' + v.rcode + ')' : v.rrs ? v.rrs.map(r => r.v).join(', ') : 'name servers',
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
              const ttlValue = $('#dttl', p).value;
              const r = dnsLookup(name, type, cache, now, { mode: $('#dmode', p).value, ttlOverride: ttlValue === 'default' ? undefined : Number(ttlValue) });
              last = r;
              stepIndex = 0;
              stopPlayback();
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
              drawWalkthrough();
            };
            const stopPlayback = () => {
              if (playTimer) clearInterval(playTimer);
              playTimer = null;
              const b = $('#dplay', p);
              if (b) b.textContent = 'Play';
            };
            const drawWalkthrough = () => {
              const host = $('#dstepladder', p), detail = $('#dstepdetail', p), count = $('#dstepcount', p);
              if (!host || !detail || !count) return;
              const msgs = last && last.msgs ? last.msgs : [];
              if (!msgs.length) {
                host.innerHTML = hn('No upstream DNS messages. A cached answer is served locally.');
                detail.textContent = last && last.cached ? 'Cache hit: the resolver returns the saved answer without contacting root, TLD, or authoritative servers.' : 'Resolve a valid name to begin stepping through the lookup.';
                count.textContent = '0 messages'; return;
              }
              stepIndex = Math.max(0, Math.min(stepIndex, msgs.length - 1));
              const m = msgs[stepIndex];
              count.textContent = 'Step ' + (stepIndex + 1) + ' of ' + msgs.length;
              detail.textContent = (m.dir === 'lr' ? 'Query / referral request: ' : 'Response / referral: ') + m.label + ' · Mode: ' + (last.mode || 'recursive');
              host.innerHTML = ladder({ left: 'Resolver / requester', right: 'DNS hierarchy', msgs: msgs.slice(0, stepIndex + 1), marks: last.marks || [], maxH: 460 });
            };
            $('#dprev', p).onclick = () => { stopPlayback(); stepIndex--; drawWalkthrough(); };
            $('#dnext', p).onclick = () => { if (last && last.msgs) stepIndex = Math.min(stepIndex + 1, last.msgs.length - 1); drawWalkthrough(); };
            $('#dreset', p).onclick = () => { stopPlayback(); stepIndex = 0; drawWalkthrough(); };
            $('#dplay', p).onclick = () => {
              if (playTimer) { stopPlayback(); return; }
              if (!last || !last.msgs || !last.msgs.length) return;
              if (stepIndex >= last.msgs.length - 1) stepIndex = -1;
              $('#dplay', p).textContent = 'Pause';
              playTimer = setInterval(() => { if (!last || stepIndex >= last.msgs.length - 1) { stopPlayback(); return; } stepIndex++; drawWalkthrough(); }, 900);
            };
            $('#dcompare', p).onclick = () => {
              const name = $('#dn', p).value, type = $('#dt', p).value;
              const opts = { mode: $('#dmode', p).value, ttlOverride: $('#dttl', p).value === 'default' ? undefined : Number($('#dttl', p).value) };
              const cold = dnsLookup(name, type, new Map(), now, opts), warmCache = new Map();
              dnsLookup(name, type, warmCache, now, opts);
              const warm = dnsLookup(name, type, warmCache, now, opts);
              $('#dcompareout', p).innerHTML = panel('Cold vs warm resolver cache', tbl(['Metric', 'Uncached lookup', 'Cached lookup'], [
                ['Upstream DNS queries', cold.queryCount || cold.msgs.filter(m => m.dir === 'lr').length, warm.queryCount || warm.msgs.filter(m => m.dir === 'lr').length],
                ['Simulated latency', (cold.ms || 0) + ' ms', (warm.ms || 0) + ' ms'],
                ['Server contacts', cold.serverCount || new Set(cold.servers || []).size, warm.serverCount || new Set(warm.servers || []).size],
                ['Result', cold.rcode, warm.rcode]
              ]), 'Counts come from the generated message trace. Cached delegation records may reduce an uncached lookup too.');
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
              $('#dcompareout', p).innerHTML = '';
              drawCache();
            };
            $('#dmode', p).onchange = go;
            $('#dttl', p).onchange = go;
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
          label: 'Live iterative DNS',
          render(p) {
            p.innerHTML = panel(
              'Resolve a real domain through the DNS hierarchy',
              `<div class="controls"><div class="field grow"><label for="live-dns-name">Public domain</label><input id="live-dns-name" type="text" value="google.com" spellcheck="false" autocomplete="off" placeholder="example.com"></div><div class="field"><label for="live-dns-type">Record type</label>${sel('live-dns-type',['A','AAAA','MX','NS','CNAME','TXT','SOA','CAA'].map(x=>[x,x]),'A')}</div></div>
              <div class="btnrow"><button class="btn" id="live-dns-run" type="button">Run real lookup</button><span class="hint" id="live-dns-status" role="status">Ready to query public DNS servers.</span></div>
              <div class="hint">Connected to the DC_Project hosted DNS resolver. Real DNS queries are performed remotely over TCP port 53; learners do not need Python, a terminal, or a local agent.</div>`,
              'Unlike the teaching simulation, this mode queries public root, TLD and authoritative DNS servers. Network restrictions may prevent a trace; errors are shown rather than replaced with fabricated steps.'
            ) + '<div id="live-dns-output"></div>';
            const LIVE_DNS_WORKER = 'https://dc-project-live-dns.sahilpatra274.workers.dev';
            const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
            const displayValue = value => escapeHtml(typeof value === 'object' ? JSON.stringify(value) : value);
            const renderRecords = records => records && records.length
              ? '<div class="dns-live-table-wrap">' + tbl(['Name','Type','TTL','Value'],records.map(a=>[escapeHtml(a.name),escapeHtml(a.type),escapeHtml(a.ttl),displayValue(a.data)])) + '</div>'
              : '<p class="hint">No records of this category were returned at this stage.</p>';
            const renderList = (title, items, formatter) => items && items.length
              ? '<details class="dns-live-details"><summary>' + escapeHtml(title) + ' <span class="dns-live-count">' + items.length + '</span></summary><div class="dns-live-details-body">' + items.map(formatter).join('') + '</div></details>'
              : '';

            const geoCache = new Map();
            const locatePublicIp = async ip => {
              if(geoCache.has(ip))return geoCache.get(ip);
              const task=(async()=>{
                const response=await fetch('https://ipwho.is/'+encodeURIComponent(ip),{headers:{Accept:'application/json'}});
                if(!response.ok)throw new Error('Geolocation lookup failed for '+ip);
                const data=await response.json();
                if(!data.success||!Number.isFinite(Number(data.latitude))||!Number.isFinite(Number(data.longitude)))return null;
                return {ip,lat:Number(data.latitude),lon:Number(data.longitude),city:data.city,region:data.region,country:data.country,isp:data.connection?.isp,org:data.connection?.org};
              })();
              geoCache.set(ip,task);
              try{const result=await task;geoCache.set(ip,result);return result;}catch(error){geoCache.delete(ip);throw error;}
            };
            const renderWorldMap = async (trace,host) => {
              const mapHost=host.querySelector('#dns-world-map'),listHost=host.querySelector('#dns-world-map-list');
              if(!mapHost||!listHost)return;
              const candidates=[];
              (trace.steps||[]).forEach((step,index)=>{
                if(isPublicIp(step.server))candidates.push({ip:step.server,role:(labels[step.stage]||'DNS server')+' · query '+(index+1)});
                (step.glue||[]).forEach(record=>{
                  if(['A','AAAA'].includes(String(record.type).toUpperCase())&&isPublicIp(record.data))candidates.push({ip:record.data,role:'DNS referral glue · '+record.name});
                });
              });
              (trace.answers||[]).forEach(record=>{
                if(['A','AAAA'].includes(String(record.type).toUpperCase())&&isPublicIp(record.data))candidates.push({ip:record.data,role:'Final answer · '+record.name});
              });
              const unique=[...new Map(candidates.map(x=>[x.ip,x])).values()].slice(0,30);
              if(!unique.length){
                mapHost.innerHTML='<div class="dns-world-map-message">No public IP addresses were exposed in this DNS trace. Private, hidden and hostname-only entries are not assigned locations.</div>';
                listHost.innerHTML='';return;
              }
              mapHost.innerHTML='<div class="dns-world-map-message">Looking up approximate locations for '+unique.length+' public IP address(es)…</div>';
              listHost.innerHTML='';
              const results=await Promise.all(unique.map(async item=>{try{return {...item,geo:await locatePublicIp(item.ip)};}catch(error){return {...item,geo:null,error:error.message};}}));
              if(!mapHost.isConnected)return;
              const located=results.filter(x=>x.geo&&Number.isFinite(x.geo.lat)&&Number.isFinite(x.geo.lon));
              listHost.innerHTML=results.map(item=>'<div class="dns-world-map-row"><b>'+escapeHtml(item.ip)+'</b><span>'+escapeHtml(item.role)+'</span><small>'+(item.geo?[escapeHtml(item.geo.city),escapeHtml(item.geo.region),escapeHtml(item.geo.country)].filter(Boolean).join(', ')||'Approximate location unavailable':'Location unavailable'+(item.error?' · '+escapeHtml(item.error):''))+'</small></div>').join('');
              if(!located.length){
                mapHost.innerHTML='<div class="dns-world-map-message">Geolocation service did not return usable coordinates. The IP list is still shown below. Check the connection or try again later.</div>';
                return;
              }
              const project=(lat,lon)=>({x:((lon+180)/360)*1000,y:((90-lat)/180)*500});
              const dots=located.map((item,index)=>{
                const p=project(item.geo.lat,item.geo.lon);
                const title=escapeHtml(item.ip+' · '+[item.geo.city,item.geo.region,item.geo.country].filter(Boolean).join(', '));
                return '<g class="dns-world-marker" tabindex="0" role="img" aria-label="'+title+'"><title>'+title+' · '+escapeHtml(item.role)+'</title><circle cx="'+p.x.toFixed(2)+'" cy="'+p.y.toFixed(2)+'" r="13" class="dns-world-marker-halo"/><circle cx="'+p.x.toFixed(2)+'" cy="'+p.y.toFixed(2)+'" r="5.5" class="dns-world-marker-dot"/><text x="'+(p.x+10).toFixed(2)+'" y="'+(p.y-10).toFixed(2)+'">'+(index+1)+'</text></g>';
              }).join('');
              const continents =
                '<path d="M75 105 L105 65 170 48 218 70 250 108 232 142 208 154 196 194 165 218 145 190 120 175 105 142 82 132Z"/>'+
                '<path d="M230 225 L260 238 276 278 267 325 248 378 229 420 212 386 215 340 197 300 207 260Z"/>'+
                '<path d="M405 100 L440 72 492 66 522 85 555 78 587 98 610 123 596 153 563 163 546 194 520 190 502 164 473 160 450 135 421 137Z"/>'+
                '<path d="M490 205 L525 187 566 198 586 235 578 280 555 329 529 367 505 339 492 294 474 250Z"/>'+
                '<path d="M585 95 L642 62 714 68 760 94 824 85 892 112 927 151 901 184 850 179 824 208 778 194 749 225 710 203 676 183 640 168 608 143Z"/>'+
                '<path d="M805 300 L850 281 892 295 916 324 900 354 864 367 830 348Z"/>'+
                '<path d="M92 55 L130 36 174 43 191 59 162 75 117 73Z"/>';
              mapHost.innerHTML='<svg class="dns-world-map-svg" viewBox="0 0 1000 500" role="img" aria-label="World map showing approximate geolocations of public IP addresses"><defs><pattern id="dns-map-grid" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" class="dns-world-gridline"/></pattern></defs><rect width="1000" height="500" class="dns-world-ocean"/><rect width="1000" height="500" fill="url(#dns-map-grid)"/><g class="dns-world-continents">'+continents+'</g><g>'+dots+'</g></svg><div class="dns-world-map-legend">'+located.length+' approximate location(s) plotted · '+results.length+' public IP(s) checked</div>';
            };
            const run = async () => {
              const name=$('#live-dns-name',p).value.trim(), type=$('#live-dns-type',p).value;
              const status=$('#live-dns-status',p), output=$('#live-dns-output',p), button=$('#live-dns-run',p);
              if(!name || !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.?$/i.test(name) || name.split('.').some(label=>!label || label.length>63)){
                status.textContent='Enter a valid public domain name.'; output.innerHTML=vd('warn','Check the domain name.','Use a name such as google.com.'); return;
              }
              button.disabled=true;status.textContent='Querying root, TLD and authoritative servers…';output.innerHTML='<div class="dns-live-loading"><span class="dns-live-spinner"></span><span>Following DNS referrals…</span></div>';
              try {
                const response=await fetch(LIVE_DNS_WORKER+'/trace?name='+encodeURIComponent(name)+'&type='+encodeURIComponent(type),{headers:{Accept:'application/json'}});
                const data=await response.json();
                if(!response.ok) throw new Error(data.error||'The hosted DNS service returned an error.');
                const steps=Array.isArray(data.steps)?data.steps:[];
                const answers=Array.isArray(data.answers)?data.answers:[];
                const totalMs=steps.reduce((n,s)=>n+(Number(s.elapsedMs)||0),0);
                const success=String(data.rcode) === '0' || String(data.rcode).toUpperCase()==='NOERROR';
                const primary=answers.find(a=>String(a.type).toUpperCase()===type) || answers[0];
                const primaryValue=primary ? (typeof primary.data==='object'?JSON.stringify(primary.data):primary.data) : '';
                const labels={root:'Root server',tld:'TLD server',authoritative:'Authoritative server'};
                let html=`<style>
                  .dns-live-results{display:grid;gap:16px;margin-top:16px}
                  .dns-live-hero{position:relative;overflow:hidden;padding:22px;border:1px solid var(--line,rgba(148,163,184,.25));border-radius:16px;background:linear-gradient(135deg,rgba(16,185,129,.12),rgba(59,130,246,.10))}
                  .dns-live-kicker{font-size:.76rem;letter-spacing:.09em;text-transform:uppercase;opacity:.72;font-weight:700}
                  .dns-live-domain{font-size:1.12rem;font-weight:700;margin-top:7px;overflow-wrap:anywhere}
                  .dns-live-ip{font-size:clamp(1.35rem,3vw,2rem);font-weight:800;letter-spacing:-.03em;margin:7px 0;overflow-wrap:anywhere}
                  .dns-live-meta{font-size:.88rem;opacity:.78}
                  .dns-live-copy{margin-left:8px}
                  .dns-live-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px}
                  .dns-live-stat{padding:14px;border:1px solid var(--line,rgba(148,163,184,.22));border-radius:12px;background:var(--panel,rgba(148,163,184,.06));min-width:0}
                  .dns-live-stat strong{display:block;font-size:1.05rem;overflow-wrap:anywhere}
                  .dns-live-stat span{display:block;font-size:.78rem;opacity:.7;margin-top:4px}
                  .dns-live-timeline{display:grid;gap:0}
                  .dns-live-stage{position:relative;padding:0 0 17px 29px;margin-left:10px;border-left:2px solid var(--line,rgba(148,163,184,.3))}
                  .dns-live-stage:last-child{border-left-color:transparent;padding-bottom:0}
                  .dns-live-dot{position:absolute;left:-9px;top:2px;width:16px;height:16px;border-radius:50%;background:var(--accent,#38bdf8);box-shadow:0 0 0 5px rgba(56,189,248,.12)}
                  .dns-live-stage-card{border:1px solid var(--line,rgba(148,163,184,.22));border-radius:13px;padding:14px;background:var(--panel,rgba(148,163,184,.05))}
                  .dns-live-stage-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
                  .dns-live-stage-title{font-weight:750}
                  .dns-live-stage-server{font-size:.84rem;opacity:.76;margin-top:4px;overflow-wrap:anywhere}
                  .dns-live-badges{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
                  .dns-live-badge{font-size:.74rem;border-radius:999px;padding:4px 9px;background:rgba(56,189,248,.12)}
                  .dns-live-details{margin-top:10px;border-top:1px solid var(--line,rgba(148,163,184,.18));padding-top:9px}
                  .dns-live-details summary{cursor:pointer;font-weight:650;font-size:.86rem}
                  .dns-live-count{display:inline-block;margin-left:5px;padding:1px 7px;border-radius:999px;background:rgba(148,163,184,.15);font-size:.72rem}
                  .dns-live-details-body{padding:9px 0 0;overflow-wrap:anywhere}
                  .dns-live-detail-item{font-size:.82rem;padding:5px 0;border-bottom:1px solid var(--line,rgba(148,163,184,.12))}
                  .dns-live-table-wrap{overflow-x:auto}
                  .dns-live-section{padding:16px;border:1px solid var(--line,rgba(148,163,184,.22));border-radius:14px}
                  .dns-live-section h3{margin:0 0 12px}
                  .dns-live-loading{display:flex;align-items:center;gap:10px;padding:18px;border-radius:12px;background:var(--panel,rgba(148,163,184,.06))}
                  .dns-live-spinner{width:18px;height:18px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:dnsLiveSpin .8s linear infinite}
                  @keyframes dnsLiveSpin{to{transform:rotate(360deg)}}
                  @media(max-width:600px){.dns-live-hero{padding:16px}.dns-live-stage{padding-left:23px}}
                </style><div class="dns-live-results">`;
                html+='<section class="dns-live-hero"><div class="dns-live-kicker">'+(success?'✓ Resolution successful':'DNS response: '+escapeHtml(data.rcode))+'</div><div class="dns-live-domain">'+escapeHtml(name)+' · '+escapeHtml(type)+'</div><div class="dns-live-ip">'+(primary?displayValue(primaryValue):'No matching answer')+'</div><div class="dns-live-meta">'+(primary?'TTL '+escapeHtml(primary.ttl)+' seconds · Final DNS answer':'The server did not return an answer record for this query type')+'</div></section>';
                html+='<div class="dns-live-stats"><div class="dns-live-stat"><strong>'+escapeHtml(data.rcode===0?'NOERROR':data.rcode)+'</strong><span>Response code</span></div><div class="dns-live-stat"><strong>'+steps.length+'</strong><span>DNS queries</span></div><div class="dns-live-stat"><strong>'+totalMs+' ms</strong><span>Total measured query time</span></div><div class="dns-live-stat"><strong>TCP / 53</strong><span>Resolution transport</span></div></div>';
                html+='<section class="dns-live-section"><h3>Resolution journey</h3><div class="dns-live-timeline">'+steps.map((step,i)=>{
                  const stage=labels[step.stage]||String(step.stage||'DNS server');
                  const referrals=Array.isArray(step.referrals)?step.referrals:[];
                  const glue=Array.isArray(step.glue)?step.glue:[];
                  const detailItems=[
                    '<div class="dns-live-detail-item"><strong>Query:</strong> '+escapeHtml(step.query)+'</div>',
                    '<div class="dns-live-detail-item"><strong>Response:</strong> '+escapeHtml(step.rcode===0?'NOERROR':step.rcode)+'</div>',
                    '<div class="dns-live-detail-item"><strong>Server:</strong> '+escapeHtml(step.server)+'</div>'
                  ];
                  const referralHtml=renderList('Delegated nameservers',referrals,x=>'<div class="dns-live-detail-item">'+escapeHtml(x.data)+'</div>');
                  const glueHtml=renderList('Glue records',glue,x=>'<div class="dns-live-detail-item"><strong>'+escapeHtml(x.name)+'</strong> · '+escapeHtml(x.type)+' · '+escapeHtml(x.data)+'</div>');
                  const answerHtml=renderList('Records returned at this stage',step.answers||[],x=>'<div class="dns-live-detail-item"><strong>'+escapeHtml(x.name)+'</strong> · '+escapeHtml(x.type)+' · TTL '+escapeHtml(x.ttl)+' · '+displayValue(x.data)+'</div>');
                  return '<div class="dns-live-stage"><span class="dns-live-dot"></span><article class="dns-live-stage-card"><div class="dns-live-stage-head"><div><div class="dns-live-stage-title">'+String(i+1).padStart(2,'0')+' · '+escapeHtml(stage)+'</div><div class="dns-live-stage-server">'+escapeHtml(step.server)+'</div></div><span class="dns-live-badge">'+escapeHtml(step.elapsedMs)+' ms</span></div><div class="dns-live-badges"><span class="dns-live-badge">'+escapeHtml(step.rcode===0?'NOERROR':step.rcode)+'</span>'+(step.authoritative?'<span class="dns-live-badge">Authoritative answer</span>':'<span class="dns-live-badge">Referral / lookup</span>')+'</div><details class="dns-live-details"><summary>View query and response details</summary><div class="dns-live-details-body">'+detailItems.join('')+referralHtml+glueHtml+answerHtml+'</div></details></article></div>';
                }).join('')+'</div></section>';
                html+='<section class="dns-live-section"><h3>Final DNS records</h3>'+renderRecords(answers)+'</section>';
                html+='<section class="dns-live-section"><h3>World map · IP locations</h3><p class="dns-live-meta">Approximate geolocation of public DNS servers, referral addresses and final A/AAAA answers observed in this trace. Private and unavailable IPs are not plotted.</p><div id="dns-world-map" class="dns-world-map"></div><div id="dns-world-map-list" class="dns-world-map-list"></div><p class="dns-live-meta">IP geolocation is approximate, not a physical server address. IPs are sent to ipwho.is for location lookup; map tiles are provided by OpenStreetMap.</p></section>';
                html+='<section class="dns-live-section"><h3>Trace information</h3><div class="dns-live-meta">Method: '+escapeHtml(data.method)+' · Queried: '+escapeHtml(data.queriedAt)+'</div></section></div>';
                output.innerHTML=html;status.textContent='Live DNS trace completed successfully.';
                renderWorldMap(data,output);
              } catch(error) { output.innerHTML=vd('bad','Live DNS lookup failed.',escapeHtml(error.message)+' Check the hosted resolver deployment.');status.textContent='Lookup failed.'; }
              finally { button.disabled=false; }
            };
            $('#live-dns-run',p).onclick=run;
            $('#live-dns-name',p).onkeydown=e=>{if(e.key==='Enter')run();};
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
    return () => { if (playTimer) clearInterval(playTimer); tabs.destroy(); };
  },
});
