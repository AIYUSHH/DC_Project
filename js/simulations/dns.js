/**
 * simulated DNS hierarchy and resolver with a cache
 *
 * A small made-up DNS world (root, top-level-domain and zone servers) and dnsLookup(), a recursive
 * resolver that walks it, follows CNAMEs, honours record TTLs in a cache driven by a virtual clock, and reports
 * every message exchanged so the UI can draw it.
 *
 * Imports:
 *   (none)
 *
 * Exports: DNS_DATA, dnsLookup
 *
 * Used by: modules/application-layer/dns.js
 */

/**
 * Top-level-domain name servers: tld -> [server name, IP].
 */
const TLDS = {
  com: ['a.gtld-servers.net', '192.5.6.30'],
  net: ['b.gtld-servers.net', '192.33.14.30'],
  org: ['a0.org.afilias-nst.info', '199.19.56.1'],
  edu: ['a.edu-servers.net', '192.5.6.30'],
};

/**
 * Authoritative zone servers: zone -> [server name, IP].
 */
const ZONES = {
  'example.com': ['ns1.example.com', '93.184.216.50'],
  'cdn-sample.net': ['ns.cdn-sample.net', '198.51.100.53'],
  'example.org': ['ns1.example.org', '198.51.100.11'],
  'example.edu': ['ns.example.edu', '192.0.2.53'],
};

/**
 * The records stored in each zone: name -> { type -> values }.
 */
export const DNS_DATA = {
  'example.com': {
    A: ['93.184.216.34'],
    AAAA: ['2606:2800:220:1:248:1893:25c8:1946'],
    MX: ['10 mail.example.com'],
    NS: ['ns1.example.com'],
    TXT: ['"v=spf1 -all"'],
  },
  'www.example.com': { CNAME: ['example.com'] },
  'mail.example.com': { A: ['93.184.216.35'] },
  'shop.example.com': { A: ['203.0.113.20'] },
  'cdn.example.com': { CNAME: ['edge.cdn-sample.net'] },
  'edge.cdn-sample.net': { A: ['198.51.100.7'], AAAA: ['2001:db8:cd::7'] },
  'example.org': { A: ['198.51.100.10'], NS: ['ns1.example.org'] },
  'docs.example.org': { CNAME: ['example.org'] },
  'campus.example.edu': { A: ['192.0.2.44'] },
};

/**
 * Default time-to-live (seconds) per record type; how long a resolver may cache the answer.
 */
const DNS_TTL = { A: 300, AAAA: 300, CNAME: 3600, MX: 3600, NS: 86400, TXT: 600 };

/**
 * Resolves a name through the simulated DNS hierarchy.
 *
 * Checks the cache first (entries expire when their TTL passes the virtual clock `now`), otherwise asks root -> TLD -> authoritative server, following CNAMEs.
 * @param {string} qname
 * @param {string} qtype - A, AAAA, MX...
 * @param {Map} cache - mutated: new answers are stored with an expiry time.
 * @param {number} now - virtual time in seconds.
 * @returns {Object} messages for the ladder, total ms, answers and rcode.
 */
export function dnsLookup(qname, qtype, cache, now) {
  const out = { msgs: [], marks: [], ms: 0, answers: [], rcode: 'NOERROR', cached: false };
  let t = 0;
  const add = (dir, label, cls) => {
    out.msgs.push({ t0: t, t1: t + 1, dir, label, cls, idx: out.msgs.length });
    t += 1.3;
  };
  const hit = c => cache.get(c) && cache.get(c).exp > now;
  const key = (n, ty) => n + '|' + ty;
  let name = qname.trim().toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9.-]+$/.test(name) || !name.includes('.')) {
    out.rcode = 'FORMERR';
    return out;
  }
  if (hit(key(name, qtype))) {
    const c = cache.get(key(name, qtype));
    out.marks.push({ side: 'l', t: 0.3, label: 'answer found in cache', cls: 'c2' });
    out.answers = c.rrs;
    out.cached = true;
    out.left = c.exp - now;
    return out;
  }
  let guard = 0;
  while (guard++ < 6) {
    const labels = name.split('.'),
      tld = labels[labels.length - 1],
      zone = labels.slice(-2).join('.');
    if (hit('ns|' + tld))
      out.marks.push({ side: 'l', t: t, label: `.${tld} servers cached`, cls: 'c2' });
    else {
      add('lr', `Root: ${name} ${qtype}?`, 'c0');
      out.ms += 14;
      if (!TLDS[tld]) {
        add('rl', `NXDOMAIN: no .${tld} TLD`, 'c1');
        out.rcode = 'NXDOMAIN';
        return out;
      }
      add('rl', `Referral: ask ${TLDS[tld][0]}`, 'c3');
      cache.set('ns|' + tld, { exp: now + 172800 });
    }
    if (hit('ns|' + zone))
      out.marks.push({ side: 'l', t: t, label: `${zone} servers cached`, cls: 'c2' });
    else {
      add('lr', `.${tld} server: ${name} ${qtype}?`, 'c0');
      out.ms += 22;
      if (!ZONES[zone]) {
        add('rl', 'NXDOMAIN: no such domain', 'c1');
        out.rcode = 'NXDOMAIN';
        return out;
      }
      add('rl', `Referral: ask ${ZONES[zone][0]}`, 'c3');
      cache.set('ns|' + zone, { exp: now + 86400 });
    }
    add('lr', `${ZONES[zone][0]}: ${name} ${qtype}?`, 'c0');
    out.ms += 35;
    const rec = DNS_DATA[name];
    if (!rec) {
      add('rl', 'NXDOMAIN: no such name', 'c1');
      out.rcode = 'NXDOMAIN';
      return out;
    }
    if (rec[qtype]) {
      add('rl', `Answer: ${rec[qtype].join(', ')}`, 'c2');
      rec[qtype].forEach(v => out.answers.push({ name, type: qtype, ttl: DNS_TTL[qtype], v }));
      break;
    }
    if (rec.CNAME && qtype !== 'CNAME') {
      add('rl', `CNAME: ${name} is ${rec.CNAME[0]}`, 'c3');
      out.answers.push({ name, type: 'CNAME', ttl: DNS_TTL.CNAME, v: rec.CNAME[0] });
      name = rec.CNAME[0];
      continue;
    }
    add('rl', 'NOERROR but no records of that type', 'c4');
    out.rcode = 'NODATA';
    break;
  }
  if (out.answers.length)
    cache.set(key(qname.trim().toLowerCase().replace(/\.$/, ''), qtype), {
      rrs: out.answers,
      exp: now + Math.min(...out.answers.map(a => a.ttl)),
    });
  return out;
}
