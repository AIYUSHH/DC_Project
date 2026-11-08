/**
 * Encryption and decryption learning lab.
 * Educational examples only; use TLS and vetted protocols in production.
 */
import { regMod } from '../registry.js';
import { panel, hn, vd, statRow } from '../../core/ui-helpers.js';
import { $, esc } from '../../core/utils.js';
import { hex } from '../../core/encoding.js';

const bytesHex = bytes => Array.from(bytes).slice(0, 120).map(hex).join(' ') + (bytes.length > 120 ? ' …' : '');
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

regMod({
  id: 'encryption',
  group: 'adv',
  title: 'Encryption and decryption lab',
  desc: 'Explore classical and modern encryption, follow every processing stage, and inspect the receiver result.',
  obj: [
    'Compare classical ciphers with modern authenticated encryption.',
    'Understand symmetric, asymmetric and hybrid encryption.',
    'Inspect intermediate outputs, packetization and receiver verification.',
  ],
  mount(root) {
    const supported = typeof crypto !== 'undefined' && !!crypto.subtle;
    root.innerHTML = panel('Explore encryption, one stage at a time',
      '<p class="hint">Select an algorithm and payload. Each stage reveals its actual input, operation and output before the next stage begins.</p>' +
      '<div class="controls"><div class="field grow"><label for="enc-message">Text message</label><textarea id="enc-message" rows="3">Meet at the network lab.</textarea></div><div class="field grow"><label for="enc-file">Or choose a file (AES/RSA/ECDH/XOR)</label><input id="enc-file" type="file"></div></div>' +
      '<div class="controls"><div class="field grow"><label for="enc-mode">Algorithm</label><select id="enc-mode">' +
      '<option value="caesar">Caesar cipher (classical, text only)</option><option value="xor">XOR byte cipher (educational only)</option>' +
      '<option value="aes">AES-256-GCM (symmetric)</option><option value="rsa">RSA-OAEP + AES-GCM (hybrid)</option>' +
      '<option value="ecdh">ECDH P-256 + AES-GCM (key agreement)</option><option value="hash">SHA-256 (one-way hash, not encryption)</option>' +
      '</select></div><div class="field"><label for="enc-size">Packet payload size (bytes)</label><input id="enc-size" type="number" min="8" max="1024" value="16"></div><div class="field" id="enc-shift-wrap"><label for="enc-shift">Caesar shift</label><input id="enc-shift" type="number" min="1" max="25" value="3"></div></div>' +
      '<div class="btnrow"><button class="btn" id="enc-run" '+(!supported?'disabled':'')+'>Start step-by-step simulation</button><button class="btn ghost" id="enc-tamper" disabled>Test tampering</button></div>' +
      (!supported?'<p class="hint">Web Crypto is unavailable. Open the site over HTTPS or localhost for AES, RSA, ECDH and SHA-256.</p>':'') +
      '<div id="enc-output" aria-live="polite"></div>',
      'Caesar and XOR are teaching examples, not secure protection. AES-GCM authenticates encrypted data. RSA-OAEP wraps a short symmetric key; it is not used to encrypt large files directly. SHA-256 is one-way hashing.'
    );
    if (!supported) return;
    let last = null, downloadUrl = null, running = false;
    const out = $('#enc-output',root);
    const modeEl = $('#enc-mode',root);
    const shiftWrap = $('#enc-shift-wrap',root);
    modeEl.addEventListener('change',()=>{shiftWrap.hidden=modeEl.value!=='caesar';});
    shiftWrap.hidden=false;

    if (!root.querySelector('#enc-stage-style')) {
      const style=document.createElement('style'); style.id='enc-stage-style';
      style.textContent=`
        .enc-stage-list{display:grid;gap:12px;margin:16px 0}
        .enc-stage{border:1px solid var(--line,#ccc);border-radius:12px;padding:12px;opacity:.48;transition:opacity .3s,border-color .3s,transform .3s}
        .enc-stage.active{opacity:1;border-color:var(--accent,#2878d0);transform:translateX(3px);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent,#2878d0) 15%,transparent)}
        .enc-stage.done{opacity:1}
        .enc-stage h4{margin:0 0 6px}.enc-stage pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0;font-size:12px}
        .enc-stage .enc-meta{font-size:12px;opacity:.75}
        .enc-meter{height:6px;background:color-mix(in srgb,var(--line,#888) 20%,transparent);border-radius:9px;overflow:hidden;margin:10px 0}
        .enc-meter i{display:block;width:0;height:100%;background:var(--accent,#2878d0);transition:width .45s}
        .enc-stage.active h4:before{content:'▶ ';color:var(--accent,#2878d0)}
        .enc-guide{margin:18px 0;padding:16px;border:1px solid var(--line,#ccc);border-radius:12px}
        .enc-guide h3{margin:0 0 8px}.enc-guide>p{line-height:1.6}
        .enc-guide-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:12px}
        .enc-guide details{border:1px solid var(--line,#ccc);border-radius:9px;padding:10px;background:color-mix(in srgb,var(--line,#888) 5%,transparent)}
        .enc-guide summary{font-weight:650;cursor:pointer}.enc-guide details p{line-height:1.55;margin:9px 0 2px}
        .enc-guide .enc-warning{border-left:3px solid var(--accent,#2878d0);padding:8px 11px;margin-top:12px;background:color-mix(in srgb,var(--accent,#2878d0) 8%,transparent)}
        .enc-guide code{overflow-wrap:anywhere}

        @media(prefers-reduced-motion:reduce){.enc-stage,.enc-meter i{transition:none}}
      `; root.appendChild(style);
    }

    const addStage=(title,operation,input,output,meta='')=>({title,operation,input,output,meta});
    const renderStage=(s,index,total)=>'<article class="enc-stage" data-stage="'+index+'"><h4>Stage '+(index+1)+': '+esc(s.title)+'</h4><div class="enc-meta">'+esc(s.operation)+'</div><p><strong>Input</strong></p><pre>'+esc(s.input)+'</pre><p><strong>Result</strong></p><pre>'+esc(s.output)+'</pre>'+(s.meta?'<div class="enc-meta">'+esc(s.meta)+'</div>':'')+'</article>';
    const showStages=async stages=>{
      out.innerHTML='<section class="enc-stage-list"><h3>Processing stages</h3><div class="enc-meter"><i></i></div>'+stages.map(renderStage).join('')+'</section>';
      const cards=out.querySelectorAll('.enc-stage'), meter=out.querySelector('.enc-meter i');
      for(let i=0;i<cards.length;i++){
        if(!root.isConnected)return;
        cards[i].classList.add('active');
        cards[i].scrollIntoView?.({behavior:'smooth',block:'nearest'});
        meter.style.width=((i+1)/cards.length*100)+'%';
        await wait(700);
        cards[i].classList.remove('active'); cards[i].classList.add('done');
      }
    };
    const renderLearningGuide=mode=>{
      const guides={
        caesar:{
          heading:'Caesar cipher — substitution with a fixed shift',
          intro:'This is a classical substitution cipher. It replaces each alphabetic character with another character a fixed number of positions away. It demonstrates the idea of a key, but it is not suitable for protecting real information.',
          cards:[
            ['1. Convert a letter to a position','For A–Z, map A to 0, B to 1, …, Z to 25. Lowercase letters use the same positions. Spaces, punctuation and digits are left unchanged.'],
            ['2. Apply the key (shift)','The shift value is the key. Encryption uses E(x) = (x + k) mod 26. Modulo 26 wraps past Z back to A.'],
            ['3. Reverse the shift','Decryption uses D(y) = (y − k + 26) mod 26. The same key is used in reverse, so Caesar is a symmetric-key example.'],
            ['4. Why it is weak','There are only 25 non-zero shifts. An attacker can try every key, and letter-frequency patterns remain visible.']
          ],
          warning:'Use this only to learn substitution and symmetric keys. It provides no meaningful modern security.'
        },
        xor:{
          heading:'XOR byte cipher — the same operation encrypts and decrypts',
          intro:'XOR compares bits. Equal bits produce 0; different bits produce 1. The demonstration applies a fixed byte key (0x5A) to every input byte.',
          cards:[
            ['1. Represent data as bits','Each byte contains eight bits. For example, 0x41 is 01000001 and the demo key 0x5A is 01011010.'],
            ['2. Encrypt with XOR','Ciphertext = plaintext XOR key. XOR changes each bit according to the corresponding key bit.'],
            ['3. Decrypt with XOR again','(plaintext XOR key) XOR key = plaintext, because key XOR key equals zero. The same key reverses the operation.'],
            ['4. Why this demo is insecure','The key is fixed and reused, so anyone who knows the code knows the key. Real stream ciphers require secure key generation and a carefully designed keystream.']
          ],
          warning:'This fixed-key XOR mode is an illustration of a bitwise operation, not secure encryption.'
        },
        aes:{
          heading:'AES-256-GCM — authenticated symmetric encryption',
          intro:'AES is a block cipher. GCM turns it into authenticated encryption: it protects confidentiality and also checks whether the ciphertext or authenticated data was modified.',
          cards:[
            ['1. Generate the secret key','The browser creates a random 256-bit key. Sender and receiver both need the same secret key. Anyone who obtains it can decrypt the message.'],
            ['2. Generate a 96-bit nonce (IV)','The nonce is sent with the ciphertext; it is not a secret. It must never be reused with the same AES-GCM key. This demo generates a fresh random 12-byte nonce for each run.'],
            ['3. Encrypt and authenticate','AES-GCM encrypts the bytes and creates a 128-bit authentication tag. The tag is included at the end of the Web Crypto ciphertext output.'],
            ['4. Verify before releasing plaintext','During decryption, GCM checks the tag. If ciphertext, nonce or authenticated data does not match, decryption fails and plaintext is not returned.'],
            ['5. Understand the key problem','Encryption alone does not tell a real recipient how to obtain the secret key safely. A real application needs a secure key-management and authenticated key-establishment design.']
          ],
          warning:'The simulation generates a temporary key in this browser session. It demonstrates AES-GCM mechanics, not a complete production key-management system.'
        },
        rsa:{
          heading:'RSA-OAEP + AES-GCM — hybrid encryption',
          intro:'Hybrid encryption combines public-key cryptography with fast symmetric encryption. RSA is used to protect a short random AES session key; AES encrypts the actual message or file.',
          cards:[
            ['1. Create an RSA key pair','The receiver has an RSA public key and a matching private key. The public key may be shared; the private key must remain secret. This demo creates a temporary 2048-bit pair.'],
            ['2. Generate an AES session key','A fresh AES-256 key is created for the payload. AES is efficient for large messages and files; RSA is not designed to encrypt large files directly.'],
            ['3. Wrap the AES key','RSA-OAEP with SHA-256 encrypts (wraps) the short AES key using the RSA public key. Only the matching private key can unwrap it.'],
            ['4. Encrypt the payload','AES-256-GCM encrypts the message using the session key and a fresh nonce. The ciphertext and nonce travel with the wrapped session key.'],
            ['5. Receiver unwraps, then decrypts','The receiver uses the RSA private key to recover the AES key, then uses AES-GCM to authenticate and decrypt the payload.'],
            ['6. What this does not solve alone','A public key must be authenticated. Otherwise an attacker could substitute their own public key. Real systems use certificates or another trusted identity mechanism.']
          ],
          warning:'The demo creates both RSA keys locally, so it illustrates the workflow but does not model a real sender and receiver with independently managed identities.'
        },
        ecdh:{
          heading:'ECDH P-256 + AES-GCM — agree on a shared secret',
          intro:'ECDH is a key-agreement protocol, not an encryption algorithm by itself. Two parties exchange public keys and independently derive the same shared secret. The derived key is then used with AES-GCM.',
          cards:[
            ['1. Each party creates a key pair','Client and server each create a private key and a corresponding public key on the P-256 elliptic curve. Private keys are never exchanged.'],
            ['2. Exchange public keys','Each side sends its public key to the other. A public key is safe to disclose, but its owner must be authenticated.'],
            ['3. Derive the shared secret','The client combines its private key with the server public key. The server combines its private key with the client public key. Both calculations produce the same shared secret.'],
            ['4. Derive an AES key','A production protocol uses a key-derivation function (KDF), with context and transcript binding, to turn shared secret material into encryption keys. This demonstration asks Web Crypto to derive an AES-GCM key directly.'],
            ['5. Encrypt with AES-GCM','The derived AES key encrypts the message and authenticates it with a nonce and tag. ECDH established the key; AES-GCM protects the data.'],
            ['6. Authentication matters','Unauthenticated ECDH is vulnerable to a man-in-the-middle attack: an attacker can substitute public keys and establish separate secrets with both sides.']
          ],
          warning:'This is a learning demonstration, not a complete TLS handshake. It does not authenticate peer identities or implement the full TLS key schedule.'
        },
        hash:{
          heading:'SHA-256 — hashing is not encryption',
          intro:'A cryptographic hash maps input of any practical length to a fixed 256-bit digest. It is designed to be one-way: there is no decryption key and no operation that restores the original message.',
          cards:[
            ['1. Read the input bytes','Text is first encoded as UTF-8. A file is read as its raw bytes. Different byte sequences normally produce different digests.'],
            ['2. Process the message','SHA-256 processes the input through its compression construction and produces a 256-bit (32-byte) digest. The internal rounds are not reversible encryption rounds.'],
            ['3. Compare digests','A receiver can hash a received file and compare the digest with a trusted expected digest to detect accidental or malicious changes, provided the expected digest itself is trusted.'],
            ['4. What hashing does not provide','A plain hash does not hide the message, prove who sent it, or authenticate the sender. Use a MAC or digital signature when authenticity is required.'],
            ['5. Password storage is different','Passwords should be stored with a password-hashing scheme such as Argon2id, scrypt or PBKDF2, with unique salts and suitable cost settings—not as plain SHA-256 hashes.']
          ],
          warning:'SHA-256 produces a digest. It cannot be decrypted. For message authentication use HMAC or a digital signature as appropriate.'
        }
      };
      const g=guides[mode]; if(!g)return '';
      return '<section class="enc-guide"><h3>Understand the algorithm: '+esc(g.heading)+'</h3><p>'+esc(g.intro)+'</p><div class="enc-guide-grid">'+g.cards.map(([title,body])=>'<details><summary>'+esc(title)+'</summary><p>'+esc(body)+'</p></details>').join('')+'</div><p class="enc-warning"><strong>Security note:</strong> '+esc(g.warning)+'</p></section>';
    };
    const run=async()=>{
      if(running)return; running=true;
      $('#enc-run',root).disabled=true; $('#enc-tamper',root).disabled=true;
      try {
        const file=$('#enc-file',root).files[0], mode=modeEl.value;
        const source=file?new Uint8Array(await file.arrayBuffer()):new TextEncoder().encode($('#enc-message',root).value);
        if(!source.length){out.innerHTML=vd('warn','Nothing to process.','Enter text or choose a non-empty file.');return;}
        if(mode==='caesar'&&file){out.innerHTML=vd('warn','Text input required.','Caesar cipher operates on text only. Choose a text message or another algorithm.');return;}
        const packetSize=Math.max(8,Math.min(1024,Number($('#enc-size',root).value)||16));
        const stages=[];
        stages.push(addStage('Input','Convert input to bytes',file?'File: '+file.name+' ('+source.length+' bytes)':'Text: '+$('#enc-message',root).value,bytesHex(source)));
        let encrypted=source.slice(),iv=null,key=null,receiverKey=null,wrappedKey=null,algorithmLabel='',restore=null,oneWay=false;
        if(mode==='caesar'){
          const shift=Math.max(1,Math.min(25,Number($('#enc-shift',root).value)||3));
          const plain=$('#enc-message',root).value;
          const cipher=plain.replace(/[a-z]/gi,ch=>{const base=ch<='Z'?65:97;return String.fromCharCode((ch.charCodeAt(0)-base+shift)%26+base);});
          encrypted=new TextEncoder().encode(cipher); algorithmLabel='Caesar cipher';
          stages.push(addStage('Substitution','Shift each alphabetic character by '+shift,plain,cipher,'Same shift in reverse restores the text. Not secure against analysis.'));
          restore=()=>new TextEncoder().encode(new TextDecoder().decode(encrypted).replace(/[a-z]/gi,ch=>{const base=ch<='Z'?65:97;return String.fromCharCode((ch.charCodeAt(0)-base-shift+26)%26+base);}));
        } else if(mode==='xor'){
          const xorKey=0x5A; encrypted=source.map(byte=>byte^xorKey); algorithmLabel='XOR byte cipher';
          stages.push(addStage('XOR operation','Each byte XOR 0x5A',bytesHex(source),bytesHex(encrypted),'The same key reverses XOR. This fixed demonstration key is deliberately insecure.'));
          restore=()=>encrypted.map(byte=>byte^xorKey);
        } else if(mode==='hash'){
          encrypted=new Uint8Array(await crypto.subtle.digest('SHA-256',source)); algorithmLabel='SHA-256'; oneWay=true;
          stages.push(addStage('Hashing','SHA-256 compression function',bytesHex(source),bytesHex(encrypted),'A fixed 256-bit digest. There is no decryption operation.'));
        } else {
          if(mode==='aes'){
            key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
            receiverKey=key; algorithmLabel='AES-256-GCM';
            const raw=new Uint8Array(await crypto.subtle.exportKey('raw',key));
            stages.push(addStage('Key generation','Generate a random 256-bit symmetric key','No previous key',bytesHex(raw),'The same secret key is used by sender and receiver in this local demonstration.'));
          } else if(mode==='rsa'){
            const rsa=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
            key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
            receiverKey=key;
            const raw=new Uint8Array(await crypto.subtle.exportKey('raw',key));
            wrappedKey=new Uint8Array(await crypto.subtle.encrypt({name:'RSA-OAEP'},rsa.publicKey,raw));
            const unwrapped=await crypto.subtle.decrypt({name:'RSA-OAEP'},rsa.privateKey,wrappedKey);
            receiverKey=await crypto.subtle.importKey('raw',unwrapped,{name:'AES-GCM'},false,['decrypt']);
            algorithmLabel='RSA-OAEP + AES-256-GCM';
            stages.push(addStage('Session key creation','Generate AES-256-GCM key','Random session key',bytesHex(raw),'AES handles the data; RSA is only used to protect the short session key.'));
            stages.push(addStage('Public-key wrapping','RSA-OAEP with SHA-256',bytesHex(raw),bytesHex(wrappedKey),'Only the matching RSA private key can unwrap this session key.'));
          } else {
            const a=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey']);
            const b=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey']);
            const derive=(priv,pub)=>crypto.subtle.deriveKey({name:'ECDH',public:pub},priv,{name:'AES-GCM',length:256},true,['encrypt','decrypt']);
            key=await derive(a.privateKey,b.publicKey); receiverKey=await derive(b.privateKey,a.publicKey); algorithmLabel='ECDH P-256 + AES-256-GCM';
            const pubA=new Uint8Array(await crypto.subtle.exportKey('raw',a.publicKey)),pubB=new Uint8Array(await crypto.subtle.exportKey('raw',b.publicKey));
            stages.push(addStage('Public-key exchange','Exchange ECDH P-256 public keys',bytesHex(pubA),bytesHex(pubB),'Private keys remain with their owners; both sides derive the same shared secret.'));
            stages.push(addStage('Shared-key derivation','ECDH → AES-256-GCM key','Client private + server public; server private + client public','Two independently derived AES-256 keys','The Web Crypto API derives equivalent shared keys on both sides.'));
          }
          iv=crypto.getRandomValues(new Uint8Array(12));
          encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,source));
          stages.push(addStage('Authenticated encryption','AES-256-GCM',bytesHex(source),bytesHex(encrypted),'Nonce: '+bytesHex(iv)+'. Final 16 bytes are the authentication tag.'));
          if(wrappedKey)stages.push(addStage('Key transport','Send wrapped AES key with ciphertext',bytesHex(wrappedKey), 'RSA-wrapped session key ('+wrappedKey.length+' bytes)','The private key is never sent.'));
          restore=async bytes=>new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv},receiverKey,bytes));
        }
        const packets=[];for(let i=0;i<encrypted.length;i+=packetSize)packets.push(encrypted.slice(i,i+packetSize));
        stages.push(addStage('Packetization','Split output into '+packets.length+' packet(s)',bytesHex(encrypted),packets.slice(0,8).map((p,i)=>'Packet '+(i+1)+': '+bytesHex(p)).join('\n')+(packets.length>8?'\n… '+(packets.length-8)+' more packets':''),'Packet size setting: '+packetSize+' bytes.'));
        const received=new Uint8Array(packets.reduce((n,p)=>n+p.length,0));let offset=0;packets.forEach(p=>{received.set(p,offset);offset+=p.length;});
        stages.push(addStage('Transmission and reassembly','Receiver collects packet payloads',packets.length+' packets / '+received.length+' bytes',bytesHex(received),'Reassembled in sequence order for this demonstration.'));
        let restored=null,failed=false;
        if(oneWay){
          stages.push(addStage('Verification','Compare digest with a separately calculated digest',bytesHex(encrypted),bytesHex(new Uint8Array(await crypto.subtle.digest('SHA-256',source))),'Hashing is one-way; the original cannot be recovered from the digest.'));
        } else {
          try{
            restored=restore?await restore(received):received;
            if(restored instanceof Promise)restored=await restored;
            stages.push(addStage('Decryption','Reverse cipher / authenticate and decrypt',bytesHex(received),bytesHex(restored),'Receiver recovered the original bytes.'));
          }catch(e){failed=true;stages.push(addStage('Decryption','Authenticate ciphertext and recover plaintext',bytesHex(received),'REJECTED — authentication/decryption failed','The receiver does not release unauthenticated plaintext.'));}
        }
        stages.push(addStage(oneWay?'Final digest':'Final result',oneWay?'One-way output':'Recovered payload',bytesHex(encrypted),oneWay?'SHA-256: '+bytesHex(encrypted):(restored?file?'Original file bytes restored ('+restored.length+' bytes).':new TextDecoder().decode(restored):'No plaintext released.')));
        await showStages(stages);
        out.insertAdjacentHTML('beforeend',renderLearningGuide(mode));
        if(downloadUrl){URL.revokeObjectURL(downloadUrl);downloadUrl=null;}
        const resultText=oneWay?'SHA-256 digest generated. This operation cannot be decrypted.':failed?'Decryption failed; data was rejected.':file?'File restored successfully.':'Restored text: '+new TextDecoder().decode(restored);
        let finalHtml=panel('Simulation result',statRow([[source.length+' bytes','input'],[encrypted.length+' bytes',oneWay?'digest':mode==='caesar'||mode==='xor'?'ciphertext':'encrypted payload'],[packets.length,'packets']])+
          (failed?vd('bad','Authentication failed',resultText):oneWay?vd('info','Hash created',resultText):vd('ok','Processing complete',esc(resultText)))+
          '<p class="hint">Algorithm: '+esc(algorithmLabel)+'. '+(oneWay?'SHA-256 is a one-way hash, not encryption.':'')+'</p>');
        out.insertAdjacentHTML('beforeend',finalHtml);
        if(restored&&file&&!oneWay){
          downloadUrl=URL.createObjectURL(new Blob([restored],{type:file.type||'application/octet-stream'}));
          out.insertAdjacentHTML('beforeend','<p><a class="btn sm" id="enc-download" download="'+esc(file.name)+'">Save restored file</a></p>');
          $('#enc-download',out).href=downloadUrl;
        }
        last={mode,encrypted:encrypted.slice(),iv,receiverKey,key,restore,oneWay,source:source.slice(),fileName:file?.name};
        $('#enc-tamper',root).disabled=oneWay||mode==='caesar'||mode==='xor';
      } finally {running=false;$('#enc-run',root).disabled=false;}
    };
    $('#enc-run',root).onclick=()=>run().catch(error=>{out.innerHTML=vd('bad','Simulation error',esc(error.message||String(error)));});
    $('#enc-tamper',root).onclick=async()=>{
      if(!last||!['aes','rsa','ecdh'].includes(last.mode))return;
      const altered=last.encrypted.slice();if(altered.length)altered[0]^=1;
      try{await last.restore(altered);out.insertAdjacentHTML('beforeend',vd('bad','Unexpected result','Modified ciphertext was accepted.'));}
      catch(e){out.insertAdjacentHTML('beforeend',vd('ok','Tampering detected','AES-GCM authentication rejected the modified ciphertext.'));}
    };
    return()=>{if(downloadUrl)URL.revokeObjectURL(downloadUrl);last=null;};
  },
});
