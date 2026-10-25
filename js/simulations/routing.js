/**
 * sample topology and shortest-path routing
 *
 * The example network (hosts A and B, routers R1-R5 with link costs) and Dijkstra's algorithm, which
 * is what link-state routing protocols such as OSPF run to choose the cheapest path. A set of "down" links can be
 * passed in to simulate failures.
 *
 * Imports:
 *   (none)
 *
 * Exports: TOPO, dijkstra, linkKey, pathTo
 *
 * Used by: modules/network-layer/routing.js
 */

/**
 * The example network: node coordinates for drawing and weighted links [a, b, cost].
 */
export const TOPO = {
  nodes: {
    A: { x: 60, y: 160, kind: 'host', ip: '10.0.1.10' },
    R1: { x: 190, y: 160, kind: 'router' },
    R2: { x: 330, y: 52, kind: 'router' },
    R3: { x: 330, y: 160, kind: 'router' },
    R4: { x: 330, y: 268, kind: 'router' },
    R5: { x: 480, y: 160, kind: 'router' },
    B: { x: 620, y: 160, kind: 'host', ip: '10.0.2.20' },
  },
  links: [
    ['A', 'R1', 1],
    ['R1', 'R2', 2],
    ['R1', 'R3', 3],
    ['R1', 'R4', 5],
    ['R2', 'R3', 1],
    ['R3', 'R4', 1],
    ['R2', 'R5', 4],
    ['R3', 'R5', 2],
    ['R4', 'R5', 1],
    ['R5', 'B', 1],
  ],
};

/**
 * Order-independent id for a link: linkKey("R2","R1") === linkKey("R1","R2").
 */
export const linkKey = (a, b) => [a, b].sort().join('-');

/**
 * Dijkstra's shortest-path algorithm over TOPO.
 *
 * Repeatedly picks the unvisited node with the smallest known distance and "relaxes" its links (updates a neighbour if going through this node is cheaper). Ties are broken by node name so results are deterministic.
 * @param {string} src - start node.
 * @param {Set<string>} [down] - linkKeys of failed links to ignore.
 * @returns {{dist:Object<string,number>, prev:Object<string,string>}} distances and the previous hop on each best path.
 */
export function dijkstra(src, down = new Set()) {
  const dist = {},
    prev = {},
    seen = new Set(),
    names = Object.keys(TOPO.nodes);
  // Every distance starts unknown (infinite) except the source, which is 0.
  names.forEach(n => (dist[n] = Infinity));
  dist[src] = 0;
  while (true) {
    let u = null;
    names.forEach(n => {
      if (
        !seen.has(n) &&
        dist[n] < Infinity &&
        (u === null || dist[n] < dist[u] || (dist[n] === dist[u] && n < u))
      )
        u = n;
    });
    // No reachable unvisited node is left, so the search is finished.
    if (u === null) break;
    seen.add(u);
    TOPO.links.forEach(([a, b, w]) => {
      if (down.has(linkKey(a, b))) return;
      const v = a === u ? b : b === u ? a : null;
      // Relaxation: going through u is cheaper than the best known route to v, so remember it.
      if (v && dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        prev[v] = u;
      }
    });
  }
  return { dist, prev };
}

/**
 * Best path between two nodes.
 *
 * @returns {?{path:string[], cost:number}} null when no path exists (the destination is unreachable).
 */
export function pathTo(src, dst, down) {
  const { dist, prev } = dijkstra(src, down);
  if (dist[dst] === Infinity) return null;
  const p = [dst];
  // Walk the "previous hop" pointers backwards from the destination to rebuild the path.
  while (p[0] !== src) p.unshift(prev[p[0]]);
  return { path: p, cost: dist[dst] };
}
