import { connect } from "cloudflare:sockets";

const ROOTS = ["198.41.0.4","199.9.14.201","192.33.4.12","199.7.91.13","192.203.230.10","192.5.5.241","192.112.36.4","198.97.190.53","192.36.148.17","192.58.128.30","193.0.14.129","199.7.83.42","202.12.27.33"];
const TYPES = { A:1, NS:2, CNAME:5, SOA:6, MX:15, TXT:16, AAAA:28, CAA:257 };
const TYPE_NAMES = Object.fromEntries(Object.entries(TYPES).map(([k,v])=>[v,k]));
const enc = new TextEncoder();
const dec = new TextDecoder();

function nameBytes(name) {
  const out=[];
  for (const label of name.replace(/\.$/,"").split(".")) {
    const b=enc.encode(label);
    if (!b.length || b.length>63) throw new Error("Invalid DNS label");
    out.push(b.length,...b);
  }
  out.push(0); return out;
}
function makeQuery(name,type,id) {
  return Uint8Array.from([id>>8,id&255,0,0,0,1,0,0,0,0,0,0,...nameBytes(name),TYPES[type]>>8,TYPES[type]&255,0,1]);
}
function u16(b,o){return (b[o]<<8)|b[o+1]}
function u32(b,o){return (b[o]*16777216)+(b[o+1]<<16)+(b[o+2]<<8)+b[o+3]}
function readName(b,start) {
  let p=start, jumped=false, end=start, hops=0; const labels=[];
  while(p<b.length && hops++<80) {
    const n=b[p];
    if(n===0){p++;if(!jumped)end=p;break;}
    if((n&192)===192){if(p+1>=b.length)throw new Error("Malformed DNS compression pointer");const target=((n&63)<<8)|b[p+1];if(!jumped)end=p+2;jumped=true;p=target;continue;}
    if(n&192) throw new Error("Unsupported DNS label encoding");
    if(p+1+n>b.length) throw new Error("Truncated DNS name");
    labels.push(dec.decode(b.slice(p+1,p+1+n)));p+=1+n;
  }
  if(hops>=80) throw new Error("DNS compression loop");
  return {name:labels.join("."),next:jumped?end:p};
}
function parseMessage(b) {
  if(b.length<12) throw new Error("Short DNS response");
  const flags=u16(b,2), qd=u16(b,4), an=u16(b,6), ns=u16(b,8), ar=u16(b,10);
  let p=12;
  for(let i=0;i<qd;i++){p=readName(b,p).next+4;}
  const sections={answer:[],authority:[],additional:[]};
  const parseRR=(target,count)=>{
    for(let i=0;i<count;i++){
      const n=readName(b,p);p=n.next;
      if(p+10>b.length)throw new Error("Truncated DNS resource record");
      const type=u16(b,p), klass=u16(b,p+2), ttl=u32(b,p+4), len=u16(b,p+8);p+=10;
      const start=p,end=p+len;if(end>b.length)throw new Error("Truncated DNS record data");
      let data;
      if(type===1 && len===4) data=[...b.slice(start,end)].join(".");
      else if(type===28 && len===16){const parts=[];for(let j=0;j<16;j+=2)parts.push(u16(b,start+j).toString(16));data=parts.join(":");}
      else if([2,5].includes(type)) data=readName(b,start).name;
      else if(type===15) data={priority:u16(b,start),exchange:readName(b,start+2).name};
      else if(type===16){const chunks=[];let q=start;while(q<end){const l=b[q++];chunks.push(dec.decode(b.slice(q,q+l)));q+=l;}data=chunks.join("");}
      else if(type===6){const m=readName(b,start),r=readName(b,m.next);data={mname:m.name,rname:r.name,serial:u32(b,r.next),refresh:u32(b,r.next+4),retry:u32(b,r.next+8),expire:u32(b,r.next+12),minimum:u32(b,r.next+16)};}
      else if(type===257 && len>=2)data={flags:b[start],tag:dec.decode(b.slice(start+1,start+2)),value:dec.decode(b.slice(start+2,end))};
      else data="0x"+[...b.slice(start,end)].map(x=>x.toString(16).padStart(2,"0")).join("");
      target.push({name:n.name,type:TYPE_NAMES[type]||type,ttl,class:klass===1?"IN":klass,data});
      p=end;
    }
  };
  parseRR(sections.answer,an);parseRR(sections.authority,ns);parseRR(sections.additional,ar);
  return {rcode:flags&15,aa:!!(flags&0x0400),answers:sections.answer,authority:sections.authority,additional:sections.additional};
}
function publicIPv4(ip) {
  const a=ip.split(".").map(Number);if(a.length!==4||a.some(x=>!Number.isInteger(x)||x<0||x>255))return false;
  const [x,y]=a;
  return !(x===0||x===10||x===127||x>=224||(x===169&&y===254)||(x===172&&y>=16&&y<=31)||(x===192&&y===168)||(x===100&&y>=64&&y<=127)||(x===192&&y===0));
}
async function tcpDns(ip,query) {
  if(!publicIPv4(ip)) throw new Error("Refusing a non-public DNS server address");
  const socket=connect({hostname:ip,port:53},{secureTransport:"off"});
  try {
    await Promise.race([socket.opened,new Promise((_,rej)=>setTimeout(()=>rej(new Error("DNS connection timeout")),4500))]);
    const writer=socket.writable.getWriter();
    const packet=new Uint8Array(query.length+2);packet[0]=query.length>>8;packet[1]=query.length&255;packet.set(query,2);
    await writer.write(packet);writer.releaseLock();
    const reader=socket.readable.getReader();let buf=new Uint8Array(0),needed=null;
    const deadline=Date.now()+5000;
    while(Date.now()<deadline) {
      const next=await Promise.race([reader.read(),new Promise((_,rej)=>setTimeout(()=>rej(new Error("DNS response timeout")),Math.max(1,deadline-Date.now())))]);
      if(next.done)break;
      const joined=new Uint8Array(buf.length+next.value.length);joined.set(buf);joined.set(next.value,buf.length);buf=joined;
      if(needed===null&&buf.length>=2)needed=u16(buf,0)+2;
      if(needed!==null&&buf.length>=needed)return buf.slice(2,needed);
    }
    throw new Error("DNS server closed the connection before replying");
  } finally { try{await socket.close();}catch{} }
}
function pickNsIp(message) {
  const ns=message.authority.find(r=>r.type==="NS");
  if(!ns)return null;
  const glue=message.additional.find(r=>r.type==="A"&&r.name.toLowerCase()===String(ns.data).toLowerCase()&&publicIPv4(r.data));
  return glue?{host:ns.data,ip:glue.data}:null;
}
function zoneFor(name) {const p=name.split(".");return p.length>=2?p.slice(-2).join("."):name;}
async function traceLookup(name,type) {
  const steps=[];let current=name,answers=[],allAnswers=[],server=ROOTS[0],rcode=0;
  for(let alias=0;alias<6;alias++) {
    let stage="root";
    for(let depth=0;depth<3;depth++) {
      const started=Date.now(),packet=makeQuery(current,type,Math.floor(Math.random()*65536));
      const msg=parseMessage(await tcpDns(server,packet));
      const elapsed=Date.now()-started;
      steps.push({stage,server,query:current+" "+type,elapsedMs:elapsed,rcode:msg.rcode,authoritative:msg.aa,answers:msg.answers,referrals:msg.authority.filter(x=>x.type==="NS"),glue:msg.additional.filter(x=>x.type==="A"||x.type==="AAAA")});
      rcode=msg.rcode;
      if(msg.rcode!==0){answers=msg.answers;break;}
      if(msg.answers.length){answers=msg.answers;break;}
      const referral=pickNsIp(msg);
      if(!referral) {
        if(stage==="authoritative"){answers=msg.answers;break;}
        throw new Error("The DNS server did not return an IPv4 glue address for its referral. Try another domain or query type.");
      }
      server=referral.ip;
      stage=depth===0?"tld":depth===1?"authoritative":"authoritative";
    }
    const cname=answers.find(x=>x.type==="CNAME");
    if(!cname||type==="CNAME"||rcode!==0){allAnswers.push(...answers);break;}
    allAnswers.push(cname);
    current=String(cname.data);
    answers=[];
    server=ROOTS[0];
  }
  return {name,type,rcode,steps,answers:allAnswers.length?allAnswers:answers,queriedAt:new Date().toISOString(),method:"Direct iterative DNS over TCP/53"};
}
function validName(value) {
  const name=String(value||"").trim().toLowerCase().replace(/\.$/,"");
  if(name.length>253||!name||name.includes("://")||name.includes("/")||name.split(".").some(l=>!l||l.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(l)))return null;
  return name;
}
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Content-Type"};
export default {
  async fetch(request) {
    const url=new URL(request.url);
    if(request.method==="OPTIONS")return new Response(null,{headers:cors});
    if(url.pathname==="/health")return Response.json({ok:true,service:"DC_Project live iterative DNS resolver"}, {headers:cors});
    if(url.pathname!=="/trace")return Response.json({error:"Use /trace?name=example.com&type=A"},{status:404,headers:cors});
    const name=validName(url.searchParams.get("name")),type=(url.searchParams.get("type")||"A").toUpperCase();
    if(!name||!TYPES[type])return Response.json({error:"Enter a valid public domain and a supported record type."},{status:400,headers:cors});
    try {
      const result=await traceLookup(name,type);
      return Response.json(result,{headers:{...cors,"Cache-Control":"no-store"}});
    } catch(error) {
      return Response.json({error:error?.message||"DNS lookup failed",hint:"The hosting provider or destination DNS server may block outbound TCP port 53."},{status:502,headers:cors});
    }
  }
};
