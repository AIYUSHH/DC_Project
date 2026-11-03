/**
 * learning module: Sockets and multiplexing
 * Interactive teaching simulations for TCP/UDP demultiplexing and stateful NAT/PAT.
 */
import { p4 } from '../../core/addressing.js';
import { hn, on, panel, sel, tabset, tbl, vd } from '../../core/ui-helpers.js';
import { $, $$, pickOne } from '../../core/utils.js';
import { regMod } from '../registry.js';

regMod({
  id: 'sockets', group: 'adv', title: 'Sockets and multiplexing',
  desc: 'Explore TCP connection lookup, UDP socket selection, and stateful NAT translation.',
  obj: [
    'Match TCP segments using the complete connection four-tuple.',
    'Compare wildcard, address-specific, and connected UDP sockets.',
    'Follow TCP and UDP NAT mappings in both directions.',
  ],
  mount(root) {
    root.innerHTML = '<div id="sktabs"></div>';
    const SERVER = '203.0.113.5';
    const initial = () => [
      { proto:'TCP', lip:'*', lp:22, rip:'*', rp:'*', state:'LISTEN' },
      { proto:'TCP', lip:'*', lp:80, rip:'*', rp:'*', state:'LISTEN' },
      { proto:'TCP', lip:'*', lp:443, rip:'*', rp:'*', state:'LISTEN' },
      { proto:'UDP', lip:'*', lp:53, rip:'*', rp:'*', state:'BOUND' },
      { proto:'UDP', lip:SERVER, lp:123, rip:'*', rp:'*', state:'BOUND' },
      { proto:'UDP', lip:SERVER, lp:53000, rip:'8.8.8.8', rp:53, state:'CONNECTED' },
    ];
    let sockets = initial();
    const eph = () => 49152 + Math.floor(Math.random() * 16383);
    const randIp = () => pickOne(['198.51.100.20','192.0.2.44','203.0.113.80']);
    const validPort = n => Number.isInteger(n) && n > 0 && n <= 65535;
    const validIp = ip => p4(ip) !== null;
    const localOK = (s, ip) => s.lip === '*' || s.lip === ip;
    const remoteOK = (s, ip, port) => (s.rip === '*' || s.rip === ip) && (s.rp === '*' || Number(s.rp) === port);

    const tabs = tabset($('#sktabs', root), [
      {
        label:'TCP demultiplexing',
        render(p) {
          p.innerHTML = panel('Server ' + SERVER,
            '<p class="hint">Established TCP connections are selected by protocol and the complete 4-tuple: source IP, source port, destination IP, destination port. A wildcard listener remains available for new clients.</p><div id="skt"></div>') +
            panel('Incoming TCP segment',
              '<div class="controls">' +
              '<div class="field"><label>Source IP</label><input id="ki" value="198.51.100.20"></div>' +
              '<div class="field"><label>Source port</label><input id="ks" type="number" min="1" max="65535" value="51000"></div>' +
              '<div class="field"><label>Destination IP</label><input id="kdi" value="' + SERVER + '"></div>' +
              '<div class="field"><label>Destination port</label><input id="kd" type="number" min="1" max="65535" value="443"></div>' +
              '<div class="field"><label>TCP segment</label>' + sel('kf', [['syn','SYN (start)'],['ack','ACK (finish handshake)'],['data','Data'],['fin','FIN (close)']], 'syn') + '</div></div>' +
              '<div class="btnrow"><button class="btn" id="ksend">Deliver</button><button class="btn ghost" id="kmany">Add 5 established clients</button><button class="btn ghost" id="kreset">Reset</button></div><div id="kres"></div>',
              'Send SYN, then change the segment to ACK and deliver again to complete the three-way handshake.');
          const draw = hi => {
            $('#skt',p).innerHTML = tbl(['Protocol','Local endpoint','Remote endpoint','State'],
              sockets.map((s,i) => [s.proto,s.lip+':'+s.lp,s.rip+':'+s.rp,s.state]));
            if (hi !== undefined) $$('#skt tbody tr',p)[hi]?.classList.add('hl');
          };
          const deliver = () => {
            const si=$('#ki',p).value.trim(), sp=Number($('#ks',p).value);
            const di=$('#kdi',p).value.trim(), dp=Number($('#kd',p).value), kind=$('#kf',p).value;
            if (!validIp(si)||!validIp(di)||!validPort(sp)||!validPort(dp)) {
              $('#kres',p).innerHTML=vd('bad','Invalid endpoint.','Enter valid IPv4 addresses and ports from 1 to 65535.'); return;
            }
            let i=sockets.findIndex(s=>s.proto==='TCP'&&s.state==='ESTABLISHED'&&localOK(s,di)&&s.lp===dp&&s.rip===si&&Number(s.rp)===sp);
            if(i>=0) {
              if(kind==='syn') $('#kres',p).innerHTML=vd('info','Duplicate SYN recognized.','The same 4-tuple already exists. No duplicate connection is created; a real stack may retransmit SYN-ACK.');
              else if(kind==='fin') { sockets[i].state='CLOSED'; $('#kres',p).innerHTML=vd('ok','FIN matched this connection.','The demo marks it CLOSED; a complete TCP teardown has additional FIN-WAIT and TIME-WAIT states.'); }
              else $('#kres',p).innerHTML=vd('ok','Delivered to exact established socket.','Matched '+si+':'+sp+' → '+di+':'+dp+'. Other clients using port '+dp+' remain separate.');
              draw(i); return;
            }
            i=sockets.findIndex(s=>s.proto==='TCP'&&s.state==='SYN-RECEIVED'&&localOK(s,di)&&s.lp===dp&&s.rip===si&&Number(s.rp)===sp);
            if(i>=0) {
              if(kind==='ack') { sockets[i].state='ESTABLISHED'; $('#kres',p).innerHTML=vd('ok','Three-way handshake complete.','The final ACK changes the child socket to ESTABLISHED. The listening socket remains open.'); }
              else if(kind==='syn') $('#kres',p).innerHTML=vd('info','SYN retransmission recognized.','A matching half-open connection already exists; no second child socket is created.');
              else $('#kres',p).innerHTML=vd('warn','Handshake incomplete.','Send the final ACK before application data.');
              draw(i); return;
            }
            const listener=sockets.findIndex(s=>s.proto==='TCP'&&s.state==='LISTEN'&&localOK(s,di)&&s.lp===dp);
            if(listener>=0&&kind==='syn') {
              sockets.push({proto:'TCP',lip:di,lp:dp,rip:si,rp:sp,state:'SYN-RECEIVED'});
              draw(sockets.length-1);
              $('#kres',p).innerHTML=vd('ok','SYN accepted; SYN-ACK sent.','A distinct half-open socket was created for '+si+':'+sp+'. Choose ACK and deliver again to finish the handshake.'); return;
            }
            if(listener>=0) $('#kres',p).innerHTML=vd('bad','No matching connection.','A listener accepts a new SYN; an ACK alone, data, or FIN cannot create a connection.');
            else $('#kres',p).innerHTML=vd('bad','Connection refused.','No connection or listener matches '+di+':'+dp+'. A real host would normally return TCP RST.');
            draw(listener>=0?listener:undefined);
          };
          $('#ksend',p).onclick=deliver;
          $('#kmany',p).onclick=()=>{
            for(let n=0;n<5;n++) sockets.push({proto:'TCP',lip:SERVER,lp:pickOne([80,443]),rip:randIp(),rp:eph(),state:'ESTABLISHED'});
            draw(); $('#kres',p).innerHTML=vd('info','Five clients added.','Several connections can share a local server port because their remote endpoints differ.');
          };
          $('#kreset',p).onclick=()=>{sockets=initial();$('#kres',p).innerHTML='';draw();};
          draw();
        }
      },
      {
        label:'UDP demultiplexing',
        render(p) {
          p.innerHTML=panel('UDP socket table',
            '<p class="hint">UDP has no handshake. Delivery commonly uses the local destination address and port. A connected UDP socket can additionally filter on its configured remote peer. Overlapping binds and reuse are OS-dependent.</p><div id="udps"></div>')+
            panel('Incoming UDP datagram',
            '<div class="controls"><div class="field"><label>Source IP</label><input id="ui" value="198.51.100.20"></div>'+
            '<div class="field"><label>Source port</label><input id="us" type="number" value="53000"></div>'+
            '<div class="field"><label>Destination IP</label><input id="udi" value="'+SERVER+'"></div>'+
            '<div class="field"><label>Destination port</label><input id="ud" type="number" value="53"></div></div>'+
            '<div class="btnrow"><button class="btn" id="usend">Deliver datagram</button><button class="btn ghost" id="uadd">Add IP-specific socket</button><button class="btn ghost" id="ureset">Reset UDP sockets</button></div><div id="ures"></div>',
            'Try port 53, then add a socket bound only to the server IP on port 5353.');
          const draw=()=>{$('#udps',p).innerHTML=tbl(['Local endpoint','Remote filter','Mode'],sockets.filter(s=>s.proto==='UDP').map(s=>[s.lip+':'+s.lp,s.rip+':'+s.rp,s.state]));};
          $('#usend',p).onclick=()=>{
            const si=$('#ui',p).value.trim(),sp=Number($('#us',p).value),di=$('#udi',p).value.trim(),dp=Number($('#ud',p).value);
            if(!validIp(si)||!validIp(di)||!validPort(sp)||!validPort(dp)){ $('#ures',p).innerHTML=vd('bad','Invalid endpoint.','Use valid IPv4 addresses and ports from 1 to 65535.');return; }
            const matches=sockets.filter(s=>s.proto==='UDP'&&s.lp===dp&&localOK(s,di)&&remoteOK(s,si,sp));
            matches.sort((a,b)=>Number(b.lip!=='*')-Number(a.lip!=='*')+Number((b.rip!=='*'||b.rp!=='*'))-Number((a.rip!=='*'||a.rp!=='*')));
            if(!matches.length) $('#ures',p).innerHTML=vd('bad','No matching UDP socket.','The host may return ICMP Destination Unreachable (Port Unreachable), depending on policy.');
            else {const s=matches[0];$('#ures',p).innerHTML=vd('ok','Delivered to '+s.state.toLowerCase()+' UDP socket '+s.lip+':'+s.lp+'.',s.state==='CONNECTED'?'The connected socket also matched remote peer '+s.rip+':'+s.rp+'.':s.lip==='*'?'The wildcard binding accepts any local IPv4 destination on this port, subject to OS reuse rules.':'The destination IP matched this socket-specific binding.');}
          };
          $('#uadd',p).onclick=()=>{if(!sockets.some(s=>s.proto==='UDP'&&s.lip===SERVER&&s.lp===5353))sockets.push({proto:'UDP',lip:SERVER,lp:5353,rip:'*',rp:'*',state:'BOUND'});$('#ud',p).value='5353';$('#udi',p).value=SERVER;$('#ures',p).innerHTML=vd('info','IP-specific socket added.','It listens only on '+SERVER+':5353.');draw();};
          $('#ureset',p).onclick=()=>{sockets=sockets.filter(s=>s.proto!=='UDP').concat(initial().filter(s=>s.proto==='UDP'));$('#ures',p).innerHTML='';draw();};
          draw();
        }
      },
      {
        label:'NAT / PAT',
        render(p) {
          const PUB='198.51.100.7', hosts=['192.168.1.10','192.168.1.11','192.168.1.12'];
          let maps=[],nextPort=40000,nextId=1;
          const prune=()=>{const now=Date.now();maps=maps.filter(m=>m.expires>now);};
          const draw=()=>{
            prune();
            $('#nt',p).innerHTML=maps.length?tbl(['ID','Protocol','Inside','Public','Remote peer','Expires'],maps.map(m=>[m.id,m.proto,m.ip+':'+m.insidePort,PUB+':'+m.publicPort,m.remoteIp+':'+m.remotePort,Math.max(0,Math.ceil((m.expires-Date.now())/1000))+'s'])):hn('The NAT table is empty. Open a connection from one of the hosts.');
            const q=$('#nreply',p),old=q.value;
            q.innerHTML='<option value="">Choose a mapping</option>'+maps.map(m=>'<option value="'+m.id+'">#'+m.id+' '+m.proto+' '+m.ip+':'+m.insidePort+' ↔ '+m.remoteIp+':'+m.remotePort+'</option>').join('');
            if(maps.some(m=>String(m.id)===old))q.value=old;
          };
          p.innerHTML=panel('One public address for many hosts',
            '<p class="hint">Stateful PAT records protocol, inside endpoint, public endpoint and remote endpoint. Return traffic must match an active mapping. Demo timeouts: TCP 120 seconds; UDP 30 seconds.</p>'+
            '<div class="controls"><div class="field"><label>Protocol</label>'+sel('np',[['TCP','TCP'],['UDP','UDP']],'TCP')+'</div>'+
            '<div class="field"><label>Remote IP</label><input id="nri" value="93.184.216.34"></div><div class="field"><label>Remote port</label><input id="nrp" type="number" value="443"></div></div>'+
            '<div class="btnrow wrap">'+hosts.map(h=>'<button class="btn ghost sm" data-host="'+h+'">'+h+' opens connection</button>').join('')+'</div><div id="nt"></div>'+
            '<div class="field"><label>Incoming reply for mapping</label><select id="nreply"><option value="">No mappings yet</option></select></div>'+
            '<div class="btnrow wrap"><button class="btn" id="nrep">Simulate matching reply</button><button class="btn ghost" id="ncold">Unsolicited inbound packet</button><button class="btn ghost" id="nexpire">Expire oldest mapping</button><button class="btn ghost" id="nclr">Clear table</button></div><div id="nlog"></div>',
            'Create mappings for different inside hosts and remote servers, then simulate return traffic.');
          on(p,'click','[data-host]',(e,b)=>{
            prune();const proto=$('#np',p).value,remoteIp=$('#nri',p).value.trim(),remotePort=Number($('#nrp',p).value);
            if(!validIp(remoteIp)||!validPort(remotePort)){ $('#nlog',p).innerHTML=vd('bad','Invalid remote endpoint.','Enter a valid IPv4 address and port.');return; }
            const insidePort=eph(),publicPort=nextPort++,ttl=proto==='TCP'?120000:30000;
            const m={id:nextId++,proto,ip:b.dataset.host,insidePort,publicPort,remoteIp,remotePort,expires:Date.now()+ttl};
            maps.push(m);draw();$('#nreply',p).value=String(m.id);
            $('#nlog',p).innerHTML=vd('ok','Outbound packet translated.',proto+' '+m.ip+':'+insidePort+' → '+remoteIp+':'+remotePort+' leaves as '+PUB+':'+publicPort+' → '+remoteIp+':'+remotePort+'. The mapping is stored for '+(ttl/1000)+' seconds.');
          });
          $('#nrep',p).onclick=()=>{
            prune();const id=Number($('#nreply',p).value),m=maps.find(x=>x.id===id);
            if(!m){$('#nlog',p).innerHTML=vd('warn','No active mapping selected.','Create or select an active mapping.');draw();return;}
            const found=maps.find(x=>x.proto===m.proto&&x.publicPort===m.publicPort&&x.remoteIp===m.remoteIp&&x.remotePort===m.remotePort);
            if(!found){$('#nlog',p).innerHTML=vd('bad','No reverse mapping found.','The incoming packet did not match an active translation entry.');return;}
            found.expires=Date.now()+(found.proto==='TCP'?120000:30000);
            $('#nlog',p).innerHTML=vd('ok','Reply translated back.',found.proto+' '+found.remoteIp+':'+found.remotePort+' → '+PUB+':'+found.publicPort+' matches mapping #'+found.id+'. Destination rewritten to '+found.ip+':'+found.insidePort+'.');
            draw();
          };
          $('#ncold',p).onclick=()=>{prune();$('#nlog',p).innerHTML=vd('bad','Unsolicited inbound packet dropped.','Packet to '+PUB+':'+(nextPort+123)+' has no active translation entry, so there is no inside endpoint to forward it to.');};
          $('#nexpire',p).onclick=()=>{prune();if(!maps.length){$('#nlog',p).innerHTML=vd('warn','No mappings to expire.','Create an outbound mapping first.');return;}const m=maps.shift();$('#nlog',p).innerHTML=vd('info','Mapping #'+m.id+' expired.','Later inbound packets for this mapping will no longer be translated.');draw();};
          $('#nclr',p).onclick=()=>{maps=[];$('#nlog',p).innerHTML='';draw();};
          draw();
        }
      }
    ],0);
    return () => tabs.destroy();
  }
});
