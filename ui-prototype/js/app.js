const $ = (id) => document.getElementById(id),
  hex = (b) => b.toString(16).padStart(2, "0"),
  bin = (b) => b.toString(2).padStart(8, "0"),
  enc = new TextEncoder();
const names = [
  ["Message & Encoding", "Words to bytes"],
  ["Packetization", "Split the stream"],
  ["Transmission Lab", "Cross the link"],
  ["Receiver & Reconstruction", "Rebuild the message"],
];
const S = { bytes: [], P: [], run: null, up: true, done: [0, 0, 0, 0] };
let busy = false,
  timer;
const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches,
  dly = (ms) => new Promise((r) => setTimeout(r, reduce ? 30 : ms));
names.forEach((n, i) => {
  const b = document.createElement("button");
  b.innerHTML = `<span class="num">${i + 1}</span><span><b>${n[0]}</b><span class="d">${n[1]}</span></span>`;
  b.onclick = () => go(i);
  $("nav").append(b);
});
function go(i) {
  if (busy) return;
  document
    .querySelectorAll(".stage")
    .forEach((s, k) => s.classList.toggle("on", k === i));
  [...$("nav").children].forEach((b, k) => {
    b.setAttribute("aria-current", k === i);
    if (k < i) S.done[k] = 1;
    b.classList.toggle("done", !!S.done[k] && k !== i);
  });
  if (i == 1) split();
  if (i == 3) recv();
  scrollTo(0, 0);
}
document
  .querySelectorAll("[data-go]")
  .forEach((b) => (b.onclick = () => go(+b.dataset.go)));
function encode() {
  const m = Array.from($("msg").value || " ");
  S.bytes = [];
  let h = "";
  m.forEach((c) => {
    Array.from(enc.encode(c)).forEach((b, j) => {
      S.bytes.push(b);
      h += `<div class="by"><div class="g${j ? " c" : ""}"></div><div class="h">${hex(b)}</div><div class="dec">decimal ${b}</div><div class="bits">${bin(
        b,
      )
        .split("")
        .map((x) => `<i class="${x == "1" ? "on" : ""}"></i>`)
        .join("")}</div></div>`;
    });
  });
  $("bytes").innerHTML = h;
  let k = 0;
  const gs = $("bytes").querySelectorAll(".g");
  m.forEach((c) => {
    const n = enc.encode(c).length;
    gs[k].textContent = c;
    for (let j = 1; j < n; j++) gs[k + j].textContent = "part " + (j + 1);
    k += n;
  });
  $("bsum").textContent =
    `${m.length} characters became ${S.bytes.length} bytes.`;
  $("n1").textContent = S.bytes.length;
}
function split() {
  const n = +$("ps").value;
  $("psv").textContent = n;
  S.P = [];
  for (let i = 0; i < S.bytes.length; i += n) S.P.push(S.bytes.slice(i, i + n));
  S.run = null;
  $("pstream").innerHTML = S.P.map((p, i) =>
    p
      .map((x) => `<span class="chip c${i % 4}" data-p="${i}">${hex(x)}</span>`)
      .join(""),
  ).join("");
  $("pk").innerHTML = S.P.map(
    (p, i) =>
      `<div class="pk c${i % 4}" data-p="${i}"><div class="t"><span>Packet ${i + 1}</span><span>${p.length}B</span></div><div class="s"><b>Header</b>Sequence ${i + 1}, length ${p.length}</div><div class="s"><b>Payload</b><span>${p.map(hex).join(" ")}</span></div></div>`,
  ).join("");
  $("n2").textContent = S.P.length;
  $("n3").textContent = 0;
  resetLab();
}
$("pk").addEventListener("mouseover", (e) => {
  const c = e.target.closest(".pk"),
    s = $("pstream");
  s.classList.toggle("dim", !!c);
  s.querySelectorAll(".chip").forEach((x) =>
    x.classList.toggle("hl", !!c && x.dataset.p == c.dataset.p),
  );
});
$("pk").addEventListener("mouseleave", () =>
  $("pstream").classList.remove("dim"),
);
function resetLab() {
  const q = S.P.map(
    (_, i) => `<span class="chip c${i % 4}" id="q${i}">P${i + 1}</span>`,
  ).join("");
  $("sq").innerHTML = q;
  $("rq").innerHTML = "";
  $("sp").textContent = "Ready";
  $("rp").textContent = "Waiting";
  $("st").textContent = "Press Transmit to start.";
  $("log").innerHTML =
    '<li><span class="tag">INFO</span>Nothing sent yet.</li>';
}
function log(t, m) {
  const li = document.createElement("li");
  li.innerHTML = `<span class="tag ${t[1]}">${t[0]}</span>${m}`;
  if (
    $("log").querySelector(".tag:not(.ok):not(.bad):not(.re)") &&
    $("log").children.length == 1 &&
    $("log").textContent.includes("Nothing")
  )
    $("log").innerHTML = "";
  $("log").prepend(li);
}
const fly = (el, to, ms) =>
  el.animate([{ left: el.style.left || "0%" }, { left: to }], {
    duration: reduce ? 30 : ms,
    easing: "ease-in-out",
    fill: "forwards",
  }).finished;
async function transmit() {
  if (busy || !S.up) return;
  if (!S.P.length) split();
  busy = true;
  $("go").setAttribute("aria-disabled", "true");
  resetLab();
  const P = S.P,
    order = P.map((_, i) => i);
  if ($("ord").value == "r") order.reverse();
  const loss = +$("loss").value / 100,
    run = (S.run = { arr: [], got: Array(P.length).fill(null), retries: 0 });
  $("n3").textContent = 0;
  const pkt = $("pkt"),
    ack = $("ack");
  $("sp").textContent = "Transmitting";
  for (const i of order) {
    let ok = false;
    for (let a = 0; a < 4 && !ok; a++) {
      const lost = Math.random() < loss,
        q = $("q" + i);
      q.classList.add("live");
      pkt.textContent = "P" + (i + 1);
      pkt.className = "fly";
      pkt.style.opacity = 1;
      $("st").textContent = a
        ? `Retransmitting packet ${i + 1} (retry ${a} of 3)...`
        : `Sending packet ${i + 1}...`;
      log(
        a ? ["RETRY", "re"] : ["SEND"],
        `Packet ${i + 1} ${a ? "sent again" : "sent"}.`,
      );
      await fly(pkt, lost ? "50%" : "100%", 900);
      if (lost) {
        pkt.className = "fly pop";
        await dly(450);
        pkt.style.opacity = 0;
        q.classList.remove("live");
        q.classList.add("bad");
        run.retries++;
        $("n3").textContent = run.retries;
        $("st").textContent = `Packet ${i + 1} was lost. No ACK came back.`;
        log(["LOST", "bad"], `Packet ${i + 1} vanished on the link.`);
        await dly(500);
        q.classList.remove("bad");
        pkt.style.left = "0%";
        continue;
      }
      ok = true;
      pkt.style.opacity = 0;
      pkt.getAnimations().forEach((x) => x.cancel());
      pkt.style.left = "0%";
      run.got[i] = P[i];
      run.arr.push(i);
      $("rp").textContent = `${run.arr.length} of ${P.length} received`;
      $("rq").insertAdjacentHTML(
        "beforeend",
        `<span class="chip c${i % 4} live">P${i + 1}</span>`,
      );
      ack.textContent = "ACK " + (i + 1);
      ack.style.opacity = 1;
      ack.style.left = "100%";
      $("st").textContent = `Packet ${i + 1} arrived. ACK on its way back.`;
      await fly(ack, "0%", 700);
      ack.style.opacity = 0;
      ack.getAnimations().forEach((x) => x.cancel());
      ack.style.left = "100%";
      q.classList.remove("live");
      q.classList.add("ok");
      log(["ACK", "ok"], `Packet ${i + 1} acknowledged.`);
      await dly(250);
    }
    if (!ok) {
      $("q" + i).classList.add("bad");
      log(["FAIL", "bad"], `Packet ${i + 1} gave up after 4 attempts.`);
    }
  }
  const miss = run.got.filter((x) => !x).length;
  $("sp").textContent = miss ? "Gave up" : "All sent";
  $("rp").textContent = miss ? `${miss} missing` : "Everything arrived";
  $("st").textContent = miss
    ? "Transmission incomplete. Open the receiver to see the gap."
    : "Transmission complete. Open the receiver to see the result.";
  busy = false;
  $("go").removeAttribute("aria-disabled");
}
$("go").onclick = transmit;
function recv() {
  const r = S.run;
  $("rEmpty").style.display = r ? "none" : "";
  $("rBody").style.display = r ? "" : "none";
  if (!r) return;
  clearInterval(timer);
  $("arr").innerHTML =
    r.arr
      .map(
        (x, i) =>
          `<li><span class="tag ok">${i + 1}</span>Packet ${x + 1} arrived</li>`,
      )
      .join("") || "<li>Nothing arrived.</li>";
  $("slots").innerHTML = r.got
    .map((p, i) =>
      p
        ? `<div class="slot ok"><b>Slot ${i + 1}</b><span>${p.map(hex).join(" ")}</span></div>`
        : `<div class="slot miss"><b>Slot ${i + 1}</b><span>missing</span></div>`,
    )
    .join("");
  const miss = r.got.filter((x) => !x).length;
  $("rc").textContent = miss
    ? `${miss} slot${miss > 1 ? "s" : ""} still empty.`
    : "Every slot is filled.";
  const res = $("res");
  res.className = "result";
  if (miss) {
    res.classList.add("bad");
    res.textContent =
      "Can’t decode: packets are missing, so the original message can’t be rebuilt.";
    return;
  }
  const t = Array.from(new TextDecoder().decode(new Uint8Array(r.got.flat())));
  let k = 0;
  res.textContent = "";
  res.classList.add("caret");
  timer = setInterval(
    () => {
      res.firstChild ? (res.firstChild.nodeValue += t[k]) : res.append(t[k]);
      if (++k >= t.length) {
        clearInterval(timer);
        res.classList.remove("caret");
      }
    },
    reduce ? 5 : 90,
  );
}
$("msg").oninput = encode;
$("ps").oninput = split;
$("lb").onclick = () => {
  S.up = !S.up;
  $("link").classList.toggle("off", !S.up);
  $("ls").textContent = S.up ? "Link is up" : "Link is down";
  $("lb").textContent = S.up ? "Take link down" : "Bring link up";
  $("go").textContent = S.up ? "Transmit packets" : "Link is down";
  $("go").toggleAttribute("aria-disabled", !S.up);
};
const MD =
  `Link and errors|Framing and stuffing|Mark where one frame ends and the next begins.|2|Compare length, byte, and bit framing;See where stuffing adds bits|Method tabs;Before and after bit view;Stuffed bits highlighted|displayByteStream() chip pattern~Link and errors|Error detection|Add parity, a checksum, or a CRC, then flip bits and see what gets caught.|2|Compare detection methods;Read a pass or fail result|Error-injection controls;Before and after binary;Result panel|encodeMessage() bit cards~Reliable transfer|Stop-and-Wait|Send one frame, wait for its ACK, resend on timeout.|3|Trace a lost ACK;Read a timeline|Two-lane timeline;Timer ring;Lost ACK scenario|transmitPackets() flight and ACK animation~Reliable transfer|Go-Back-N and Selective Repeat|Keep several frames in flight with a sliding window.|3|Slide a window;Compare resend behavior|Window strip;Sequence-number space;Per-frame timers|transmitPackets(), delay()~Network layer|Addressing and subnets|Split an address into network and host bits.|4|Read CIDR notation;Find subnet ranges|Address bit grid;CIDR slider;Subnet table|New logic needed~Network layer|IP headers and fragments|Inspect IPv4 and IPv6 fields, TTL, and fragmentation.|4|Read header fields;Watch TTL drop|Field inspector;Fragment strip;TTL meter|Packet splitting in the Create Packets handler~Network layer|Routing and forwarding|Follow a packet router by router.|4|Read a routing table;Trace a path|Topology map;Routing table;Hop-by-hop journey|Travelling packet animation~Transport layer|TCP and UDP|Compare segments and datagrams side by side.|4|Spot header differences;Pick the right protocol|Two header inspectors;Comparison table|Packet card markup~Transport layer|Handshake and teardown|Open and close a TCP connection.|4|Follow SYN, SYN-ACK, ACK;Read sequence numbers|Message ladder;State badges;Sequence fields|log() event list~Transport layer|Flow and congestion control|See how windows grow, shrink, and back off.|4|Read a window graph;Compare slow start and recovery|Window chart;Timer panel;Loss events|packetIsLost() settings~Application layer|DNS|Follow a name lookup from browser to answer.|5|Walk the resolver chain;Read record types|Lookup journey;Record inspector|log() event list~Application layer|HTTP and TLS|Request, response, and the secure handshake.|5|Read a request and response;Follow the TLS handshake|Request pane;Response pane;Handshake ladder|reassembledMessage view~Advanced|Sockets and multiplexing|Many conversations share one link through ports.|5|Match ports to sockets;See demultiplexing|Port map;Socket table|New logic needed~Advanced|Encapsulation stack|Wrap data in a header at every layer, then unwrap it.|5|Add and remove headers;Inspect each layer|Layer stack;Header peel animation|Packet header and payload cards~Advanced|Packet capture explorer|Browse a sample capture like a protocol analyzer.|5|Filter packets;Read decoded layers|Packet list;Detail tree;Hex pane|Byte stream chips~Advanced|Troubleshooting lab|Find the fault in a broken network scenario.|5|Form a hypothesis;Test it|Scenario brief;Tool panel;Findings notes|New logic needed~Journey and learning|End-to-end journey|Follow one message from words to bytes, packets, frames, and back.|2|Name every stage;Inspect each representation|Stage timeline;Representation inspector;Explainer panel|All four core stages~Journey and learning|Tutorials and experiments|Guided steps with notes and observations.|5|Follow a guided lab;Record what you saw|Step list;Notes panel;Objectives card|New content only~Journey and learning|Challenges and checks|Test what you learned, with hints and reveals.|5|Answer knowledge checks;Use hints sparingly|Question card;Hint drawer;Solution reveal|Quiz card pattern~Journey and learning|Reference and glossary|Look up protocols and terms, with related concepts.|5|Find a term fast;Follow related links|Search box;Term cards;Related-concept chips|New content only`
    .split("~")
    .map((l) => {
      const a = l.split("|");
      return {
        g: a[0],
        n: a[1],
        d: a[2],
        p: a[3],
        o: a[4].split(";"),
        u: a[5].split(";"),
        r: a[6],
      };
    });
const V = Object.fromEntries(
  ["Framing and stuffing:sF", "Error detection:sE", "End-to-end journey:sJ"]
    .concat(
      [
        "Stop-and-Wait",
        "Go-Back-N and Selective Repeat",
        "Addressing and subnets",
        "IP headers and fragments",
        "Routing and forwarding",
        "TCP and UDP",
        "Handshake and teardown",
        "Flow and congestion control",
        "DNS",
        "HTTP and TLS",
        "Sockets and multiplexing",
        "Encapsulation stack",
        "Packet capture explorer",
        "Troubleshooting lab",
        "Tutorials and experiments",
        "Challenges and checks",
        "Reference and glossary",
      ].map((n) => n + ":sX"),
    )
    .map((x) => x.split(":")),
);
function vis(id) {
  if (busy) return;
  document
    .querySelectorAll(".stage")
    .forEach((s) => s.classList.toggle("on", s.id === id));
  [...$("nav").children].forEach((b) =>
    b.setAttribute("aria-current", "false"),
  );
  $("nav2")
    .querySelectorAll("button")
    .forEach((b) => b.setAttribute("aria-current", "false"));
  scrollTo(0, 0);
}
function dash() {
  vis("sD");
}
function mod(i) {
  if (busy) return;
  const m = MD[i];
  vis("sM");
  $("mT").textContent = m.n;
  $("mD").textContent = m.d;
  $("mP").textContent =
    "Planned for phase " + m.p + ". Layout only, no behavior yet.";
  $("mO").innerHTML = m.o.map((x) => `<li>${x}</li>`).join("");
  $("mU").innerHTML = m.u.map((x) => `<li>${x}</li>`).join("");
  $("mR").textContent = m.r;
  $("nav2").querySelectorAll("button")[i].setAttribute("aria-current", "true");
}
{
  const g0 = go;
  go = (i) => {
    $("nav2")
      .querySelectorAll("button")
      .forEach((b) => b.setAttribute("aria-current", "false"));
    g0(i);
  };
}
[...new Set(MD.map((m) => m.g))].forEach((g) => {
  const d = document.createElement("details");
  d.className = "grp";
  d.innerHTML = `<summary>${g}</summary><nav class='sub'></nav>`;
  MD.forEach((m, i) => {
    if (m.g != g) return;
    const b = document.createElement("button");
    b.innerHTML = `<span>${m.n}</span><span class='pill${V[m.n] ? " mock" : ""}'>${V[m.n] ? "Mockup" : "Phase " + m.p}</span>`;
    b.onclick = () => mod(i);
    d.querySelector("nav").append(b);
  });
  $("nav2").append(d);
});
$("mods").innerHTML =
  names
    .map(
      (n, i) =>
        `<button class='mc' onclick='go(${i})'><span class='pill live'>Live</span><h3>${n[0]}</h3><p>${n[1]}</p></button>`,
    )
    .join("") +
  MD.map(
    (m, i) =>
      `<button class='mc' onclick='mod(${i})'><span class='pill${V[m.n] ? " mock" : ""}'>${V[m.n] ? "Mockup" : "Phase " + m.p}</span><h3>${m.n}</h3><p>${m.d}</p></button>`,
  ).join("");
{
  const m0 = mod;
  mod = (i) => {
    const v = V[MD[i].n];
    if (!v) return m0(i);
    if (busy) return;
    vis(v);
    $("nav2")
      .querySelectorAll("button")
      [i].setAttribute("aria-current", "true");
  };
}
const R = (s, f) =>
  s
    .split(" ")
    .map((x, i) => `<span class='chip ${f(i)}'>${x}</span>`)
    .join("");
const BT = (s, f) =>
  s
    .split("")
    .map((x, i) => `<span class='chip bt ${f(i)}'>${x}</span>`)
    .join("");
const fill = {
  f1a: R("05 48 65 6c 6c 6f", (i) => (i ? "c0" : "c3")),
  f2a: R("48 7e 6c 7d 6f", (i) => (i == 1 || i == 3 ? "c3" : "c0")),
  f2b: R("7e 48 7d 5e 6c 7d 5d 6f 7e", (i) =>
    i % 8 == 0 ? "c2" : [2, 3, 5, 6].includes(i) ? "c1" : "c0",
  ),
  f3a: BT("0111111011111010", () => "c0"),
  f3b: BT("011111010111110010", (i) => (i == 6 || i == 14 ? "c1" : "c0")),
  e1a: BT("010010000", (i) => (i == 8 ? "c3" : "c0")),
  e1b: BT("010110000", (i) => (i == 3 ? "c1" : i == 8 ? "c3" : "c0")),
  e1c: BT("010110010", (i) => (i == 3 || i == 7 ? "c1" : i == 8 ? "c3" : "c0")),
  e2a: R("48 65 52", (i) => (i == 2 ? "c3" : "c0")),
  e2b: R("58 65 52", (i) => (i == 0 ? "c1" : i == 2 ? "c3" : "c0")),
  e3a: R("48 ff", (i) => (i ? "c3" : "c0")),
  e3b: R("58 ff", (i) => (i ? "c3" : "c1")),
};
Object.keys(fill).forEach((k) => ($(k).innerHTML = fill[k]));
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-t]");
  if (!t) return;
  const s = t.closest(".stage");
  s.querySelectorAll("[data-t]").forEach((x) =>
    x.classList.toggle("cur", x === t),
  );
  s.querySelectorAll(".tp").forEach(
    (p) => (p.hidden = p.dataset.p !== t.dataset.t),
  );
});
const JD =
  `Message|Message:Hi:c0|Text: Hi|2 characters|You type a message. The network does not know about letters yet.~Encoding|H:U+0048:c0;i:U+0069:c0|H is U+0048, i is U+0069|2 code points|Each character has a code point. UTF-8 turns each one into bytes.~Byte stream|Byte 1:48:c0;Byte 2:69:c0|48 69|2 bytes|The message is now a plain sequence of bytes.~Packetization|Header:seq 1, length 2:c3;Payload:48 69:c0|Packet 1 of 1|2 bytes plus header|The stream is cut into packets with sequence numbers and lengths.~Transport|Transport header:port 5000 to 80:c2;Data:48 69:c0|Segment|header plus 2 bytes|Port numbers say which application gets the data.~Network|IP header:10.0.0.2 to 10.0.1.9, TTL 64:c1;Segment:ports plus 48 69:c2|Packet|header plus segment|Addresses say which machine the data is for.~Link frame|Frame header:next-hop address:c3;IP packet:header plus segment:c1;Check:CRC:c3|Frame|header, packet, CRC|The frame carries the packet across one link and adds an error check.~Transmission|Bits:01001000 01101001 ...:c0|Signal on the wire|bits|The frame becomes bits travelling over the link.~Router|Router 1:TTL 64 to 63:c1;New frame:next-hop address:c3|At a router|TTL drops by 1|Each router rewrites the frame header and lowers the TTL.~Receiver|Frame check:CRC ok:c2;Unwrap:frame, packet, segment:c2|At the receiver|headers removed|Each layer checks its header, then removes it.~Reassembly|Slot 1:48 69:c2|1 of 1 slots filled|2 bytes|Packets are placed in sequence-number order.~Decoding|Bytes:48 69:c0;Characters:H i:c2|UTF-8 decode|2 characters|Bytes become code points, then characters.~Original|Message:Hi:c2|Text: Hi|2 characters|The message arrives unchanged.`
    .split("~")
    .map((l) => {
      const a = l.split("|");
      return {
        n: a[0],
        b: a[1].split(";").map((x) => x.split(":")),
        r: a[2],
        s: a[3],
        e: a[4],
      };
    });
let jIdx = 0;
function jRender() {
  const j = JD[jIdx];
  $("jt").innerHTML = JD.map(
    (x, i) =>
      `<button class='step${i < jIdx ? " done" : i == jIdx ? " cur" : ""}' data-j='${i}'>${x.n}</button>`,
  ).join("");
  $("jc").textContent = `Stage ${jIdx + 1} of ${JD.length}`;
  $("jb").style.width = ((jIdx + 1) / JD.length) * 100 + "%";
  $("jn").textContent = j.n;
  $("jr").textContent = j.r;
  $("jv").innerHTML = j.b
    .map(
      (b) =>
        `<div class='blk ${b[2]}'><b>${b[0]}</b><span>${b[1]}</span></div>`,
    )
    .join("");
  $("ji").innerHTML =
    `<li>Layer: ${j.n}</li><li>Representation: ${j.r}</li><li>Size: ${j.s}</li>`;
  $("je").textContent = j.e;
  $("jp").setAttribute("aria-disabled", jIdx == 0);
  $("jx").setAttribute("aria-disabled", jIdx == JD.length - 1);
}
$("jt").onclick = (e) => {
  const b = e.target.closest("[data-j]");
  if (b) {
    jIdx = +b.dataset.j;
    jRender();
  }
};
$("jp").onclick = () => {
  if (jIdx > 0) {
    jIdx--;
    jRender();
  }
};
$("jx").onclick = () => {
  if (jIdx < JD.length - 1) {
    jIdx++;
    jRender();
  }
};
const tb = (r) =>
    `<div style='overflow-x:auto'><table class='tb'>${r
      .split(";")
      .map(
        (x, i) =>
          `<tr>${x
            .split("|")
            .map((c) => (i ? `<td>${c}</td>` : `<th>${c}</th>`))
            .join("")}</tr>`,
      )
      .join("")}</table></div>`,
  hn = (t) => `<p class='hint'>${t}</p>`,
  kb = (s) =>
    `<div class='blks'>${s
      .split(";")
      .map((x) => {
        const b = x.split("#");
        return `<div class='blk ${b[2]}'><b>${b[0]}</b><span>${b[1]}</span></div>`;
      })
      .join("")}</div>`,
  ld = (n, rows) =>
    `<div class='lad'><div class='ln'><b>${n.split("|")[0]}</b><b>${n.split("|")[1]}</b></div>${rows
      .split(";")
      .map((x) => {
        const a = x.split("|");
        return `<div class='lr ${a[0]} ${a[2]}'>${a[0] == "r" ? a[1] + " →" : "← " + a[1]}</div>`;
      })
      .join("")}</div>`,
  vd = (c, b, t) => `<div class='verdict ${c}'><b>${b}</b> ${t}</div>`,
  br = (s, l) =>
    `<div class='bars'>${s
      .split(" ")
      .map(
        (x, i) =>
          `<div class='br${i == l ? " c1" : ""}' style='height:${x * 5}px'><span>${x}</span></div>`,
      )
      .join("")}</div>`,
  ol = (a) => `<ol class='ul'>${a.map((x) => `<li>${x}</li>`).join("")}</ol>`,
  gl = (a) =>
    `<div class='dgrid'>${a.map((x) => `<div class='mc'><h3>${x[0]}</h3><p>${x[1]}</p></div>`).join("")}</div>`,
  win = R("0 1 2 3 4 5 6 7", (i) => (i < 2 ? "c2" : i < 6 ? "c0" : "c4"));
const UI = {
  "Stop-and-Wait": [
    [
      "Normal flow",
      hn("Send one frame, then wait for its ACK before sending the next."),
      ld(
        "Sender|Receiver",
        "r|Data seq 0|c0;l|ACK 1|c2;r|Data seq 1|c0;l|ACK 0|c2",
      ),
      vd(
        "c2",
        "Delivered.",
        "Each frame is acknowledged before the next one goes out.",
      ),
    ],
    [
      "Lost ACK",
      hn(
        "The ACK is lost, so the sender’s timer expires and it sends the frame again.",
      ),
      ld(
        "Sender|Receiver",
        "r|Data seq 0|c0;l|ACK 1 (lost)|c1;r|Timeout, resend seq 0|c3;l|ACK 1|c2",
      ),
      vd(
        "c3",
        "Duplicate.",
        "The receiver sees seq 0 twice. The sequence bit tells it to discard the copy.",
      ),
    ],
    [
      "Timer",
      hn("One timer runs for the outstanding frame."),
      kb("Timeout#2 s#c3;Elapsed#1.2 s#c0;Retries#1 of 3#c1"),
    ],
  ],
  "Go-Back-N and Selective Repeat": [
    [
      "Go-Back-N",
      hn(
        "Window of 4. Green is acknowledged, blue is in flight, grey is outside the window.",
      ),
      win,
      ld(
        "Sender|Receiver",
        "r|Frames 2 3 4 5|c0;l|ACK 2 (frame 3 lost)|c1;r|Resend 3 4 5|c3",
      ),
      vd(
        "c3",
        "Go back.",
        "After a loss the receiver drops later frames, so the sender resends from frame 3.",
      ),
    ],
    [
      "Selective Repeat",
      hn("The receiver buffers frames that arrive out of order."),
      win,
      hn("Receiver buffer"),
      R("2 4 5", () => "c2"),
      ld(
        "Sender|Receiver",
        "r|Frames 2 3 4 5|c0;l|ACK 2, ACK 4, ACK 5|c2;r|Resend 3 only|c3",
      ),
      vd("c2", "Selective.", "Only frame 3 is resent."),
    ],
    [
      "Sequence space",
      hn("With 3-bit sequence numbers there are 8 values."),
      kb(
        "Sequence space#0 to 7#c0;Max window, Go-Back-N#7#c3;Max window, Selective Repeat#4#c2",
      ),
      vd(
        "c1",
        "Too large a window breaks things.",
        "Old and new frames would share a number and get confused.",
      ),
    ],
  ],
  "Addressing and subnets": [
    [
      "IPv4 address",
      hn(
        "192.168.1.10/24: blue bits name the network, yellow bits name the host.",
      ),
      kb("Octet 1#192#c0;Octet 2#168#c0;Octet 3#1#c0;Octet 4#10#c3"),
      R("11000000 10101000 00000001 00001010", (i) => (i < 3 ? "c0" : "c3")),
    ],
    [
      "CIDR",
      hn("A /24 prefix keeps 24 network bits."),
      kb(
        "Prefix#/24#c0;Mask#255.255.255.0#c0;Addresses#256#c3;Usable hosts#254#c2",
      ),
      hn("Split into four /26 subnets:"),
      tb(
        "Subnet|Range|Hosts;192.168.1.0/26|.0 to .63|62;192.168.1.64/26|.64 to .127|62;192.168.1.128/26|.128 to .191|62;192.168.1.192/26|.192 to .255|62",
      ),
    ],
  ],
  "IP headers and fragments": [
    [
      "IPv4 header",
      kb(
        "Version#4#c0;Header length#5 words#c0;Total length#1500#c0;TTL#64#c1;Protocol#6 (TCP)#c2;Source#10.0.0.2#c3;Destination#10.0.1.9#c3",
      ),
    ],
    [
      "IPv6 header",
      kb(
        "Version#6#c0;Traffic class#0#c0;Payload length#1460#c0;Next header#6 (TCP)#c2;Hop limit#64#c1;Source#2001:db8::2#c3;Destination#2001:db8:1::9#c3",
      ),
    ],
    [
      "Fragmentation",
      hn("A 4000-byte packet crosses a link with an MTU of 1500."),
      tb(
        "Fragment|Offset|Data bytes|More fragments;1|0|1480|1;2|185|1480|1;3|370|1020|0",
      ),
      vd(
        "c2",
        "Reassembly.",
        "The receiver orders fragments by offset and stops at the one with more-fragments 0.",
      ),
    ],
  ],
  "Routing and forwarding": [
    [
      "Routing table",
      tb(
        "Destination|Next hop|Interface|Metric;10.0.1.0/24|direct|eth1|0;10.0.2.0/24|10.0.1.2|eth1|1;0.0.0.0/0|10.0.0.1|eth0|10",
      ),
      vd(
        "c0",
        "Longest prefix wins.",
        "10.0.2.7 matches the /24 route before the default route.",
      ),
    ],
    [
      "Router journey",
      kb(
        "Host A#send, TTL 64#c0;Router 1#TTL 63#c1;Router 2#TTL 62#c1;Host B#delivered#c2",
      ),
    ],
  ],
  "TCP and UDP": [
    [
      "Compare",
      tb(
        "Feature|TCP|UDP;Connection|Yes|No;Delivery|ACKs and retransmits|Best effort;Ordering|Yes|No;Header|20+ bytes|8 bytes;Used for|Web, email|DNS, calls",
      ),
    ],
    [
      "TCP segment",
      kb(
        "Source port#5000#c0;Destination port#80#c0;Sequence#100#c3;Acknowledgement#501#c3;Flags#SYN ACK#c2;Window#65535#c1",
      ),
    ],
    [
      "UDP datagram",
      kb(
        "Source port#5353#c0;Destination port#53#c0;Length#40#c3;Checksum#0x1c2e#c2",
      ),
    ],
  ],
  "Handshake and teardown": [
    [
      "Handshake",
      ld(
        "Client|Server",
        "r|SYN seq 100|c0;l|SYN-ACK seq 300, ack 101|c2;r|ACK ack 301|c0",
      ),
      vd(
        "c2",
        "Established.",
        "Both sides agreed on starting sequence numbers.",
      ),
    ],
    [
      "Teardown",
      ld("Client|Server", "r|FIN|c1;l|ACK|c2;l|FIN|c1;r|ACK|c2"),
      vd(
        "c3",
        "Time-wait.",
        "The client waits briefly in case the last ACK is lost.",
      ),
    ],
    [
      "Numbers",
      kb("Client start#100#c0;Server start#300#c1;Server expects next#101#c2"),
    ],
  ],
  "Flow and congestion control": [
    [
      "Flow control",
      hn("The receiver advertises how much more data it can take."),
      kb(
        "Receiver window#4 segments#c2;In flight#3 segments#c0;Can still send#1 segment#c3",
      ),
    ],
    [
      "Congestion",
      hn(
        "The window doubles each round in slow start, then halves after a loss.",
      ),
      br("1 2 4 8 16 8 9 10", 4),
      vd(
        "c1",
        "Loss in round 5.",
        "The window drops to half and grows slowly again.",
      ),
    ],
    [
      "Timers",
      kb("First timeout#1 s#c3;Second#2 s#c3;Third#4 s#c1"),
      hn("The retransmission timer doubles after each timeout."),
    ],
  ],
  DNS: [
    [
      "Lookup journey",
      ld(
        "You|DNS servers",
        "r|Resolver: A for example.com?|c0;r|Root: who has .com?|c4;l|Ask the .com server|c3;r|.com: who has example.com?|c4;l|Ask the example.com server|c3;l|Answer 93.184.216.34|c2",
      ),
    ],
    [
      "Records",
      tb(
        "Type|Name|Value|TTL;A|example.com|93.184.216.34|300;CNAME|www.example.com|example.com|3600;MX|example.com|10 mail.example.com|3600",
      ),
    ],
  ],
  "HTTP and TLS": [
    [
      "Request and response",
      hn("Request"),
      kb("Method#GET#c0;Path#/index.html#c0;Host#example.com#c0"),
      hn("Response"),
      kb("Status#200 OK#c2;Type#text/html#c2;Length#1256#c2"),
    ],
    [
      "TLS handshake",
      ld(
        "Client|Server",
        "r|ClientHello|c0;l|ServerHello and certificate|c2;r|Key exchange|c0;l|Finished|c2;r|Encrypted HTTP request|c3",
      ),
    ],
    [
      "Page load",
      kb(
        "DNS#12 ms#c0;TCP#25 ms#c2;TLS#40 ms#c3;HTTP#35 ms#c1;Render#60 ms#c4",
      ),
    ],
  ],
  "Sockets and multiplexing": [
    ["Ports", tb("Port|Protocol|Service;53|UDP|DNS;80|TCP|HTTP;443|TCP|HTTPS")],
    [
      "Socket table",
      tb(
        "Local|Remote|State;10.0.0.2:5000|93.184.216.34:443|ESTABLISHED;10.0.0.2:5001|93.184.216.34:443|ESTABLISHED;10.0.0.2:5353|any|UDP",
      ),
      vd(
        "c0",
        "Two conversations.",
        "Same destination, different source ports.",
      ),
    ],
  ],
  "Encapsulation stack": [
    [
      "Wrap",
      kb("Data#Hi#c0"),
      kb("TCP header#ports#c2;Data#Hi#c0"),
      kb("IP header#addresses#c1;TCP header#ports#c2;Data#Hi#c0"),
      kb(
        "Frame header#MAC#c3;IP header#addresses#c1;TCP header#ports#c2;Data#Hi#c0;CRC#check#c3",
      ),
    ],
    [
      "Unwrap",
      hn("The receiver removes one header per layer, bottom to top."),
      kb(
        "Frame#check CRC#c3;Packet#check address#c1;Segment#check port#c2;Data#Hi#c0",
      ),
    ],
  ],
  "Packet capture explorer": [
    [
      "Packet list",
      tb(
        "No|Time|Source|Destination|Protocol|Info;1|0.000|10.0.0.2|8.8.8.8|DNS|Query A example.com;2|0.021|8.8.8.8|10.0.0.2|DNS|Response;3|0.022|10.0.0.2|93.184.216.34|TCP|SYN;4|0.050|93.184.216.34|10.0.0.2|TCP|SYN, ACK;5|0.051|10.0.0.2|93.184.216.34|TCP|ACK",
      ),
    ],
    [
      "Packet detail",
      kb("Frame#74 bytes#c3;IP#TTL 64#c1;TCP#SYN#c2"),
      hn("Raw bytes"),
      R("48 65 6c 6c 6f", () => "c0"),
    ],
  ],
  "Troubleshooting lab": [
    [
      "Scenario",
      hn("Users can reach 10.0.1.5 but not example.com. Find out why."),
      ol([
        "Check the link with ping.",
        "Trace the route.",
        "Test name resolution.",
      ]),
    ],
    [
      "Tools",
      tb(
        "Tool|Tells you;ping|Whether a host answers;traceroute|Where packets stop;nslookup|Whether DNS answers",
      ),
    ],
    [
      "Findings",
      vd("c1", "Failure at DNS.", "nslookup timed out."),
      '<textarea aria-label="Notes" placeholder="Your notes"></textarea>',
    ],
  ],
  "Tutorials and experiments": [
    [
      "Guided lab",
      ol([
        "Type a short message.",
        "Split it into 3-byte packets.",
        "Send at 30% loss.",
        "Open the receiver and read the slots.",
      ]),
    ],
    [
      "Objectives",
      ol([
        "Explain why bytes are split into packets.",
        "Predict what a loss does.",
      ]),
    ],
    [
      "Notes",
      '<textarea aria-label="Observations" placeholder="What did you see?"></textarea>',
    ],
  ],
  "Challenges and checks": [
    [
      "Question",
      hn("Which header field stops a packet from looping forever?"),
      `<div class='lpath'>${["Sequence number", "TTL", "Checksum", "Port"].map((x) => `<button class='step'>${x}</button>`).join("")}</div>`,
      `<details class='grp'><summary>Show hint</summary>${hn("It counts down at every router.")}</details>`,
      `<details class='grp'><summary>Reveal solution</summary>${hn("TTL. Routers lower it by 1 and drop the packet at 0.")}</details>`,
    ],
    [
      "Result states",
      vd("c2", "Correct.", "Well done."),
      vd("c1", "Not quite.", "Try the hint."),
    ],
  ],
  "Reference and glossary": [
    [
      "Protocols",
      tb(
        "Protocol|Layer|Purpose;Ethernet|Link|Frames on a local network;IP|Network|Addressing and routing;TCP|Transport|Reliable streams;UDP|Transport|Fast datagrams;DNS|Application|Names to addresses;HTTP|Application|Web requests",
      ),
    ],
    [
      "Glossary",
      '<input type="search" placeholder="Search terms" disabled>',
      gl([
        ["ACK", "Message confirming receipt."],
        ["CRC", "Error check from polynomial division."],
        ["MTU", "Largest packet a link carries."],
        ["TTL", "Hop budget for a packet."],
      ]),
      hn("Related"),
      R("Window Segment Frame", (i) => "c" + i),
    ],
  ],
};
function xRender(m, u) {
  $("xt").textContent = m.n;
  $("xd").textContent = m.d;
  $("xr").textContent = m.r;
  $("xb").innerHTML =
    `<div class='lpath'>${u.map((t, k) => `<button class='step${k ? "" : " cur"}' data-t='x${k}'>${t[0]}</button>`).join("")}</div>` +
    u
      .map(
        (t, k) =>
          `<div class='tp' data-p='x${k}'${k ? " hidden" : ""}>${t.slice(1).join("")}</div>`,
      )
      .join("");
}
{
  const m1 = mod;
  mod = (i) => {
    const u = UI[MD[i].n];
    if (u && !busy) xRender(MD[i], u);
    m1(i);
  };
}
jRender();
$("dashBtn").onclick = dash;
encode();
split();
dash();
