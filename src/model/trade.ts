import type { Id } from './gameData';
import type { TradeRoute } from './state';

export interface RouteFlow {
  route: TradeRoute;
  /** Tons per minute the route actually moves. */
  actual: number;
  /** The source had less surplus than a fixed route ships. */
  sourceShort: boolean;
}

export interface TradeResult {
  flows: RouteFlow[];
  /** Per island, per good: + imports − exports, in tons per minute. */
  net: Map<string, Map<Id, number>>;
}

const EPS = 1e-6;

/**
 * Resolves routes against each island's pre-trade net balance. Fixed routes
 * ship their amount, even past the source's surplus (the source then shows
 * the deficit). Auto routes then run in list order, each shipping what the
 * destination still lacks, up to what the source still has spare.
 */
export function resolveRoutes(routes: TradeRoute[], preTrade: Map<string, Map<Id, number>>): TradeResult {
  const running = new Map<string, Map<Id, number>>();
  const get = (island: string, product: Id) => running.get(island)?.get(product) ?? preTrade.get(island)?.get(product) ?? 0;
  const set = (island: string, product: Id, v: number) => {
    const m = running.get(island) ?? new Map<Id, number>();
    m.set(product, v);
    running.set(island, m);
  };

  const net = new Map<string, Map<Id, number>>();
  const book = (island: string, product: Id, v: number) => {
    const m = net.get(island) ?? new Map<Id, number>();
    m.set(product, (m.get(product) ?? 0) + v);
    net.set(island, m);
  };

  const flows = new Map<string, RouteFlow>();
  const ship = (route: TradeRoute, amount: number) => {
    set(route.from, route.product, get(route.from, route.product) - amount);
    set(route.to, route.product, get(route.to, route.product) + amount);
    book(route.from, route.product, -amount);
    book(route.to, route.product, amount);
  };

  for (const route of routes) {
    if (route.amount === null) continue;
    const spare = get(route.from, route.product);
    ship(route, route.amount);
    flows.set(route.id, { route, actual: route.amount, sourceShort: route.amount > spare + EPS });
  }
  for (const route of routes) {
    if (route.amount !== null) continue;
    const spare = Math.max(0, get(route.from, route.product));
    const lacking = Math.max(0, -get(route.to, route.product));
    const amount = Math.min(spare, lacking);
    if (amount > EPS) ship(route, amount);
    flows.set(route.id, { route, actual: amount > EPS ? amount : 0, sourceShort: false });
  }

  return { flows: routes.map((r) => flows.get(r.id)!), net };
}
