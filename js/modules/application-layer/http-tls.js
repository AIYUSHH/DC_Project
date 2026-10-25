/**
 * learning module: HTTP and TLS
 *
 * HTTP requests/responses, a TLS handshake ladder, a live key exchange and encryption demo using the Web Crypto API, and a page-load waterfall.
 *
 * This file registers one learning module with regMod(). Its mount(root) function builds the screen inside
 * `root` and attaches event handlers; the function mount() returns (if any) is its cleanup, called by the router
 * when the learner leaves, so timers and listeners do not outlive the screen. The protocol logic lives in
 * ../../simulations/ and ../../core/; this file is the user interface for it.
 *
 * Imports:
 *   - ../../core/utils.js (tiny DOM, math and timing helpers): $, $$, esc
 *   - ../../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): chipRow, hn, ladder, panel, sel, statRow, tabset, tbl, vd
 *   - ../../core/encoding.js (bytes, hex, bits and UTF-8 helpers): bytesOf, dec, enc, hex, hexs
 *   - ../../simulations/http-tls.js (simulated web server for the HTTP and TLS module): HTTP_ROUTES, STATUS_CLASS, STATUS_TEXT, httpServe
 *   - ../registry.js (learning-module registry and group definitions): regMod
 *   - ../../app/progress.js (achievements, flags and statistics): flag
 *
 * Exports: (none)
 *
 * Used by: (imported only for its side effects by app.js)
 */

import { bytesOf, dec, enc, hex, hexs } from '../../core/encoding.js';
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
import { $, $$, esc } from '../../core/utils.js';
import { HTTP_ROUTES, httpServe, STATUS_CLASS, STATUS_TEXT } from '../../simulations/http-tls.js';
import { regMod } from '../registry.js';
import { flag } from '../../app/progress.js';

/**
 * Syntax-highlights raw HTTP text: the first line gets class "hs", header names get class "hk". Text is escaped first.
 */
const colorHttp = txt =>
  esc(txt)
    .split('\r\n')
    .map((l, i) =>
      i === 0
        ? `<span class="hs">${l}</span>`
        : /^[A-Za-z-]+: /.test(l)
          ? l.replace(/^([A-Za-z-]+):/, '<span class="hk">$1</span>:')
          : l
    )
    .join('\n');

/* Register "HTTP and TLS". The router calls mount(root) when the learner opens #/m/http and calls the returned function (if any) when they leave. */
regMod({
  id: 'http',
  group: 'app',
  title: 'HTTP and TLS',
  desc: 'Send real-looking requests to a pretend server, follow the TLS handshake, derive a shared key, and compare page-load timelines.',
  obj: [
    'Read a request and response, including status codes and redirects.',
    'Compare the TLS 1.2, TLS 1.3 and resumption handshakes.',
    'Perform an actual ECDH key agreement and AES-GCM encryption in your browser.',
  ],
  mount(root) {
    root.innerHTML = '<div id="httabs"></div>';
    const tabs = tabset(
      $('#httabs', root),
      [
        {
          label: 'Request and response',
          render(p) {
            p.innerHTML =
              panel(
                'Compose a request',
                `<div class="controls"><div class="field"><label for="hm">Method</label>${sel(
                  'hm',
                  ['GET', 'POST', 'HEAD', 'DELETE'].map(x => [x, x]),
                  'GET'
                )}</div>
          <div class="field grow"><label for="hpth">Path</label><input id="hpth" type="text" value="/about" list="hpl" spellcheck="false"><datalist id="hpl">${Object.keys(
            HTTP_ROUTES
          )
            .map(x => `<option value="${x}">`)
            .join('')}<option value="/missing"></datalist></div>
          <div class="field"><label for="hh">Host</label><input id="hh" type="text" value="example.com"></div></div>
          <div class="field" id="hbw" hidden><label for="hb">Body</label><textarea id="hb" rows="2" spellcheck="false">{"name":"Grace"}</textarea></div>
          <div class="presets" id="hs">${['/', '/about', '/old', '/api/users', '/secret', '/missing', '/error'].map(x => `<button class="chipbtn">${x}</button>`).join('')}</div>
          <label class="check"><input type="checkbox" id="hf" checked> Follow redirects</label><div class="btnrow"><button class="btn" id="hgo">Send request</button></div>`
              ) + '<div id="hout"></div>';
            const f = () => {
              let method = $('#hm', p).value,
                path = $('#hpth', p).value.trim() || '/',
                host = $('#hh', p).value.trim() || 'example.com',
                body = $('#hb', p).value;
              $('#hbw', p).hidden = method !== 'POST';
              const rounds = [];
              for (let i = 0; i < 3; i++) {
                const bt = method === 'POST' ? body : '',
                  req =
                    [
                      `${method} ${path} HTTP/1.1`,
                      `Host: ${host}`,
                      'User-Agent: DataCommsLab/2.0',
                      'Accept: */*',
                      ...(bt
                        ? [
                            'Content-Type: application/json',
                            `Content-Length: ${bytesOf(bt).length}`,
                          ]
                        : []),
                      'Connection: keep-alive',
                    ].join('\r\n') +
                    '\r\n\r\n' +
                    bt;
                const res = httpServe(method, path, bt);
                rounds.push({ req, res, path });
                if (res.code === 301 && $('#hf', p).checked && res.headers.Location) {
                  path = res.headers.Location;
                  method = 'GET';
                } else break;
              }
              $('#hout', p).innerHTML = rounds
                .map((r, i) =>
                  panel(
                    rounds.length > 1 ? `Exchange ${i + 1}` : 'Exchange',
                    `<div class="cols2"><div><h4>Request</h4><pre class="http">${colorHttp(r.req)}</pre></div><div><h4>Response</h4><pre class="http">${colorHttp(r.res.text)}</pre></div></div>` +
                      vd(
                        r.res.code < 300 ? 'ok' : r.res.code < 400 ? 'info' : 'bad',
                        `${r.res.code} ${STATUS_TEXT[r.res.code] || ''}.`,
                        (STATUS_CLASS[Math.floor(r.res.code / 100)] || '') +
                          (r.res.code === 301
                            ? ` The Location header says to try ${esc(r.res.headers.Location)}.`
                            : '') +
                          (r.res.code === 401
                            ? ' The WWW-Authenticate header asks for credentials.'
                            : '') +
                          (r.res.code === 405
                            ? ' The Allow header lists the methods this path accepts.'
                            : '')
                      )
                  )
                )
                .join('');
            };
            $$('input,select,textarea', p).forEach(e => {
              e.oninput = f;
              e.onchange = f;
            });
            $('#hs', p).onclick = e => {
              const b = e.target.closest('.chipbtn');
              if (b) {
                $('#hpth', p).value = b.textContent;
                f();
              }
            };
            $('#hgo', p).onclick = f;
            f();
          },
        },
        {
          label: 'TLS handshake',
          render(p) {
            const SC = {
              t12: {
                name: 'TLS 1.2, full handshake',
                rtt: 2,
                msgs: [
                  ['lr', 'ClientHello', 'c0'],
                  ['rl', 'ServerHello, Certificate, ServerKeyExchange, ServerHelloDone', 'c2'],
                  ['lr', 'ClientKeyExchange, ChangeCipherSpec, Finished', 'c0'],
                  ['rl', 'ChangeCipherSpec, Finished', 'c2'],
                  ['lr', 'Encrypted HTTP request', 'c3'],
                ],
                info: [
                  ['ClientHello', 'Offers versions, cipher suites and a random value.'],
                  [
                    'ServerHello + Certificate',
                    'Picks the options and proves who the server is with a certificate chain.',
                  ],
                  [
                    'ClientKeyExchange',
                    'Contributes its half of the key agreement. Both sides now derive session keys.',
                  ],
                  [
                    'Finished',
                    'Each side proves it derived the same keys by MACing the whole handshake.',
                  ],
                ],
              },
              t13: {
                name: 'TLS 1.3, full handshake',
                rtt: 1,
                msgs: [
                  ['lr', 'ClientHello + key share', 'c0'],
                  ['rl', 'ServerHello + key share, {Certificate, Finished}', 'c2'],
                  ['lr', '{Finished} + encrypted HTTP request', 'c3'],
                ],
                info: [
                  [
                    'ClientHello + key share',
                    'The client guesses the key-agreement group and sends its public value immediately.',
                  ],
                  [
                    'ServerHello',
                    'The server replies with its public value. From here on everything is encrypted, including the certificate.',
                  ],
                  [
                    'Finished',
                    'One round trip after the first message, the client already sends application data.',
                  ],
                ],
              },
              t13r: {
                name: 'TLS 1.3, resumption with 0-RTT',
                rtt: 0,
                msgs: [
                  ['lr', 'ClientHello + early data (HTTP request)', 'c3'],
                  ['rl', 'ServerHello, Finished, response', 'c2'],
                ],
                info: [
                  [
                    'Early data',
                    'Using a key from an earlier session, the request travels with the first message. This saves a round trip but can be replayed by an attacker, so it is only safe for harmless requests.',
                  ],
                ],
              },
            };
            p.innerHTML = panel(
              'Handshake',
              `<div class="controls"><div class="field"><label for="tv">Scenario</label>${sel(
                'tv',
                Object.keys(SC).map(k => [k, SC[k].name]),
                't13'
              )}</div></div><div id="tvo"></div>`
            );
            const f = () => {
              const s = SC[$('#tv', p).value];
              const msgs = s.msgs.map((m, i) => ({
                t0: i * 1.3,
                t1: i * 1.3 + 1,
                dir: m[0],
                label: m[1].length > 44 ? m[1].slice(0, 41) + '…' : m[1],
                cls: m[2],
                idx: i,
              }));
              $('#tvo', p).innerHTML =
                ladder({ left: 'Client', right: 'Server', msgs, w: 760, maxH: 300 }) +
                statRow([
                  [s.rtt, 'round trips before data'],
                  [
                    s.rtt === 0 ? 'with the first message' : 'after the handshake',
                    'application data flows',
                  ],
                ]) +
                tbl(['Message', 'What it does'], s.info) +
                hn(
                  'Messages in { } are encrypted. Full labels: ' + s.msgs.map(m => m[1]).join(' / ')
                );
            };
            $('#tv', p).onchange = f;
            f();
          },
        },
        {
          label: 'Key agreement (live)',
          render(p) {
            const ok = typeof crypto !== 'undefined' && crypto.subtle;
            p.innerHTML = panel(
              'Elliptic-curve Diffie–Hellman in your browser',
              ok
                ? `<p class="hint">Both sides create a key pair, swap only the public halves, and each derives the same secret. Then the secret protects a message with AES-GCM. This uses your browser’s real Web Crypto API.</p>
          <div class="btnrow"><button class="btn" id="kx">Run key exchange</button></div><div id="kxo"></div>
          <div id="kxm" hidden><div class="controls"><div class="field grow"><label for="km">Message to protect</label><input id="km" type="text" value="Meet at noon" spellcheck="false"></div><div class="btnrow"><button class="btn" id="ken">Encrypt and send</button><button class="btn ghost" id="ktam">Tamper with one bit</button></div></div><div id="kmo"></div></div>`
                : vd(
                    'warn',
                    'Web Crypto is not available here.',
                    'Browsers only expose it on https:// pages and on localhost. Serve this folder with a local web server to use this tab.'
                  )
            );
            if (!ok) return;
            let K = null;
            const fp = a => hexs(Array.from(a).slice(0, 8), ':');
            $('#kx', p).onclick = async () => {
              const gen = () =>
                // Web Crypto API: each side makes an ECDH key pair on the P-256 curve. Only the
                // PUBLIC halves would ever cross the network.
                crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
                  'deriveKey',
                ]);
              const c = await gen(),
                s = await gen(),
                use = ['encrypt', 'decrypt'];
              const ck = await crypto.subtle.deriveKey(
                // Key agreement: the client combines ITS private key with the SERVER's public key
                // (and the server does the mirror image below). Both arrive at the same secret,
                // which becomes an AES-256-GCM key.
                { name: 'ECDH', public: s.publicKey },
                c.privateKey,
                { name: 'AES-GCM', length: 256 },
                true,
                use
              );
              const sk = await crypto.subtle.deriveKey(
                { name: 'ECDH', public: c.publicKey },
                s.privateKey,
                { name: 'AES-GCM', length: 256 },
                true,
                use
              );
              const raw = async k => new Uint8Array(await crypto.subtle.exportKey('raw', k)),
                print = async k =>
                  new Uint8Array(await crypto.subtle.digest('SHA-256', await raw(k)));
              const cp = new Uint8Array(await crypto.subtle.exportKey('raw', c.publicKey)),
                sp = new Uint8Array(await crypto.subtle.exportKey('raw', s.publicKey));
              const cf = await print(ck),
                sf = await print(sk),
                same = fp(cf) === fp(sf);
              K = { ck, sk };
              if (same) flag('ecdh');
              $('#kxo', p).innerHTML =
                tbl(
                  ['', 'Client', 'Server'],
                  [
                    [
                      'Public key sent (65 bytes)',
                      { h: `<code>${hexs(Array.from(cp).slice(0, 10), '')}…</code>` },
                      { h: `<code>${hexs(Array.from(sp).slice(0, 10), '')}…</code>` },
                    ],
                    ['Private key', 'never leaves the device', 'never leaves the device'],
                    [
                      'Derived key fingerprint (SHA-256)',
                      { h: `<code>${fp(cf)}</code>` },
                      { h: `<code>${fp(sf)}</code>` },
                    ],
                  ]
                ) +
                (same
                  ? vd(
                      'ok',
                      'Both sides derived the same key.',
                      'An eavesdropper saw both public keys but cannot compute the shared secret without one of the private keys.'
                    )
                  : vd('bad', 'Keys differ.', 'Something went wrong.'));
              $('#kxm', p).hidden = false;
              $('#kmo', p).innerHTML = '';
            };
            const send = async tamper => {
              if (!K) return;
              // AES-GCM needs a fresh 12-byte nonce (IV) for every message; it is sent along with
              // the ciphertext.
              const iv = crypto.getRandomValues(new Uint8Array(12)),
                pt = enc.encode($('#km', p).value);
              const ct = new Uint8Array(
                await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, K.ck, pt)
              );
              const rx = ct.slice();
              // Simulate an attacker: flip one bit of the ciphertext. GCM's authentication tag
              // will make decryption fail, proving the message was altered.
              if (tamper) rx[0] ^= 1;
              let res;
              try {
                res = dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, K.sk, rx));
              } catch (e) {
                res = null;
              }
              $('#kmo', p).innerHTML =
                hn('Nonce (12 bytes) and ciphertext with its 16-byte authentication tag') +
                chipRow([...Array.from(iv), ...Array.from(rx)].map(hex), i =>
                  i < 12 ? 'c3' : i >= rx.length + 12 - 16 ? 'c2' : tamper && i === 12 ? 'c1' : 'c0'
                ) +
                (res !== null
                  ? vd(
                      'ok',
                      'Server decrypted: “' + esc(res) + '”',
                      'The authentication tag checked out, so the message is both secret and unmodified.'
                    )
                  : vd(
                      'bad',
                      'Decryption refused.',
                      'One flipped bit makes the authentication tag fail. AES-GCM detects tampering instead of returning garbage.'
                    ));
            };
            $('#ken', p).onclick = () => send(false);
            $('#ktam', p).onclick = () => send(true);
          },
        },
        {
          label: 'Page load timeline',
          render(p) {
            p.innerHTML = panel(
              'How long does a page take?',
              `<div class="controls"><div class="field"><label for="wr">Round-trip time</label><input id="wr" type="range" min="10" max="300" step="10" value="80"><b id="wrv"></b></div>
          <div class="field"><label for="wp">Protocol stack</label>${sel(
            'wp',
            [
              ['h1', 'HTTP/1.1 over TLS 1.2'],
              ['h2', 'HTTP/2 over TLS 1.3'],
              ['h3', 'HTTP/3 (QUIC)'],
            ],
            'h1'
          )}</div></div><div id="wo"></div>`,
              'One HTML file and five sub-resources (CSS, scripts, images) from the same server. Every phase is measured in round trips.'
            );
            const f = () => {
              const r = +$('#wr', p).value,
                proto = $('#wp', p).value,
                think = 20;
              $('#wrv', p).textContent = ' ' + r + ' ms';
              const dns = r * 0.8,
                tcp = proto === 'h3' ? 0 : r,
                tls = proto === 'h1' ? 2 * r : proto === 'h2' ? r : r,
                req = r + think;
              const rows = [];
              let t = 0;
              const seg = (label, cls, st, d) => ({ label, cls, st, d });
              const main = [seg('DNS', 'c3', 0, dns)];
              t = dns;
              if (proto !== 'h3') {
                main.push(seg('TCP', 'c4', t, tcp));
                t += tcp;
              }
              main.push(seg(proto === 'h3' ? 'QUIC + TLS' : 'TLS', 'c1', t, tls));
              t += tls;
              main.push(seg('Request', 'c0', t, req));
              t += req;
              rows.push(['index.html', main]);
              const T1 = t;
              for (let i = 1; i <= 5; i++) {
                const row = [];
                let s = T1;
                if (proto === 'h1' && i > 1) {
                  row.push(seg('TCP', 'c4', s, r));
                  s += r;
                  row.push(seg('TLS', 'c1', s, 2 * r));
                  s += 2 * r;
                }
                row.push(seg('Request', 'c0', s, req));
                rows.push([
                  ['style.css', 'app.js', 'logo.png', 'font.woff2', 'hero.jpg'][i - 1],
                  row,
                ]);
              }
              const end = Math.max(
                  ...rows.map(([, segs]) => segs[segs.length - 1].st + segs[segs.length - 1].d)
                ),
                W = 680,
                L = 90,
                sc = (W - L - 10) / end;
              let s = `<svg class="chart" viewBox="0 0 ${W} ${rows.length * 30 + 44}" role="img" aria-label="Page load waterfall">`;
              rows.forEach(([name, segs], i) => {
                s += `<text class="ax" x="${L - 6}" y="${i * 30 + 25}" text-anchor="end">${name}</text>`;
                segs.forEach(g => {
                  s += `<rect class="wf ${g.cls}" x="${L + g.st * sc}" y="${i * 30 + 12}" width="${Math.max(2, g.d * sc)}" height="18" rx="3"><title>${g.label}: ${Math.round(g.d)} ms</title></rect>`;
                  if (g.d * sc > 38)
                    s += `<text class="wft" x="${L + g.st * sc + 5}" y="${i * 30 + 25}">${g.label}</text>`;
                });
              });
              s += `<text class="ax" x="${L}" y="${rows.length * 30 + 30}">0 ms</text><text class="ax" x="${W - 10}" y="${rows.length * 30 + 30}" text-anchor="end">${Math.round(end)} ms</text></svg>`;
              $('#wo', p).innerHTML =
                s +
                statRow([
                  [Math.round(T1) + ' ms', 'HTML received'],
                  [Math.round(end) + ' ms', 'whole page loaded'],
                  [Math.round((end / r) * 10) / 10, 'round trips in total'],
                ]) +
                hn(
                  {
                    h1: 'HTTP/1.1 needs a new TCP and TLS 1.2 handshake for each extra connection, which adds three round trips before the extra files can even be requested.',
                    h2: 'HTTP/2 multiplexes all requests over one connection and TLS 1.3 needs only one round trip, so the five files travel together.',
                    h3: 'HTTP/3 runs over QUIC, which merges the transport and TLS handshakes into a single round trip and avoids head-of-line blocking.',
                  }[proto]
                );
            };
            $('#wr', p).oninput = f;
            $('#wp', p).onchange = f;
            f();
          },
        },
      ],
      0
    );
    return () => tabs.destroy();
  },
});
