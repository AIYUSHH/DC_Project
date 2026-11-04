/**
 * Intelligent learning-module search.
 *
 * Uses local typo-tolerant matching and edit distance. No third-party script,
 * backend, or AI service is required. Results navigate through the existing hash
 * router and module registry; no backend or AI service is required.
 */
import { DC } from '../core/state.js';
import { GROUPS } from '../modules/registry.js';

const SEARCH_TERMS = {
  handshake: ['tcp handshake', 'three-way handshake', 'syn', 'syn-ack', 'ack', 'connection establishment', 'connection setup', 'three way connection', 'tcp connection'],
  subnets: ['subnet mask', 'subnetting', 'ipv4', 'cidr', 'network address', 'broadcast address', 'usable hosts', 'vlsm', 'subnet calculation', 'ip addressing'],
  dns: ['dns cache', 'dns resolution', 'domain lookup', 'domain name system', 'ttl', 'cached records', 'name resolution', 'domain names'],
  http: ['http put', 'put method', 'http methods', 'request body', 'headers', 'update resource', 'https', 'tls', 'hypertext transfer protocol'],
  capture: ['packet capture', 'packets', 'capture analyzer', 'protocol inspection', 'wireshark', 'network traffic analysis', 'sniffing'],
  tcpudp: ['tcp', 'udp', 'ports', 'transport protocol', 'transmission control protocol', 'user datagram protocol', 'multiplexing'],
  glossary: ['port number reference', 'port lookup', 'well-known ports', 'registered ports', 'service port', 'tcp port', 'udp port', 'common ports'],
  protocolcompare: ['protocol comparison', 'tcp vs udp', 'ipv4 vs ipv6', 'http vs https', 'dns over tcp', 'static routing', 'dynamic routing', 'hub switch router', 'stop-and-wait', 'sliding window arq', 'osi vs tcp ip'],
};

// Natural-language concepts that should lead to a specific learning topic.
const CONCEPT_ALIASES = [
  { terms: ['three way connection', 'three-way connection', 'connection setup', 'connection establishment'], query: 'tcp handshake' },
  { terms: ['reliable delivery', 'reliable data transfer', 'ordered delivery'], query: 'tcp' },
  { terms: ['domain names', 'domain lookup', 'name resolution'], query: 'dns' },
  { terms: ['change a resource', 'update a resource', 'replace resource'], query: 'http put' },
  { terms: ['divide network', 'split network', 'ip range calculation'], query: 'subnetting' },
  { terms: ['inspect network traffic', 'sniff network traffic'], query: 'packet capture' },
];

const normalize = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const tokenize = value => normalize(value).split(/\s+/).filter(Boolean);

function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function tokenSimilarity(query, document) {
  const queryTokens = tokenize(query);
  const documentTokens = tokenize(document);
  if (!queryTokens.length || !documentTokens.length) return 0;

  const scores = queryTokens.map(token => {
    let best = 0;
    for (const candidate of documentTokens) {
      if (candidate === token) best = Math.max(best, 1);
      else if (candidate.startsWith(token) || token.startsWith(candidate)) {
        const ratio = Math.min(token.length, candidate.length) / Math.max(token.length, candidate.length);
        best = Math.max(best, ratio >= 0.55 ? 0.88 : 0);
      } else if (Math.min(token.length, candidate.length) >= 3) {
        const distance = editDistance(token, candidate);
        const allowed = token.length >= 8 ? 2 : 1;
        if (distance <= allowed) best = Math.max(best, 1 - distance / Math.max(token.length, candidate.length));
      }
    }
    return best;
  });
  return scores.reduce((sum, score) => sum + score, 0) / queryTokens.length;
}

function expandedQueries(query) {
  const normalized = normalize(query);
  const expansions = [query];
  for (const alias of CONCEPT_ALIASES) {
    if (alias.terms.some(term => normalized.includes(normalize(term)))) {
      expansions.push(alias.query);
    }
  }
  return [...new Set(expansions)];
}

function buildSearchDocuments() {
  return DC.mods.map(mod => {
    const group = GROUPS.find(item => item.id === mod.group);
    const keywords = SEARCH_TERMS[mod.id] || [];
    return {
      mod,
      group,
      title: mod.title || '',
      description: mod.desc || '',
      keywords: keywords.join(' '),
      groupName: group?.name || '',
      groupDescription: group?.blurb || '',
      searchable: [mod.title, mod.desc, group?.name, group?.blurb, ...keywords].filter(Boolean).join(' '),
    };
  });
}

function rankDocuments(query, documents) {
  const candidates = new Map();
  const queries = expandedQueries(query);

  queries.forEach((candidateQuery, queryIndex) => {
    const needle = normalize(candidateQuery);
    if (!needle) return;


    documents.forEach(item => {
      const title = normalize(item.title);
      const keywords = normalize(item.keywords);
      const searchable = normalize(item.searchable);
      const exactBoost = title === needle ? 1 : title.startsWith(needle) ? 0.88 :
        title.includes(needle) ? 0.78 : keywords.includes(needle) ? 0.68 :
        searchable.includes(needle) ? 0.55 : 0;
      const fuzzy = Math.max(
        tokenSimilarity(candidateQuery, item.title) * 0.9,
        tokenSimilarity(candidateQuery, item.keywords) * 0.76,
        tokenSimilarity(candidateQuery, item.searchable) * 0.62,
      );
      const relevance = Math.max(exactBoost, fuzzy) - (queryIndex === 0 ? 0 : 0.08);
      if (relevance >= 0.48) {
        candidates.set(item.mod.id, Math.max(candidates.get(item.mod.id) || 0, relevance));
      }
    });
  });

  return documents
    .filter(item => candidates.has(item.mod.id))
    .map(item => ({ ...item, score: candidates.get(item.mod.id) }))
    .sort((a, b) => b.score - a.score || a.mod.title.localeCompare(b.mod.title))
    .slice(0, 8);
}

export function initModuleSearch() {
  const input = document.querySelector('#moduleSearch');
  const panel = document.querySelector('#moduleSearchResults');
  if (!input || !panel) return;

  const documents = buildSearchDocuments();
  let activeIndex = -1;
  let currentResults = [];

  const close = ({ clear = false } = {}) => {
    panel.hidden = true;
    panel.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
    activeIndex = -1;
    currentResults = [];
    if (clear) input.value = '';
  };

  const render = query => {
    panel.replaceChildren();
    activeIndex = -1;
    if (!normalize(query)) {
      panel.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      currentResults = [];
      return;
    }

    currentResults = rankDocuments(query, documents);

    if (!currentResults.length) {
      const empty = document.createElement('p');
      empty.className = 'module-search-empty';
      empty.textContent = 'No matching learning modules. Try a topic such as “TCP”, “subnet mask”, or “DNS”.';
      panel.append(empty);
    } else {
      currentResults.forEach(({ mod, group }, index) => {
        const link = document.createElement('a');
        link.className = 'module-search-result';
        link.href = '#/m/' + encodeURIComponent(mod.id);
        link.setAttribute('role', 'option');
        link.dataset.index = String(index);

        const text = document.createElement('span');
        text.className = 'module-search-result-copy';
        const title = document.createElement('strong');
        title.textContent = mod.title;
        const description = document.createElement('span');
        description.textContent = mod.desc || 'Open this learning module';
        text.append(title, description);

        const meta = document.createElement('span');
        meta.className = 'module-search-result-group';
        meta.textContent = group?.name || 'Learning module';
        link.append(text, meta);
        link.addEventListener('click', () => close());
        panel.append(link);
      });
    }

    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  const setActive = index => {
    const items = [...panel.querySelectorAll('.module-search-result')];
    if (!items.length) return;
    activeIndex = (index + items.length) % items.length;
    items.forEach((item, i) => {
      item.classList.toggle('is-active', i === activeIndex);
      item.setAttribute('aria-selected', String(i === activeIndex));
    });
    items[activeIndex].scrollIntoView({ block: 'nearest' });
  };

  input.addEventListener('input', () => render(input.value));
  input.addEventListener('focus', () => {
    if (input.value.trim()) render(input.value);
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' && !panel.hidden) {
      event.preventDefault();
      setActive(activeIndex + 1);
    } else if (event.key === 'ArrowUp' && !panel.hidden) {
      event.preventDefault();
      setActive(activeIndex < 0 ? currentResults.length - 1 : activeIndex - 1);
    } else if (event.key === 'Enter' && !panel.hidden) {
      const items = panel.querySelectorAll('.module-search-result');
      if (items.length) {
        event.preventDefault();
        items[activeIndex < 0 ? 0 : activeIndex].click();
      }
    } else if (event.key === 'Escape') {
      close();
      input.blur();
    }
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('.module-search')) close();
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      input.focus();
      input.select();
    }
  });
}
