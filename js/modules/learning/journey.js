/**
 * learning module: End-to-end journey
 *
 * Follows the learner's own message through all 13 stages using real bytes.
 *
 * This file registers one learning module with regMod(). Its mount(root) function builds the screen inside
 * `root` and attaches event handlers; the function mount() returns (if any) is its cleanup, called by the router
 * when the learner leaves, so timers and listeners do not outlive the screen. The protocol logic lives in
 * ../../simulations/ and ../../core/; this file is the user interface for it.
 *
 * Imports:
 *   - ../../core/state.js (shared in-memory state): S
 *   - ../../core/encoding.js (bytes, hex, bits and UTF-8 helpers): bin8, bytesOf, hex, hexs, rd16
 *   - ../../core/utils.js (tiny DOM, math and timing helpers): $, REDUCE, esc
 *   - ../../core/addressing.js (IPv4/IPv6 address and CIDR calculations): p4
 *   - ../../core/checksums.js (parity-free error-detection math: Internet checksum, CRC-8, CRC-32): crc32
 *   - ../../core/ui-helpers.js (shared HTML builders: icons, tables, tabs, ladder diagrams): chipRow, hn, kb, on, panel
 *   - ../../simulations/packetization.js (packet layout of the core lab): packetBytes, packetCrc
 *   - ../../simulations/packet-builders.js (byte-accurate Ethernet / IPv4 / TCP / UDP builders): FL, MAC, ethFrame, ipv4Packet, macStr, tcpSegment
 *   - ../../simulations/dissector.js (packet dissector: bytes -> layers, fields and integrity checks): parseFrame
 *   - ../registry.js (learning-module registry and group definitions): regMod
 *
 * Exports: (none)
 *
 * Used by: (imported only for its side effects by app.js)
 */

import { p4 } from '../../core/addressing.js';
import { crc32 } from '../../core/checksums.js';
import { bin8, bytesOf, hex, hexs, rd16 } from '../../core/encoding.js';
import { S } from '../../core/state.js';
import { chipRow, hn, kb, on, panel } from '../../core/ui-helpers.js';
import { $, esc, REDUCE } from '../../core/utils.js';
import { parseFrame } from '../../simulations/dissector.js';
import {
  ethFrame,
  FL,
  ipv4Packet,
  MAC,
  macStr,
  tcpSegment,
} from '../../simulations/packet-builders.js';
import { packetBytes, packetCrc } from '../../simulations/packetization.js';
import { regMod } from '../registry.js';

/**
 * Builds the 13 stages of the end-to-end journey from the learner's own message.
 *
 * Reads the current message, byte stream and payload size, then builds a real TCP segment, IPv4 packet and Ethernet frames (before and after a router) with the packet builders, so every number shown is computed, not hard-coded.
 * @returns {Array<{n:string,r:string,s:string,e:string,b:Array,bytes:?number[]}>} stage name, representation, size, explanation, block items, bytes.
 */
function journeyData() {
  const type = S.dataType || 'text';
  const binaryMode = ['image', 'video', 'document', 'audio'].includes(type);
  const typeLabel = ({ text: 'Text', image: 'Image', video: 'Video', document: 'Document', audio: 'Audio' })[type] || 'Text';
  const fileName = type === 'image' ? S.imageName : type === 'video' ? S.videoName : type === 'document' ? S.documentName : type === 'audio' ? S.audioName : '';
  const mimeType = type === 'image' ? S.imageMimeType : type === 'video' ? S.videoMimeType : type === 'document' ? S.documentMimeType : type === 'audio' ? S.audioMimeType : 'text/plain';
  const fileSize = type === 'image' ? S.imageSize : type === 'video' ? S.videoSize : type === 'document' ? S.documentSize : type === 'audio' ? S.audioSize : 0;
  const previewUrl = type === 'image' ? S.imageUrl : type === 'video' ? S.videoUrl : type === 'document' ? S.documentUrl : type === 'audio' ? S.audioUrl : null;
  const m = S.msg || 'Hi';
  const B = S.bytes.length ? S.bytes : (binaryMode ? [] : bytesOf(m));
  const n = Math.max(1, +($('#ps') && $('#ps').value) || (binaryMode ? 1200 : 3));
  const pk = B.slice(0, n);
  const np = Math.max(1, Math.ceil(B.length / n));
  const labPkt = [...packetBytes(0, pk, binaryMode), packetCrc(0, pk, binaryMode)];
  const si = p4('10.0.0.2'), di = p4('93.184.216.34');
  const tcp = tcpSegment({ src: si, dst: di, sp: 49732, dp: 80, seq: 1000, ack: 5000, flags: FL.PSH | FL.ACK, payload: labPkt });
  const ip = ipv4Packet({ src: si, dst: di, proto: 6, ttl: 64, payload: tcp });
  const eth = ethFrame({ dst: MAC.gw, src: MAC.client, payload: ip });
  const ip2 = ipv4Packet({ src: si, dst: di, proto: 6, ttl: 63, payload: tcp });
  const eth2 = ethFrame({ dst: [0x00, 0x1b, 0x44, 0x20, 0x8c, 0x02], src: MAC.gw, payload: ip2 });
  const pr = parseFrame(eth2.bytes);
  const chars = Array.from(m);
  const textPreview = m.length > 32 ? m.slice(0, 32) + '…' : m;
  const cu = c => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
  const hx = hexs(B.slice(0, 10)) + (B.length > 10 ? ' …' : '');
  const pl = hexs(pk);
  const w = (a, i) => '0x' + rd16(a, i).toString(16).padStart(4, '0');
  const f32 = x => (x >>> 0).toString(16).padStart(8, '0');
  const headerBytes = binaryMode ? 4 : 2;
  const fileLabel = fileName || typeLabel;
  const stages = [
    {
      n: 'Message',
      r: binaryMode ? typeLabel + ': ' + fileLabel : 'Text: ' + textPreview,
      s: binaryMode ? fileSize.toLocaleString() + ' file bytes' : chars.length + ' characters',
      e: binaryMode ? 'The application selects a ' + typeLabel.toLowerCase() + ' file. Its original binary bytes are read directly; the file is not treated as UTF-8 text.' : 'You type a message. The application encodes the characters before the networking layers carry the data.',
      b: binaryMode ? [['File', fileLabel, 'c0'], ['MIME type', mimeType || 'unknown', 'c1'], ['File size', fileSize.toLocaleString() + ' bytes', 'c2']] : [['Message', textPreview, 'c0']],
    },
    {
      n: 'Encoding',
      r: binaryMode ? 'Original binary data' : 'UTF-8 code points',
      s: binaryMode ? B.length + ' bytes' : chars.length + ' code points',
      e: binaryMode ? 'Image, video, document and audio files are already binary. Their bytes must be preserved exactly; UTF-8 decoding is not appropriate for arbitrary file contents.' : 'Each Unicode code point is converted to one to four UTF-8 bytes.',
      b: binaryMode ? [['Conversion', 'None — preserve original bytes', 'c0'], ['First bytes', hexs(B.slice(0, 8)) || 'No file loaded', 'c1']] : chars.slice(0, 5).map(c => [c, cu(c), 'c0']),
    },
    {
      n: 'Byte stream',
      r: binaryMode ? 'Binary byte stream' : hx,
      s: B.length.toLocaleString() + ' bytes',
      e: binaryMode ? 'The complete original file is represented as bytes. A short sample is shown here; all bytes remain in the shared simulator state.' : 'The message is now a plain sequence of bytes. Lower layers carry these bytes without interpreting the original words.',
      b: [['Data type', typeLabel, 'c1'], ['First bytes', hx || 'No data loaded', 'c0']],
      bytes: B.slice(0, 32),
    },
    {
      n: 'Packetization',
      r: 'Packet 1 of ' + np,
      s: pk.length + ' payload bytes + ' + (headerBytes + 1) + ' overhead bytes',
      e: 'The stream is divided into ' + np.toLocaleString() + ' payload chunks of up to ' + n.toLocaleString() + ' bytes. ' + (binaryMode ? 'Binary packets use the same extended 16-bit sequence/length header (4 bytes) and CRC-8 trailer as the core simulator.' : 'Text packets use the compact sequence/length header (2 bytes) and CRC-8 trailer used by the core simulator.') + ' This stage displays the first packet as a sample.',
      b: [['Header', binaryMode ? '16-bit sequence and length' : '8-bit sequence and length', 'c3'], ['Payload sample', pl || 'Empty payload', 'c0'], ['CRC-8', hex(packetCrc(0, pk, binaryMode)), 'c3'], ['Total packets', np.toLocaleString(), 'c2']],
      bytes: labPkt,
    },
    {
      n: 'Transport', r: 'TCP segment', s: tcp.length + ' bytes',
      e: 'TCP adds ports, sequence and acknowledgement numbers, and a checksum. This is a representative segment carrying the first application packet; a real file transfer is carried as a stream across multiple segments.',
      b: [['Ports', '49732 → 80', 'c2'], ['Sequence', '1000', 'c2'], ['Checksum', w(tcp, 16), 'c2'], ['Data', 'First application packet', 'c0']], bytes: tcp,
    },
    {
      n: 'Network', r: 'IPv4 packet', s: ip.length + ' bytes',
      e: 'IP addresses identify the source and destination hosts. TTL limits packet lifetime and the IPv4 header has its own checksum.',
      b: [['Addresses', '10.0.0.2 → 93.184.216.34', 'c1'], ['TTL', '64', 'c1'], ['Header checksum', w(ip, 10), 'c1'], ['Payload', 'TCP segment', 'c2']], bytes: ip,
    },
    {
      n: 'Link frame', r: 'Ethernet frame', s: eth.bytes.length + ' bytes',
      e: 'Ethernet carries the IP packet across one local link, adding next-hop MAC addresses and a frame check sequence (FCS).',
      b: [['MACs', macStr(MAC.client) + ' → ' + macStr(MAC.gw), 'c3'], ['IP packet', ip.length + ' bytes', 'c1'], ['FCS / CRC-32', f32(crc32(eth.bytes.slice(0, -4))), 'c3']], bytes: eth.bytes,
    },
    {
      n: 'Transmission', r: 'Bits on the medium', s: eth.bytes.length * 8 + ' bits in this example frame',
      e: 'The frame is serialized into bits and represented physically as electrical, optical or radio signals. A real file transfer sends many frames over time.',
      b: [['First bits', eth.bytes.slice(0, 4).map(bin8).join(' ') + ' …', 'c0'], ['Medium', 'Copper / fibre / radio', 'c1']],
    },
    {
      n: 'Router', r: 'Forwarding to next hop', s: 'TTL 64 → 63',
      e: 'The router removes the incoming link frame, checks the IP destination, decrements TTL and recalculates the IP checksum. It creates a new link frame with new MAC addresses; the IP addresses and TCP data remain unchanged.',
      b: [['TTL', '64 → 63', 'c1'], ['IP checksum', w(ip, 10) + ' → ' + w(ip2, 10), 'c1'], ['New MACs', macStr(eth2.bytes.slice(6, 12)) + ' → ' + macStr(eth2.bytes.slice(0, 6)), 'c3'], ['New FCS', f32(crc32(eth2.bytes.slice(0, -4))), 'c3']], bytes: eth2.bytes,
    },
    {
      n: 'Receiver checks', r: 'Verify and unwrap', s: 'Layer headers checked',
      e: 'The receiver validates the received frame and packet information, removes encapsulation headers and passes application data upward. Missing or damaged data must not be reported as a complete file.',
      b: pr.checks.map(c => [c.layer, c.ok ? 'valid' : 'BAD', c.ok ? 'c2' : 'c1']),
    },
    {
      n: 'Reassembly', r: np.toLocaleString() + ' packet slots', s: B.length.toLocaleString() + ' payload bytes',
      e: 'The receiver places payload chunks in sequence order and joins them into the original byte stream. A complete file is available only when every required packet has arrived.',
      b: [['Expected packets', np.toLocaleString(), 'c2'], ['Payload length', B.length.toLocaleString() + ' bytes', 'c0'], ['Ordering', 'Sequence number', 'c1']],
    },
    {
      n: 'Decoding', r: binaryMode ? 'Preserve binary bytes' : 'UTF-8 decode',
      s: binaryMode ? B.length.toLocaleString() + ' bytes' : chars.length + ' characters',
      e: binaryMode ? 'Binary files are not decoded as UTF-8. The receiver preserves the reassembled bytes and uses the original file type and MIME type for preview or download.' : 'The receiver decodes the reassembled UTF-8 byte sequence back into Unicode characters.',
      b: binaryMode ? [['Operation', 'No text decoding', 'c0'], ['File type', typeLabel, 'c1'], ['MIME type', mimeType || 'unknown', 'c2']] : [['Bytes', hx, 'c0'], ['Characters', textPreview, 'c2']],
    },
    {
      n: 'Original', r: binaryMode ? typeLabel + ' reconstructed' : 'Text: ' + textPreview,
      s: binaryMode ? B.length.toLocaleString() + ' bytes restored' : chars.length + ' characters',
      e: binaryMode ? 'The receiver has the original ' + typeLabel.toLowerCase() + ' byte stream again. It can now be previewed or downloaded with its original filename and MIME type.' : 'The original message arrives unchanged. The networking layers transported bytes; the application turns them back into the message.',
      b: binaryMode ? [['File', fileLabel, 'c2'], ['Restored bytes', B.length.toLocaleString(), 'c0'], ['MIME type', mimeType || 'unknown', 'c1']] : [['Message', textPreview, 'c2']],
      previewUrl, fileName, mimeType, dataType: type,
    },
  ];
  return stages.map(x => Object.assign({ bytes: null }, x));
}

/* Register "End-to-end journey". The router calls mount(root) when the learner opens #/m/journey and calls the returned function (if any) when they leave. */
regMod({
  id: 'journey',
  group: 'learn',
  title: 'End-to-end journey',
  desc: 'Follow your own message from words to bytes, packets, frames and back, with the real bytes at every stage.',
  obj: [
    'Name every stage between keyboard and receiver.',
    'Inspect the bytes each layer produces.',
    'See what a router changes and what it leaves alone.',
  ],
  mount(root) {
    const JD = journeyData();
    let i = 0,
      timer = null;
    root.innerHTML =
      panel(
        'Stage timeline',
        '<p class="hint" id="jc"></p><div class="bar"><i id="jb"></i></div><div class="lpath" id="jt"></div>'
      ) +
      '<div class="panel"><p class="hint" id="jdata"></p><h3 id="jn"></h3><p class="hint" id="jr"></p><div id="jv"></div><div id="jbytes"></div></div>' +
      '<div class="cols2"><div class="panel"><h3>Representation inspector</h3><ul class="ul" id="ji"></ul></div><div class="panel"><h3>What is happening</h3><p id="je" class="lead"></p></div></div>' +
      '<div class="foot"><div class="btnrow"><button class="btn ghost" id="jp">← Previous</button><button class="btn ghost" id="jpl">Play</button></div><button class="btn" id="jx">Next stage →</button></div>';
    const render = () => {
      const j = JD[i];
      $('#jt', root).innerHTML = JD.map(
        (x, k) =>
          `<button class="step${k < i ? ' done' : k === i ? ' cur' : ''}" data-j="${k}">${x.n}</button>`
      ).join('');
      $('#jc', root).textContent = `Stage ${i + 1} of ${JD.length}`;
      $('#jb', root).style.width = ((i + 1) / JD.length) * 100 + '%';
      $('#jn', root).textContent = j.n;
      $('#jdata', root).textContent = JD[0].e;
      $('#jr', root).textContent = j.r;
      $('#jv', root).innerHTML = kb(j.b);
      $('#jbytes', root).innerHTML = j.bytes
        ? hn(`${j.bytes.length} bytes${j.bytes.length > 64 ? ' (first 64 shown)' : ''}`) +
          chipRow(j.bytes.slice(0, 64).map(hex), () => 'c0')
        : '';
      if (j.previewUrl) {
        const preview = document.createElement('div');
        preview.className = 'journey-file-preview';
        if (j.dataType === 'image') {
          const img = document.createElement('img'); img.src = j.previewUrl; img.alt = 'Selected image'; img.className = 'reconstructed-image'; preview.append(img);
        } else if (j.dataType === 'video') {
          const video = document.createElement('video'); video.src = j.previewUrl; video.controls = true; video.preload = 'metadata'; preview.append(video);
        } else if (j.dataType === 'audio') {
          const audio = document.createElement('audio'); audio.src = j.previewUrl; audio.controls = true; preview.append(audio);
        } else if (j.mimeType === 'application/pdf') {
          const frame = document.createElement('iframe'); frame.src = j.previewUrl; frame.title = 'Selected PDF'; frame.className = 'document-pdf-preview'; preview.append(frame);
        }
        const link = document.createElement('a'); link.href = j.previewUrl; link.download = j.fileName || 'original-file';
        link.className = 'btn ghost'; link.textContent = 'Open / download original file'; preview.append(link);
        $('#jbytes', root).append(preview);
      }
      $('#ji', root).innerHTML =
        `<li>Layer: ${j.n}</li><li>Representation: ${esc(j.r)}</li><li>Size: ${esc(j.s)}</li>`;
      $('#je', root).textContent = j.e;
      $('#jp', root).toggleAttribute('disabled', i === 0);
      $('#jx', root).toggleAttribute('disabled', i === JD.length - 1);
    };
    on(root, 'click', '[data-j]', (e, b) => {
      i = +b.dataset.j;
      render();
    });
    $('#jp', root).onclick = () => {
      if (i > 0) {
        i--;
        render();
      }
    };
    $('#jx', root).onclick = () => {
      if (i < JD.length - 1) {
        i++;
        render();
      }
    };
    $('#jpl', root).onclick = () => {
      clearInterval(timer);
      i = 0;
      render();
      timer = setInterval(
        () => {
          if (i >= JD.length - 1) clearInterval(timer);
          else {
            i++;
            render();
          }
        },
        REDUCE ? 40 : 1300
      );
    };
    render();
    // Cleanup: stop the auto-play timer if the learner leaves mid-play.
    return () => clearInterval(timer);
  },
});
