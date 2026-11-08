/**
 * Live Network Inventory — a visual, interactive view of OS-reported local network state.
 * Data comes from the optional loopback agent. The visual map is explanatory, not a packet trace.
 */
import { regMod } from '../registry.js';
import { $, esc } from '../../core/utils.js';

const ENDPOINT = 'http://127.0.0.1:8765/api/network';
const safe = value => esc(value == null || value === '' ? '—' : value);
const addressList = item => (item.addresses || []).map(a => (a.address || '') + (a.prefix == null ? '' : '/' + a.prefix)).filter(Boolean);
const signalNumber = value => {
  const n = Number.parseInt(String(value || '').replace('%', ''), 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
};

regMod({
  id: 'live-network-inventory',
  group: 'net',
  title: 'Live network inventory',
  desc: 'Explore this computer’s live interfaces, gateway, neighbour cache and Wi-Fi connection.',
  obj: [
    'Inspect interface addresses, default routes and neighbour-cache entries.',
    'Relate local OS network information to a clearly labelled network diagram.',
    'Understand what a neighbour cache can and cannot reveal about a network.',
  ],
  mount(root) {
    let controller = null;
    let snapshot = null;
    let activeTab = 'overview';
    let selectedInterface = null;
    let autoTimer = null;
    let neighbourQuery = '';
    let refreshBusy = false;

    root.innerHTML = `
      <section class="lni">
        <header class="lni-hero">
          <div class="lni-hero-copy">
            <div class="lni-kicker"><span class="lni-kicker-dot"></span> NETWORK LAYER / LIVE INSPECTION</div>
            <h2>Your network, <span>in real time.</span></h2>
            <p>Explore the network information your operating system already knows. Read-only, local and visual.</p>
            <div class="lni-hero-actions">
              <button class="btn lni-primary" id="lni-refresh" type="button"><span aria-hidden="true">↻</span> Scan local state</button>
              <button class="btn ghost" id="lni-auto" type="button" aria-pressed="false">◷ Auto refresh: off</button>
              <span class="lni-updated" id="lni-updated">Waiting for local agent</span>
            </div>
          </div>
          <div class="lni-hero-orb" aria-hidden="true">
            <div class="lni-orbit lni-orbit-one"></div><div class="lni-orbit lni-orbit-two"></div>
            <div class="lni-orb-core">⌁</div><i class="lni-orb-node n1"></i><i class="lni-orb-node n2"></i><i class="lni-orb-node n3"></i>
          </div>
        </header>

        <div class="lni-connection" id="lni-status" role="status" aria-live="polite">
          <span class="lni-status-indicator"></span><span id="lni-status-text">Local agent not connected</span>
          <span class="lni-status-side">127.0.0.1:8765</span>
        </div>

        <div class="lni-empty" id="lni-empty">
          <div class="lni-empty-art" aria-hidden="true"><span>⌘</span><i></i><b></b></div>
          <h3>Ready to map your local network?</h3>
          <p>Start the optional Python agent on this computer, then press <strong>Scan local state</strong>.</p>
          <div class="lni-command"><code>python3 tools/network-agent/network_agent.py</code><button type="button" id="lni-copy-command" aria-label="Copy start command">Copy</button></div>
          <small>The helper listens only on your computer. It does not scan or modify your network.</small>
        </div>

        <div id="lni-dashboard" hidden>
          <div class="lni-metrics" id="lni-metrics"></div>

          <section class="lni-panel lni-map-panel">
            <div class="lni-section-head"><div><span class="lni-eyebrow">NETWORK OVERVIEW</span><h3>Local network map</h3><p>Relationships inferred from your OS routing and neighbour tables.</p></div><span class="lni-live-pill"><i></i> LIVE DATA</span></div>
            <div class="lni-map" id="lni-map"></div>
            <div class="lni-map-legend"><span><i class="legend-host"></i> This computer</span><span><i class="legend-gateway"></i> Default gateway</span><span><i class="legend-peer"></i> Cached neighbour</span><span class="lni-map-caveat">Dashed links show logical association, not measured physical cables.</span></div>
          </section>

          <nav class="lni-tabs" aria-label="Network details">
            <button type="button" data-tab="overview" class="is-active">◈ Overview</button>
            <button type="button" data-tab="interfaces">▤ Interfaces <b id="lni-tab-interfaces">0</b></button>
            <button type="button" data-tab="routes">⇢ Routes <b id="lni-tab-routes">0</b></button>
            <button type="button" data-tab="neighbours">⌘ Neighbours <b id="lni-tab-neighbours">0</b></button>
          </nav>

          <section class="lni-view" id="lni-view-overview">
            <div class="lni-section-head"><div><span class="lni-eyebrow">YOUR HARDWARE CONNECTIONS</span><h3>Network interfaces</h3><p>Select an interface to inspect its addresses and status.</p></div><button class="lni-text-btn" type="button" data-open-tab="interfaces">View all ↗</button></div>
            <div class="lni-interface-grid" id="lni-interface-cards"></div>
            <div class="lni-lower-grid">
              <section class="lni-panel"><div class="lni-section-head compact"><div><span class="lni-eyebrow">NEXT HOP</span><h3>Default gateway</h3></div><span class="lni-icon-chip">⇢</span></div><div id="lni-gateway-card"></div></section>
              <section class="lni-panel"><div class="lni-section-head compact"><div><span class="lni-eyebrow">WIRELESS</span><h3>Wi-Fi connection</h3></div><span class="lni-icon-chip">⌁</span></div><div id="lni-wifi-card"></div></section>
            </div>
          </section>

          <section class="lni-view" id="lni-view-interfaces" hidden>
            <div class="lni-section-head"><div><span class="lni-eyebrow">DEVICE CONNECTIVITY</span><h3>Interface explorer</h3><p>Choose an interface to inspect its OS-reported properties.</p></div></div>
            <div class="lni-interface-explorer"><div class="lni-interface-list" id="lni-interface-list"></div><div class="lni-interface-detail" id="lni-interface-detail"></div></div>
          </section>

          <section class="lni-view" id="lni-view-routes" hidden>
            <div class="lni-section-head"><div><span class="lni-eyebrow">PATH SELECTION</span><h3>Routing table</h3><p>The default route is the fallback when no more specific route matches.</p></div></div>
            <div class="lni-route-list" id="lni-route-list"></div>
          </section>

          <section class="lni-view" id="lni-view-neighbours" hidden>
            <div class="lni-section-head"><div><span class="lni-eyebrow">LOCAL LINK DISCOVERY</span><h3>Neighbour cache</h3><p>IP-to-MAC mappings already cached by your operating system.</p></div><label class="lni-filter"><span>⌕</span><input id="lni-neighbour-filter" type="search" placeholder="Filter IP, MAC or interface" aria-label="Filter neighbours"></label></div>
            <div class="lni-neighbour-grid" id="lni-neighbour-grid"></div>
            <p class="lni-note">A cache entry means your computer recently resolved or observed that neighbour. It is not proof that the device is currently online, and the cache is not a complete network inventory.</p>
          </section>
        </div>

        <footer class="lni-footer"><span>◉ DATA SOURCE: LOCAL OPERATING SYSTEM</span><span>READ-ONLY · NO HOST SCANS · NO CONFIGURATION CHANGES</span></footer>
      </section>`;

    const $in = selector => $(selector, root);
    const setStatus = (message, state = '') => {
      $in('#lni-status').className = 'lni-connection' + (state ? ' is-' + state : '');
      $in('#lni-status-text').textContent = message;
    };
    const setTab = tab => {
      activeTab = tab;
      root.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('is-active', button.dataset.tab === tab));
      root.querySelectorAll('.lni-view').forEach(panel => { panel.hidden = panel.id !== 'lni-view-' + tab; });
    };
    const empty = message => '<div class="lni-empty-state">' + safe(message) + '</div>';

    function renderMetrics(data) {
      const items = [
        ['⌗', data.interfaces.length, 'Interfaces', 'OS network adapters'],
        ['⇢', data.default_routes.length, 'Default routes', 'Fallback next hops'],
        ['⌘', data.neighbours.length, 'Cached peers', 'Neighbour-cache entries'],
        ['⌁', data.wifi.length, 'Wi-Fi links', 'Current connection details'],
      ];
      $in('#lni-metrics').innerHTML = items.map((item, i) => `
        <button class="lni-metric" type="button" data-metric-tab="${['interfaces','routes','neighbours','overview'][i]}">
          <span class="lni-metric-icon">${item[0]}</span><strong>${safe(item[1])}</strong><b>${item[2]}</b><small>${item[3]}</small>
        </button>`).join('');
      $in('#lni-tab-interfaces').textContent = data.interfaces.length;
      $in('#lni-tab-routes').textContent = data.default_routes.length;
      $in('#lni-tab-neighbours').textContent = data.neighbours.length;
    }

    function renderMap(data) {
      const gateway = data.default_routes.find(route => route.gateway)?.gateway;
      const peers = data.neighbours.slice(0, 6);
      const peerNodes = peers.map((peer, i) => {
        const x = 535 + (i % 3) * 78, y = 78 + Math.floor(i / 3) * 105;
        return `<path class="lni-map-link peer-link" d="M 380 132 Q 455 132 ${x} ${y + 18}"/><g class="lni-svg-node peer-node" transform="translate(${x},${y})"><rect width="68" height="42" rx="9"/><text x="34" y="17">PEER ${i + 1}</text><text class="node-sub" x="34" y="30">${safe(peer.address || 'Unknown').slice(0,17)}</text></g>`;
      }).join('');
      const hostIps = data.interfaces.flatMap(addressList).filter(Boolean).slice(0, 2);
      const gatewayNode = gateway
        ? `<path class="lni-map-link gateway-link" d="M 185 132 H 265"/><g class="lni-svg-node gateway-node" transform="translate(265,101)"><rect width="115" height="62" rx="12"/><text x="57" y="25">GATEWAY</text><text class="node-sub" x="57" y="42">${safe(gateway).slice(0,19)}</text></g>`
        : `<g class="lni-svg-node unknown-node" transform="translate(265,101)"><rect width="115" height="62" rx="12"/><text x="57" y="27">NO ROUTE</text><text class="node-sub" x="57" y="43">reported</text></g>`;
      $in('#lni-map').innerHTML = `
        <svg viewBox="0 0 790 260" role="img" aria-label="Logical view of this computer, its local network and cached neighbours">
          <defs><linearGradient id="lni-wire" x1="0" x2="1"><stop offset="0" stop-color="var(--lni-accent)"/><stop offset="1" stop-color="var(--lni-cyan)"/></linearGradient></defs>
          <path class="lni-map-link host-link" d="M 150 132 H 185"/><path class="lni-map-link lan-link" d="M 380 132 H 495"/>
          ${gatewayNode}
          <g class="lni-svg-node host-node" transform="translate(25,101)"><rect width="125" height="62" rx="12"/><text x="62" y="24">THIS DEVICE</text><text class="node-sub" x="62" y="41">${safe(hostIps[0] || 'IP unavailable').slice(0,20)}</text></g>
          <g class="lni-lan-label" transform="translate(420,108)"><rect width="74" height="48" rx="9"/><text x="37" y="20">LOCAL</text><text x="37" y="33">LINK</text></g>
          ${peerNodes}
          <text class="lni-map-caption" x="25" y="218">OS-REPORTED RELATIONSHIPS · NOT A PHYSICAL TOPOLOGY</text>
          <circle class="lni-pulse" r="5"><animateMotion dur="3.4s" repeatCount="indefinite" path="M 150 132 H 185 H 265 H 380 H 495"/></circle>
        </svg>`;
      if (!peers.length) $in('#lni-map').insertAdjacentHTML('beforeend', '<p class="lni-map-empty">No neighbour-cache entries are currently reported.</p>');
      else if (data.neighbours.length > peers.length) $in('#lni-map').insertAdjacentHTML('beforeend', `<p class="lni-map-empty">Showing 6 of ${data.neighbours.length} cached neighbours. Open the Neighbours tab for all entries.</p>`);
    }

    function renderOverview(data) {
      const interfaces = data.interfaces;
      $in('#lni-interface-cards').innerHTML = interfaces.length ? interfaces.map((item, index) => `
        <button class="lni-interface-card" type="button" data-interface-index="${index}">
          <span class="lni-interface-symbol">${item.name?.toLowerCase().includes('wl') || item.name?.toLowerCase().includes('wi-fi') ? '⌁' : '▤'}</span>
          <span class="lni-interface-card-main"><strong>${safe(item.name)}</strong><small>${safe(item.state)} · ${safe(item.mac || 'MAC unavailable')}</small><span class="lni-ip-line">${safe(addressList(item).join(' · ') || 'No IP address reported')}</span></span>
          <span class="lni-card-arrow">↗</span>
        </button>`).join('') : empty('No interfaces were returned by the operating system.');
      const gateway = data.default_routes.find(route => route.gateway);
      $in('#lni-gateway-card').innerHTML = gateway
        ? `<div class="lni-feature-value">${safe(gateway.gateway)}</div><div class="lni-feature-meta">${safe(gateway.interface || 'Interface unavailable')} · default route</div>`
        : empty('No default gateway was reported.');
      const wifi = data.wifi[0];
      const signal = wifi ? signalNumber(wifi.signal_percent) : null;
      $in('#lni-wifi-card').innerHTML = wifi
        ? `<div class="lni-feature-value">${safe(wifi.ssid || 'Connected Wi-Fi')}</div><div class="lni-feature-meta">${safe(wifi.interface || 'Wireless interface')} · ${safe(wifi.state || 'Current connection')}</div>${signal == null ? '' : `<div class="lni-signal"><span style="width:${signal}%"></span></div><small class="lni-signal-caption">Reported signal strength: ${signal}%</small>`}`
        : empty('No current Wi-Fi connection details were exposed by the OS.');
    }

    function renderInterfaces(data) {
      $in('#lni-interface-list').innerHTML = data.interfaces.length ? data.interfaces.map((item, index) => `
        <button type="button" class="lni-interface-choice ${selectedInterface === index ? 'is-selected' : ''}" data-select-interface="${index}">
          <span>${item.name?.toLowerCase().includes('wl') ? '⌁' : '▤'}</span><b>${safe(item.name)}</b><small>${safe(item.state)}</small>
        </button>`).join('') : empty('No interfaces found.');
      const item = data.interfaces[selectedInterface] || data.interfaces[0];
      if (item) selectedInterface = data.interfaces.indexOf(item);
      $in('#lni-interface-detail').innerHTML = item ? `
        <div class="lni-detail-head"><span class="lni-interface-symbol large">▤</span><div><span class="lni-eyebrow">SELECTED INTERFACE</span><h3>${safe(item.name)}</h3><p>${safe(item.state)}</p></div></div>
        <div class="lni-detail-grid"><div><small>MAC address</small><b>${safe(item.mac)}</b></div><div><small>Operational state</small><b>${safe(item.state)}</b></div></div>
        <h4>Assigned IP addresses</h4>${(item.addresses || []).length ? item.addresses.map(address => `<div class="lni-address-row"><span>${safe(address.family || 'IP')}</span><code>${safe(address.address)}${address.prefix == null ? '' : '/' + safe(address.prefix)}</code><button type="button" data-copy-value="${safe(address.address)}">Copy</button></div>`).join('') : empty('No IP addresses reported for this interface.')}`
        : empty('Select an interface to inspect its properties.');
    }

    function renderRoutes(data) {
      $in('#lni-route-list').innerHTML = data.default_routes.length ? data.default_routes.map((route, index) => `
        <article class="lni-route-card"><span class="lni-route-index">${String(index + 1).padStart(2,'0')}</span><div class="lni-route-flow"><div><small>DESTINATION</small><b>${safe(route.destination || 'default')}</b></div><span>→</span><div><small>NEXT HOP</small><b>${safe(route.gateway || 'Direct / unspecified')}</b></div><span>→</span><div><small>INTERFACE</small><b>${safe(route.interface)}</b></div></div><span class="lni-route-tag">ROUTE</span></article>`).join('') : empty('The operating system did not report a default route.');
    }

    function renderNeighbours(data) {
      const query = neighbourQuery.trim().toLowerCase();
      const filtered = data.neighbours.filter(item => [item.address,item.mac,item.interface,item.state].some(value => String(value || '').toLowerCase().includes(query)));
      $in('#lni-neighbour-grid').innerHTML = filtered.length ? filtered.map((item, index) => `
        <article class="lni-neighbour-card"><div class="lni-neighbour-top"><span class="lni-neighbour-icon">⌘</span><span class="lni-neighbour-state">${safe(item.state || 'Cached')}</span></div><strong>${safe(item.address)}</strong><code>${safe(item.mac)}</code><div class="lni-neighbour-meta"><span>INTERFACE</span><b>${safe(item.interface)}</b></div><button type="button" data-copy-value="${safe(item.address)}">Copy IP</button></article>`).join('') : empty(query ? 'No cached neighbours match that filter.' : 'No neighbour-cache entries were reported.');
    }

    function render(data) {
      snapshot = data;
      $in('#lni-empty').hidden = true;
      $in('#lni-dashboard').hidden = false;
      renderMetrics(data);
      renderMap(data);
      renderOverview(data);
      renderInterfaces(data);
      renderRoutes(data);
      renderNeighbours(data);
      setTab(activeTab);
    }

    async function refresh() {
      if (refreshBusy) return;
      refreshBusy = true;
      controller?.abort();
      controller = new AbortController();
      $in('#lni-refresh').disabled = true;
      setStatus('Reading network information from your operating system…', 'loading');
      try {
        const response = await fetch(ENDPOINT, { method: 'GET', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Agent returned HTTP ' + response.status);
        const data = await response.json();
        if (!data.ok) throw new Error(data.error || 'Agent could not collect network data.');
        render(data);
        setStatus('Connected · ' + data.platform + ' · local OS data received', 'ok');
        $in('#lni-updated').textContent = 'Updated ' + new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
      } catch (error) {
        if (error.name === 'AbortError') return;
        setStatus('Cannot reach the local agent. Start it and try again.', 'error');
        if (!snapshot) $in('#lni-empty').hidden = false;
      } finally {
        refreshBusy = false;
        $in('#lni-refresh').disabled = false;
      }
    }

    root.addEventListener('click', event => {
      const tab = event.target.closest('[data-tab],[data-open-tab]');
      if (tab) { setTab(tab.dataset.tab || tab.dataset.openTab); return; }
      const metric = event.target.closest('[data-metric-tab]');
      if (metric) { setTab(metric.dataset.metricTab); return; }
      const interfaceCard = event.target.closest('[data-interface-index]');
      if (interfaceCard) {
        selectedInterface = Number(interfaceCard.dataset.interfaceIndex);
        setTab('interfaces');
        if (snapshot) renderInterfaces(snapshot);
        return;
      }
      const choice = event.target.closest('[data-select-interface]');
      if (choice) {
        selectedInterface = Number(choice.dataset.selectInterface);
        if (snapshot) renderInterfaces(snapshot);
        return;
      }
      const copy = event.target.closest('[data-copy-value]');
      if (copy) {
        const value = copy.dataset.copyValue;
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(value).then(() => { copy.textContent = 'Copied ✓'; }).catch(() => { copy.textContent = value; });
        } else copy.textContent = value;
      }
    });

    $in('#lni-refresh').addEventListener('click', refresh);
    $in('#lni-auto').addEventListener('click', event => {
      if (autoTimer) {
        clearInterval(autoTimer); autoTimer = null;
        event.currentTarget.textContent = '◷ Auto refresh: off';
        event.currentTarget.setAttribute('aria-pressed', 'false');
      } else {
        autoTimer = setInterval(() => { if (!document.hidden) refresh(); }, 10000);
        event.currentTarget.textContent = '◷ Auto refresh: 10s';
        event.currentTarget.setAttribute('aria-pressed', 'true');
        refresh();
      }
    });
    $in('#lni-neighbour-filter').addEventListener('input', event => {
      neighbourQuery = event.target.value;
      if (snapshot) renderNeighbours(snapshot);
    });
    $in('#lni-copy-command').addEventListener('click', event => {
      const command = 'python3 tools/network-agent/network_agent.py';
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(command).then(() => { event.currentTarget.textContent = 'Copied ✓'; });
    });
    return () => {
      controller?.abort();
      if (autoTimer) clearInterval(autoTimer);
    };
  },
});
