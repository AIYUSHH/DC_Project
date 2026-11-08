/**
 * Live Network Inventory — reads the local OS tables through the optional loopback agent.
 * This is real host-local information, not a simulated topology or an active network scan.
 */
import { regMod } from '../registry.js';
import { $, esc } from '../../core/utils.js';

const ENDPOINT = 'http://127.0.0.1:8765/api/network';

regMod({
  id: 'live-network-inventory',
  group: 'net',
  title: 'Live network inventory',
  desc: 'Inspect this computer’s interfaces, default gateway, cached neighbours and Wi-Fi connection.',
  obj: [
    'Distinguish interface addresses from default routes and neighbour-cache entries.',
    'Inspect information already exposed by the local operating system.',
    'Understand why a neighbour cache is not a complete network topology.',
  ],
  mount(root) {
    let controller = null;
    root.innerHTML = `
      <section class="live-network">
        <div class="live-network-heading">
          <div><p class="eyebrow">Network layer · Local OS inspection</p><h2>Live network inventory</h2>
          <p class="hint">Read-only view of information your own computer already knows about its network.</p></div>
          <button class="btn sm" id="live-network-refresh" type="button">↻ Refresh</button>
        </div>
        <div class="live-network-notice"><strong>Optional local agent required.</strong>
          <span>Start <code>tools/network-agent/network_agent.py</code> on this computer. No data is collected until you press Refresh.</span>
        </div>
        <div class="live-network-status" id="live-network-status" role="status" aria-live="polite">Not connected to the local agent.</div>
        <div class="live-network-summary" id="live-network-summary"></div>
        <div class="live-network-grid">
          <section class="panel"><h3>Network interfaces</h3><div id="live-network-interfaces"><p class="hint">No data loaded.</p></div></section>
          <section class="panel"><h3>Default routes</h3><div id="live-network-routes"><p class="hint">No data loaded.</p></div></section>
          <section class="panel"><h3>Neighbour cache</h3><div id="live-network-neighbours"><p class="hint">No data loaded.</p></div></section>
          <section class="panel"><h3>Current Wi-Fi connection</h3><div id="live-network-wifi"><p class="hint">No data loaded.</p></div></section>
        </div>
        <section class="panel"><h3>How to interpret this data</h3><ul class="live-network-limitations" id="live-network-limitations">
          <li>Start the optional agent to retrieve OS-reported information.</li>
          <li>A neighbour-cache entry is not proof of a complete network inventory.</li>
          <li>This tool does not scan, ping, capture packets, or change configuration.</li>
        </ul></section>
        <p class="live-network-footnote">Local data is displayed in this browser session only. The agent does not upload it to BitSecure.</p>
      </section>`;

    const status = $('#live-network-status', root);
    const table = (headers, rows) => rows.length
      ? `<div class="live-network-table-wrap"><table class="live-network-table"><thead><tr>${headers.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(x => `<td>${esc(x ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : '<p class="hint">No entries reported by the operating system.</p>';
    const show = (id, html) => { $('#' + id, root).innerHTML = html; };

    async function refresh() {
      controller?.abort();
      controller = new AbortController();
      status.textContent = 'Connecting to the local agent…';
      status.classList.remove('is-error', 'is-ok');
      $('#live-network-refresh', root).disabled = true;
      try {
        const response = await fetch(ENDPOINT, { method: 'GET', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Agent returned HTTP ' + response.status);
        const data = await response.json();
        if (!data.ok) throw new Error(data.error || 'Agent could not collect network data.');
        status.textContent = 'Connected · ' + data.platform + ' · collected ' + data.collected_at;
        status.classList.add('is-ok');
        $('#live-network-summary', root).innerHTML = [
          ['Interfaces', data.interfaces.length], ['Default routes', data.default_routes.length],
          ['Cached neighbours', data.neighbours.length], ['Wi-Fi records', data.wifi.length],
        ].map(([label, value]) => `<div class="live-network-stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join('');
        show('live-network-interfaces', table(['Interface', 'State', 'MAC', 'IP addresses'],
          data.interfaces.map(item => [item.name, item.state, item.mac, (item.addresses || []).map(a => a.address + (a.prefix == null ? '' : '/' + a.prefix)).join(', ')])));
        show('live-network-routes', table(['Destination', 'Gateway', 'Interface', 'Protocol'],
          data.default_routes.map(item => [item.destination, item.gateway, item.interface, item.protocol])));
        show('live-network-neighbours', table(['IP address', 'MAC address', 'Interface', 'State'],
          data.neighbours.map(item => [item.address, item.mac, item.interface, item.state])));
        show('live-network-wifi', table(['SSID', 'Signal', 'Interface', 'State'],
          data.wifi.map(item => [item.ssid, item.signal_percent, item.interface, item.state])));
        $('#live-network-limitations', root).innerHTML = (data.limitations || []).map(item => `<li>${esc(item)}</li>`).join('');
      } catch (error) {
        if (error.name === 'AbortError') return;
        status.textContent = 'Could not reach the local agent. Start it using the instructions below, then refresh.';
        status.classList.add('is-error');
        show('live-network-summary', '');
      } finally {
        $('#live-network-refresh', root).disabled = false;
      }
    }
    $('#live-network-refresh', root).addEventListener('click', refresh);
    return () => controller?.abort();
  },
});
