/**
 * Live Network Inventory.
 * Real mode reads the optional loopback agent. Demo mode is clearly labelled and never claims
 * that sample values belong to the visitor's computer.
 */
import { regMod } from '../registry.js';
import { $, esc } from '../../core/utils.js';

const ENDPOINT = 'http://127.0.0.1:8765/api/network';
const safe = value => esc(value == null || value === '' ? '—' : value);
const ips = item => (item.addresses || []).map(a => (a.address || '') + (a.prefix == null ? '' : '/' + a.prefix)).filter(Boolean);
const sample = {
  ok:true, platform:'DEMO', collected_at:new Date().toISOString(), source:'Illustrative sample data',
  interfaces:[
    {name:'Wi-Fi adapter',state:'UP',mac:'02:00:5E:10:00:01',addresses:[{family:'inet',address:'192.168.1.24',prefix:24},{family:'inet6',address:'fe80::2400:5eff:fe10:1',prefix:64}]},
    {name:'Ethernet',state:'DOWN',mac:'02:00:5E:10:00:02',addresses:[]}
  ],
  default_routes:[{destination:'default',gateway:'192.168.1.1',interface:'Wi-Fi adapter',protocol:'DHCP'}],
  neighbours:[
    {address:'192.168.1.1',mac:'A4:5E:60:12:34:56',interface:'Wi-Fi adapter',state:'REACHABLE'},
    {address:'192.168.1.8',mac:'D0:37:45:AB:CD:EF',interface:'Wi-Fi adapter',state:'STALE'},
    {address:'192.168.1.12',mac:'70:4D:7B:11:22:33',interface:'Wi-Fi adapter',state:'DELAY'}
  ],
  wifi:[{ssid:'Home-WiFi',signal_percent:'82',interface:'Wi-Fi adapter',state:'connected'}],
  limitations:['DEMO DATA: these addresses are examples and do not describe this computer.','Neighbour entries are illustrative cached observations, not a complete physical network map.']
};

regMod({
  id:'live-network-inventory', group:'net', title:'Live network inventory',
  desc:'Explore this computer’s interfaces, IP addresses, gateway, neighbour cache and Wi-Fi connection.',
  obj:[
    'Inspect interface addresses, default routes and neighbour-cache entries.',
    'Understand which details come from the operating system and which are unavailable to a browser.',
    'Distinguish a cached neighbour list from a complete physical network map.'
  ],
  mount(root) {
    let controller=null, snapshot=null, activeTab='overview', selectedInterface=0;
    let autoTimer=null, refreshBusy=false, demoMode=false, neighbourQuery='';
    root.innerHTML=`
      <section class="lni">
        <div class="lni-consent-backdrop" id="lni-consent" hidden>
          <section class="lni-consent-dialog" role="dialog" aria-modal="true" aria-labelledby="lni-consent-title" aria-describedby="lni-consent-description">
            <div class="lni-consent-symbol" aria-hidden="true">⌁</div>
            <div class="lni-kicker">YOUR DEVICE · YOUR CHOICE</div>
            <h2 id="lni-consent-title">Allow BitSecure to inspect this device?</h2>
            <p id="lni-consent-description">With your permission, BitSecure will connect to its optional local helper to read network information from this computer. This helps you understand how your device is connected.</p>
            <div class="lni-consent-list">
              <div><b>Information accessed</b><span>Local IP addresses, network adapters, default gateway, Wi-Fi details and cached network neighbours.</span></div>
              <div><b>What BitSecure will do</b><span>Read and display the information only. It will not scan other devices, change network settings or capture traffic.</span></div>
              <div><b>Where it goes</b><span>The helper is contacted on this computer (127.0.0.1). Network details are not intentionally sent to a BitSecure server.</span></div>
            </div>
            <p class="lni-consent-footnote">You can choose “Not now” and still explore the interactive sample. Allowing access does not install software; if the helper is not installed and running, we’ll explain the next step.</p>
            <div class="lni-consent-actions">
              <button type="button" class="btn ghost" id="lni-deny">Not now</button>
              <button type="button" class="btn" id="lni-allow">Allow access</button>
            </div>
          </section>
        </div>

        <header class="lni-head">
          <div><div class="lni-kicker">NETWORK LAYER <span>•</span> LIVE INVENTORY</div>
            <h2>Network interface explorer</h2>
            <p>Inspect the IP configuration and network state reported by this device.</p>
          </div>
          <div class="lni-actions">
            <button class="btn" id="lni-refresh" type="button">↻ Refresh live data</button>
            <button class="btn ghost sm" id="lni-auto" type="button" aria-pressed="false">Auto refresh: Off</button>
          </div>
        </header>
        <div class="lni-status" id="lni-status" role="status" aria-live="polite"><i></i><span id="lni-status-text">Waiting for local network helper</span><small id="lni-source">No data loaded</small></div>
        <section class="lni-welcome" id="lni-welcome">
          <div class="lni-welcome-icon">⌘</div><div>
            <span class="lni-agent-label" id="lni-agent-label">LIVE CONNECTION NOT STARTED</span>
            <h3 id="lni-welcome-title">Connect to this device</h3>
            <p id="lni-welcome-copy">To show real information, BitSecure needs its small local companion app. It reads this computer’s network configuration and returns it only to this browser.</p>
            <div class="lni-agent-steps" id="lni-agent-steps">
              <b>Start the helper on this computer</b>
              <p>Open a terminal in the BitSecure project folder and run:</p>
              <div class="lni-command"><code id="lni-command-text">python3 tools/network-agent/network_agent.py</code><button type="button" id="lni-copy">Copy</button></div>
              <small>Keep the terminal open, then select “Try connection again”. Windows users can run <code>py tools/network-agent/network_agent.py</code>.</small>
            </div>
            <div class="lni-welcome-actions">
              <button class="btn sm" id="lni-retry" type="button">Try connection again</button>
              <button class="btn ghost sm" id="lni-demo" type="button">Explore demo instead</button>
            </div>
            <p class="lni-demo-disclaimer">Demo data is fictional and is never presented as information from your device.</p>
          </div>
        </section>
        <div id="lni-dashboard" hidden>
          <div class="lni-mode-note" id="lni-mode-note"></div>
          <div class="lni-metrics" id="lni-metrics"></div>
          <section class="panel lni-device-panel">
            <div class="lni-section-title"><div><small>THIS DEVICE</small><h3>Local IP addresses</h3></div><span class="lni-tag">HOST CONFIGURATION</span></div>
            <div id="lni-device-ips" class="lni-ip-grid"></div>
          </section>
          <nav class="lni-tabs" aria-label="Network inventory sections">
            <button type="button" data-tab="overview" class="active">Overview</button>
            <button type="button" data-tab="interfaces">Interfaces <b id="lni-count-i">0</b></button>
            <button type="button" data-tab="routes">Routes <b id="lni-count-r">0</b></button>
            <button type="button" data-tab="neighbours">Neighbours <b id="lni-count-n">0</b></button>
          </nav>
          <section class="lni-view" id="lni-view-overview">
            <div class="lni-overview-grid">
              <section class="panel"><div class="lni-section-title"><div><small>ADAPTERS</small><h3>Network interfaces</h3></div></div><div id="lni-interface-cards"></div></section>
              <section class="panel"><div class="lni-section-title"><div><small>DEFAULT NEXT HOP</small><h3>Gateway</h3></div></div><div id="lni-gateway"></div>
                <div class="lni-divider"></div><div class="lni-section-title"><div><small>WIRELESS</small><h3>Wi-Fi connection</h3></div></div><div id="lni-wifi"></div></section>
            </div>
            <section class="panel"><div class="lni-section-title"><div><small>LOCAL LINK OBSERVATIONS</small><h3>Neighbour overview</h3><p>Only entries already cached by this device.</p></div><button class="btn ghost sm" type="button" data-open="neighbours">View all</button></div><div id="lni-neighbour-preview" class="lni-neighbour-preview"></div></section>
          </section>
          <section class="lni-view" id="lni-view-interfaces" hidden><div class="lni-section-title"><div><small>ADAPTER DETAILS</small><h3>Choose an interface</h3></div></div><div class="lni-interface-explorer"><div id="lni-interface-list" class="lni-interface-list"></div><div id="lni-interface-detail" class="panel"></div></div></section>
          <section class="lni-view" id="lni-view-routes" hidden><div class="lni-section-title"><div><small>PATH SELECTION</small><h3>Default routes</h3><p>Used when no more-specific route matches.</p></div></div><div id="lni-route-list"></div></section>
          <section class="lni-view" id="lni-view-neighbours" hidden><div class="lni-section-title"><div><small>ARP / NDP CACHE</small><h3>Neighbour cache</h3><label class="lni-filter"><input id="lni-filter" type="search" placeholder="Filter IP, MAC, interface…" aria-label="Filter neighbours"></label></div></div><div id="lni-neighbour-list" class="lni-neighbour-list"></div><p class="lni-note">A cache entry is not proof that a device is online now. This list is not a complete inventory and does not represent a physical topology.</p></section>
        </div>
        <footer class="lni-footer">BITSECURE • READ-ONLY OS INSPECTION • NO ACTIVE SCANNING</footer>
      </section>`;

    const el=s=>$(s,root);
    const status=(message,kind='')=>{el('#lni-status').className='lni-status '+kind;el('#lni-status-text').textContent=message;};
    const tableEmpty=msg=>'<p class="lni-empty">'+safe(msg)+'</p>';
    const setTab=tab=>{activeTab=tab;root.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));root.querySelectorAll('.lni-view').forEach(v=>v.hidden=v.id!=='lni-view-'+tab);};
    const copyValue=async(value,button)=>{try{await navigator.clipboard.writeText(value);button.textContent='Copied ✓';}catch{button.textContent=value;}};

    function render(data) {
      snapshot=data; el('#lni-welcome').hidden=true;el('#lni-dashboard').hidden=false;
      el('#lni-mode-note').textContent=demoMode?'DEMO MODE — all values below are illustrative sample data. They are not read from this computer.':'LIVE MODE — values below were returned by this device’s operating system.';
      const counts=[data.interfaces.length,data.default_routes.length,data.neighbours.length,data.wifi.length];
      el('#lni-metrics').innerHTML=[['Interfaces',counts[0],'Adapters reported'],['Routes',counts[1],'Default gateways'],['Neighbours',counts[2],'Cached entries'],['Wi-Fi',counts[3],'Wireless records']].map((x,i)=>'<button type="button" data-open="'+['interfaces','routes','neighbours','overview'][i]+'" class="lni-metric"><strong>'+safe(x[1])+'</strong><span>'+x[0]+'</span><small>'+x[2]+'</small></button>').join('');
      el('#lni-count-i').textContent=counts[0];el('#lni-count-r').textContent=counts[1];el('#lni-count-n').textContent=counts[2];
      const allIps=data.interfaces.flatMap(intf=>(intf.addresses||[]).map(a=>({name:intf.name,family:a.family,address:a.address,prefix:a.prefix})));
      el('#lni-device-ips').innerHTML=allIps.length?allIps.map(a=>'<div class="lni-ip-card"><small>'+safe(a.name)+' · '+safe(a.family)+'</small><strong>'+safe(a.address)+(a.prefix==null?'':'/'+safe(a.prefix))+'</strong><button type="button" data-copy="'+safe(a.address)+'">Copy IP</button></div>').join(''):tableEmpty('No local IP addresses were reported.');
      el('#lni-interface-cards').innerHTML=data.interfaces.length?data.interfaces.map((a,i)=>'<button class="lni-adapter" type="button" data-interface="'+i+'"><span class="lni-adapter-icon">▤</span><span><b>'+safe(a.name)+'</b><small>'+safe(a.state)+' · '+safe(ips(a).join(', ')||'No IP address')+'</small></span><span>›</span></button>').join(''):tableEmpty('No interfaces reported.');
      const gw=data.default_routes.find(r=>r.gateway);
      el('#lni-gateway').innerHTML=gw?'<div class="lni-value">'+safe(gw.gateway)+'</div><small>'+safe(gw.interface)+' · default route</small>':tableEmpty('No default gateway reported.');
      const wifi=data.wifi[0];el('#lni-wifi').innerHTML=wifi?'<div class="lni-value">'+safe(wifi.ssid||'Connected Wi-Fi')+'</div><small>'+safe(wifi.interface)+' · '+safe(wifi.state)+'</small>'+(wifi.signal_percent?'<div class="lni-signal"><i style="width:'+Math.max(0,Math.min(100,parseInt(wifi.signal_percent,10)||0))+'%"></i></div><small>Signal: '+safe(wifi.signal_percent)+'</small>':''):tableEmpty('No Wi-Fi details exposed by the OS.');
      const peers=data.neighbours;
      el('#lni-neighbour-preview').innerHTML=peers.length?peers.slice(0,4).map(n=>'<div class="lni-peer"><b>'+safe(n.address)+'</b><code>'+safe(n.mac)+'</code><small>'+safe(n.state)+'</small></div>').join(''):tableEmpty('No cached neighbours reported.');
      el('#lni-interface-list').innerHTML=data.interfaces.map((a,i)=>'<button type="button" class="lni-interface-choice '+(i===selectedInterface?'selected':'')+'" data-select-interface="'+i+'">'+safe(a.name)+'<small>'+safe(a.state)+'</small></button>').join('');
      renderInterfaceDetail();renderRoutes();renderNeighbours();setTab(activeTab);
    }
    function renderInterfaceDetail(){
      if(!snapshot)return;const a=snapshot.interfaces[selectedInterface];
      el('#lni-interface-detail').innerHTML=a?'<small>SELECTED ADAPTER</small><h3>'+safe(a.name)+'</h3><p>'+safe(a.state)+'</p><div class="lni-detail-field"><small>MAC ADDRESS</small><code>'+safe(a.mac)+'</code></div><div class="lni-detail-field"><small>IP ADDRESSES</small>'+(a.addresses||[]).map(x=>'<div class="lni-address"><code>'+safe(x.address)+(x.prefix==null?'':'/'+safe(x.prefix))+'</code><button type="button" data-copy="'+safe(x.address)+'">Copy</button></div>').join('')+'</div>':tableEmpty('Select an interface.');
      root.querySelectorAll('[data-select-interface]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.selectInterface)===selectedInterface));
    }
    function renderRoutes(){el('#lni-route-list').innerHTML=snapshot.default_routes.length?snapshot.default_routes.map((r,i)=>'<article class="lni-route"><span>'+(i+1)+'</span><div><small>DESTINATION</small><b>'+safe(r.destination||'default')+'</b></div><i>→</i><div><small>GATEWAY</small><b>'+safe(r.gateway||'Direct / unspecified')+'</b></div><i>→</i><div><small>INTERFACE</small><b>'+safe(r.interface)+'</b></div></article>').join(''):tableEmpty('No default routes reported.');}
    function renderNeighbours(){if(!snapshot)return;const q=neighbourQuery.toLowerCase();const list=snapshot.neighbours.filter(n=>[n.address,n.mac,n.interface,n.state].some(v=>String(v||'').toLowerCase().includes(q)));el('#lni-neighbour-list').innerHTML=list.length?list.map(n=>'<article class="lni-peer-card"><b>'+safe(n.address)+'</b><code>'+safe(n.mac)+'</code><small>'+safe(n.interface)+' · '+safe(n.state)+'</small><button type="button" data-copy="'+safe(n.address)+'">Copy IP</button></article>').join(''):tableEmpty('No neighbours match this filter.');}
    function renderDemo(){demoMode=true;stopAutoRefresh();render({...sample,collected_at:new Date().toISOString()});status('Interactive sample loaded','demo');el('#lni-source').textContent='SAMPLE DATA';el('#lni-agent-label').textContent='DEMO MODE';}
    function stopAutoRefresh(){if(autoTimer){clearInterval(autoTimer);autoTimer=null;}const b=el('#lni-auto');b.textContent='Auto refresh: Off';b.setAttribute('aria-pressed','false');b.disabled=true;}
    async function refresh(){
      if(!consent()){showConsent();return;}
      if(refreshBusy)return;refreshBusy=true;controller?.abort();controller=new AbortController();el('#lni-refresh').disabled=true;demoMode=false;status('Checking for the BitSecure Network Agent…','loading');
      try{const response=await fetch(ENDPOINT,{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error('HTTP '+response.status);const data=await response.json();if(!data.ok)throw new Error(data.error||'Agent error');render(data);status('Connected · '+data.platform+' · live OS data','ok');el('#lni-source').textContent='Updated '+new Date(data.collected_at||Date.now()).toLocaleTimeString();el('#lni-agent-label').textContent='LIVE DEVICE DATA';el('#lni-auto').disabled=false;}
      catch(error){if(error.name==='AbortError')return;stopAutoRefresh();snapshot=null;demoMode=false;el('#lni-dashboard').hidden=true;el('#lni-welcome').hidden=false;el('#lni-source').textContent='NO LIVE DATA';el('#lni-agent-label').textContent='LIVE CONNECTION NOT AVAILABLE';el('#lni-welcome-title').textContent='BitSecure Network Agent not detected';el('#lni-welcome-copy').textContent='Your permission is saved, but no local agent responded. This website cannot start or install a program on your computer. Start the helper below, then try again.';status('No live data · local helper not detected','error');}
      finally{refreshBusy=false;el('#lni-refresh').disabled=false;}
    }
    root.addEventListener('click',event=>{
      const tab=event.target.closest('[data-tab]');if(tab){setTab(tab.dataset.tab);return;}
      const open=event.target.closest('[data-open]');if(open){setTab(open.dataset.open);return;}
      const adapter=event.target.closest('[data-interface]');if(adapter){selectedInterface=Number(adapter.dataset.interface);setTab('interfaces');renderInterfaceDetail();return;}
      const select=event.target.closest('[data-select-interface]');if(select){selectedInterface=Number(select.dataset.selectInterface);renderInterfaceDetail();return;}
      const copy=event.target.closest('[data-copy]');if(copy)copyValue(copy.dataset.copy,copy);
    });
    el('#lni-refresh').addEventListener('click',refresh);
    el('#lni-retry').addEventListener('click',refresh);
    el('#lni-demo').addEventListener('click',renderDemo);
    const consentKey='bitsecure-live-inventory-consent-v1';
    const consent=()=>{try{return localStorage.getItem(consentKey)==='granted';}catch{return false;}};
    const showConsent=()=>{el('#lni-consent').hidden=false;el('#lni-allow').focus();};
    const closeConsent=()=>{el('#lni-consent').hidden=true;};
    el('#lni-allow').addEventListener('click',()=>{
      try{localStorage.setItem(consentKey,'granted');}catch{}
      closeConsent();
      refresh();
    });
    el('#lni-deny').addEventListener('click',()=>{
      try{localStorage.setItem(consentKey,'denied');}catch{}
      closeConsent();
      status('Access not granted · demo mode is still available','');
      el('#lni-welcome').hidden=false;
    });
    if(consent()) refresh(); else showConsent();
    el('#lni-copy').addEventListener('click',e=>copyValue('python3 tools/network-agent/network_agent.py',e.currentTarget));
    el('#lni-auto').addEventListener('click',e=>{if(e.currentTarget.disabled)return;if(autoTimer){stopAutoRefresh();e.currentTarget.disabled=false;}else{autoTimer=setInterval(()=>{if(!document.hidden&&!demoMode)refresh();},10000);e.currentTarget.textContent='Auto refresh: 10s';e.currentTarget.setAttribute('aria-pressed','true');}});
    el('#lni-filter').addEventListener('input',e=>{neighbourQuery=e.target.value;renderNeighbours();});
    return()=>{controller?.abort();if(autoTimer)clearInterval(autoTimer);};
  }
});
