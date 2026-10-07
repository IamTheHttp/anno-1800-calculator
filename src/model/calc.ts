import {
  consumerGoods,
  factoryById,
  intermediateGoods,
  game,
  levelById,
  outputRate,
  producerFor,
  type Factory,
  type Id,
  type Need,
  type PopulationLevel,
} from './gameData';
import type { Island, Revenue, Settings, TradeRoute } from './state';
import { resolveRoutes, type RouteFlow } from './trade';

export type Rates = Map<Id, number>;

const add = (m: Map<Id, number>, k: Id, v: number) => m.set(k, (m.get(k) ?? 0) + v);

/** Needs the residents of `level` consume on `island`, after unlocks and bonus choices. */
export function activeNeeds(level: PopulationLevel, residents: number, island: Island, settings: Settings): Need[] {
  return level.needs.filter(
    (n) =>
      n.tpmin !== null &&
      (!n.bonus || island.bonusNeeds.includes(n.product)) &&
      (!settings.applyUnlocks || n.unlockAt === null || residents >= n.unlockAt),
  );
}

/** Tons per minute of each good the island's residents consume. */
export function residentDemand(island: Island, settings: Settings): Rates {
  const out: Rates = new Map();
  for (const [levelId, residents] of Object.entries(island.residents)) {
    const level = levelById.get(Number(levelId));
    if (!level || residents <= 0) continue;
    for (const n of activeNeeds(level, residents, island, settings)) add(out, n.product, residents * n.tpmin!);
  }
  return out;
}

export interface ProductBalance {
  product: Id;
  produced: number;
  residents: number;
  factories: number;
  /** + imports − exports over trade routes. */
  trade: number;
  /** produced − residents − factories + trade, in tons per minute. */
  net: number;
}

/** Share of capacity (0–1) each good's producers actually run at. */
export type Utilization = Map<Id, number>;

/**
 * How hard each good's producers run across `islands`. A factory runs only as
 * fast as its output is needed — by residents, or by factories that are
 * themselves needed — so overbuilt chains do not pull extra inputs. Goods no
 * resident or factory uses (bricks, weapons, …) run at full capacity.
 * Surplus anywhere is assumed to reach demand anywhere.
 */
export function utilization(islands: Island[], settings: Settings): Utilization {
  const capacity: Rates = new Map();
  const demand: Rates = new Map();
  const built = new Map<Id, number>();
  for (const island of islands) {
    for (const [p, r] of residentDemand(island, settings)) add(demand, p, r);
    for (const [fid, count] of Object.entries(island.buildings)) {
      const f = factoryById.get(Number(fid));
      if (!f || count <= 0) continue;
      add(built, f.id, count);
      for (const o of f.outputs) add(capacity, o.product, count * f.tpmin * o.amount);
    }
  }
  const consumers = new Map<Id, { factory: Factory; count: number; amount: number }[]>();
  for (const [fid, count] of built) {
    const f = factoryById.get(fid)!;
    for (const i of f.inputs) {
      const list = consumers.get(i.product) ?? [];
      list.push({ factory: f, count, amount: i.amount });
      consumers.set(i.product, list);
    }
  }

  const util: Utilization = new Map();
  const visiting = new Set<Id>();
  const utilOf = (product: Id): number => {
    const known = util.get(product);
    if (known !== undefined) return known;
    const cap = capacity.get(product) ?? 0;
    if (cap === 0) return 0;
    if (!consumerGoods.has(product) && !intermediateGoods.has(product)) {
      util.set(product, 1);
      return 1;
    }
    // A cycle cannot occur in base-game chains; treat one as full demand.
    if (visiting.has(product)) return 1;
    visiting.add(product);
    let required = demand.get(product) ?? 0;
    for (const c of consumers.get(product) ?? []) {
      required += c.count * c.factory.tpmin * c.amount * utilOf(c.factory.outputs[0].product);
    }
    visiting.delete(product);
    const u = Math.min(1, required / cap);
    util.set(product, u);
    return u;
  };
  for (const product of capacity.keys()) utilOf(product);
  return util;
}

/**
 * Building-driven view: what the island's buildings make vs. what it uses up.
 * Factories draw inputs at the rate `util` says they run (by default, the
 * island on its own).
 */
export function islandBalance(island: Island, settings: Settings, util?: Utilization): ProductBalance[] {
  const u = util ?? utilization([island], settings);
  const produced: Rates = new Map();
  const factoryUse: Rates = new Map();
  for (const [fid, count] of Object.entries(island.buildings)) {
    const f = factoryById.get(Number(fid));
    if (!f || count <= 0) continue;
    const run = u.get(f.outputs[0].product) ?? 0;
    for (const o of f.outputs) add(produced, o.product, count * f.tpmin * o.amount);
    for (const i of f.inputs) add(factoryUse, i.product, count * f.tpmin * i.amount * run);
  }
  return mergeBalance(produced, residentDemand(island, settings), factoryUse);
}

function mergeBalance(produced: Rates, residents: Rates, factories: Rates): ProductBalance[] {
  const ids = new Set([...produced.keys(), ...residents.keys(), ...factories.keys()]);
  return [...ids].map((product) => {
    const p = produced.get(product) ?? 0;
    const r = residents.get(product) ?? 0;
    const f = factories.get(product) ?? 0;
    return { product, produced: p, residents: r, factories: f, trade: 0, net: p - r - f };
  });
}

export interface Analysis {
  utilization: Utilization;
  /** All islands summed; trade moves goods between islands, so it nets out here. */
  empire: ProductBalance[];
  /** Per island, after trade routes. */
  byIsland: Map<string, ProductBalance[]>;
  flows: RouteFlow[];
  /** Per island, per good: + imports − exports. */
  trade: Map<string, Map<Id, number>>;
}

/** Island and empire balances, with factories running at empire-wide utilization and routes applied. */
export function analyze(islands: Island[], settings: Settings, routes: TradeRoute[] = []): Analysis {
  const util = utilization(islands, settings);
  const preTrade = new Map(islands.map((i) => [i.id, islandBalance(i, settings, util)]));
  const produced: Rates = new Map();
  const residents: Rates = new Map();
  const factories: Rates = new Map();
  for (const balance of preTrade.values()) {
    for (const b of balance) {
      add(produced, b.product, b.produced);
      add(residents, b.product, b.residents);
      add(factories, b.product, b.factories);
    }
  }
  const nets = new Map([...preTrade].map(([id, bal]) => [id, new Map(bal.map((b) => [b.product, b.net]))]));
  const { flows, net: trade } = resolveRoutes(routes, nets);
  const byIsland = new Map(
    [...preTrade].map(([id, bal]) => {
      const t = trade.get(id);
      if (!t) return [id, bal];
      const rows = new Map(bal.map((b) => [b.product, { ...b }]));
      for (const [product, v] of t) {
        const row = rows.get(product) ?? { product, produced: 0, residents: 0, factories: 0, trade: 0, net: 0 };
        row.trade += v;
        row.net += v;
        rows.set(product, row);
      }
      return [id, [...rows.values()]];
    }),
  );
  return { utilization: util, empire: mergeBalance(produced, residents, factories), byIsland, flows, trade };
}

/** Sums island balances, as if every island could ship to every other one. */
export const empireBalance = (islands: Island[], settings: Settings) => analyze(islands, settings).empire;

export interface ChainNode {
  product: Id;
  /** Tons per minute this node must supply. */
  rate: number;
  factory: Factory | null;
  /** Fractional buildings needed to supply `rate`. */
  buildings: number;
  children: ChainNode[];
}

/**
 * The full production chain for `rate` t/min of `product`, consumed in
 * `region`. Each input is sourced from the region of the building that uses it.
 */
export function supplyChain(product: Id, rate: number, region: Id, seen: Id[] = []): ChainNode {
  const factory = producerFor(product, region) ?? null;
  if (!factory || seen.includes(product)) return { product, rate, factory, buildings: 0, children: [] };
  const buildings = rate / outputRate(factory);
  const children = factory.inputs.map((i) =>
    supplyChain(i.product, buildings * factory.tpmin * i.amount, factory.region, [...seen, product]),
  );
  return { product, rate, factory, buildings, children };
}

/** Adds every node's buildings into `out`, keyed by factory. */
export function collectBuildings(node: ChainNode, out: Map<Id, number> = new Map()): Map<Id, number> {
  if (node.factory) add(out, node.factory.id, node.buildings);
  node.children.forEach((c) => collectBuildings(c, out));
  return out;
}

export interface BuildingPlan {
  factory: Factory;
  /** Fractional buildings the residents' demand calls for. */
  required: number;
  existing: number;
  /** Whole buildings to add (negative = surplus). */
  missing: number;
}

/**
 * Buildings needed to meet external demands through the full chain. Demands
 * are keyed by good and the region that consumes it; a negative demand (an
 * import) offsets the chain at that point. Inputs come from the region of the
 * building that uses them.
 */
export function chainBuildings(external: Map<string, number>): Map<Id, number> {
  const key = (product: Id, region: Id) => `${product}:${region}`;
  const nodes = new Map<string, { product: Id; region: Id }>();
  const order: string[] = [];
  const visit = (product: Id, region: Id) => {
    const k = key(product, region);
    if (nodes.has(k)) return;
    nodes.set(k, { product, region });
    const f = producerFor(product, region);
    if (f) for (const i of f.inputs) visit(i.product, f.region);
    order.push(k);
  };
  for (const k of external.keys()) {
    const [product, region] = k.split(':').map(Number);
    visit(product, region);
  }
  // Reverse post-order puts every good before the inputs it consumes.
  const inflow = new Map(external);
  const out = new Map<Id, number>();
  for (const k of order.reverse()) {
    const { product, region } = nodes.get(k)!;
    const rate = inflow.get(k) ?? 0;
    const f = producerFor(product, region);
    if (!f || rate <= 0) continue;
    const buildings = rate / outputRate(f);
    add(out, f.id, buildings);
    for (const i of f.inputs) {
      const ck = key(i.product, f.region);
      inflow.set(ck, (inflow.get(ck) ?? 0) + buildings * f.tpmin * i.amount);
    }
  }
  return out;
}

/**
 * Population-driven view: buildings needed for an island's residents, plus
 * its exports, minus what it imports (`trade`: + imports − exports).
 */
export function requiredBuildings(island: Island, settings: Settings, trade?: Map<Id, number>): BuildingPlan[] {
  const external = new Map<string, number>();
  const at = (product: Id) => `${product}:${island.region}`;
  for (const [product, rate] of residentDemand(island, settings)) external.set(at(product), rate);
  for (const [product, t] of trade ?? []) external.set(at(product), (external.get(at(product)) ?? 0) - t);
  return planFrom(chainBuildings(external), island.buildings);
}

/** Population-driven view across all islands, against all existing buildings. */
export function empireRequiredBuildings(
  islands: Island[],
  settings: Settings,
  trade?: Map<string, Map<Id, number>>,
): BuildingPlan[] {
  const need = new Map<Id, number>();
  const existing: Record<string, number> = {};
  for (const island of islands) {
    for (const p of requiredBuildings(island, settings, trade?.get(island.id))) add(need, p.factory.id, p.required);
    for (const [fid, n] of Object.entries(island.buildings)) existing[fid] = (existing[fid] ?? 0) + n;
  }
  return planFrom(need, existing);
}

/** Rounds up to whole buildings, ignoring float noise in the source rates. */
export const ceilWhole = (x: number) => Math.ceil(Math.round(x * 1e4) / 1e4);

function planFrom(need: Map<Id, number>, existingRec: Record<string, number>): BuildingPlan[] {
  const ids = new Set([...need.keys(), ...Object.keys(existingRec).map(Number)]);
  const plans: BuildingPlan[] = [];
  for (const id of ids) {
    const factory = factoryById.get(id);
    if (!factory) continue;
    const required = need.get(id) ?? 0;
    const existing = existingRec[id] ?? 0;
    plans.push({ factory, required, existing, missing: ceilWhole(required) - existing });
  }
  return plans.sort((a, b) => b.missing - a.missing || a.factory.name.localeCompare(b.factory.name));
}

export interface WorkforceBalance {
  workforce: Id;
  required: number;
  available: number;
}

/** Workers the buildings need vs. workers the residents provide, per tier. */
export function workforceBalance(island: Island): WorkforceBalance[] {
  const required = new Map<Id, number>();
  for (const [fid, count] of Object.entries(island.buildings)) {
    const f = factoryById.get(Number(fid));
    if (f) add(required, f.workforce.type, count * f.workforce.amount);
  }
  return game.workforce
    .map((w) => ({
      workforce: w.id,
      required: required.get(w.id) ?? 0,
      available: island.residents[w.populationLevel] ?? 0,
    }))
    .filter((w) => w.required > 0 || w.available > 0);
}

/** Houses a tier needs for `residents` with every need met. */
export const housesFor = (level: PopulationLevel, residents: number) => Math.ceil(residents / level.fullHouse);

/** Island-level shortage of a good: `import` when another island has the surplus, `short` when the empire lacks it. */
export type Shortage = 'import' | 'short';

export function shortages(island: ProductBalance[], empire: ProductBalance[]): Map<Id, Shortage> {
  const empireNet = new Map(empire.map((b) => [b.product, b.net]));
  const out = new Map<Id, Shortage>();
  for (const b of island) {
    if (b.net >= -EPS) continue;
    out.set(b.product, (empireNet.get(b.product) ?? b.net) < -EPS ? 'short' : 'import');
  }
  return out;
}

/** Products the whole empire produces less of than it uses. */
export const empireShortGoods = (empire: ProductBalance[]) =>
  new Set(empire.filter((b) => b.net < -EPS).map((b) => b.product));

export const EPS = 1e-4;

export const REVENUE_BONUS: Record<Revenue, number> = { plenty: 0.25, medium: 0.125, spare: 0 };

/** Needs that pay taxes: goods and services, after unlocks and bonus choices. */
export function taxedNeeds(level: PopulationLevel, residents: number, island: Island, settings: Settings): Need[] {
  return level.needs.filter(
    (n) =>
      n.money > 0 &&
      (!n.bonus || island.bonusNeeds.includes(n.product)) &&
      (!settings.applyUnlocks || n.unlockAt === null || residents >= n.unlockAt),
  );
}

export interface TierIncome {
  level: Id;
  residents: number;
  /** Taxes with every need met, difficulty bonus included. */
  taxes: number;
  /** Royal taxes the crown deducts from this tier's taxes. */
  royalTax: number;
  /** Part of `taxes` that depends on goods the empire is short of. */
  atRisk: number;
}

export interface Income {
  tiers: TierIncome[];
  taxes: number;
  royalTaxes: number;
  atRisk: number;
  maintenance: number;
  /** taxes − royalTaxes − maintenance. */
  net: number;
}

/**
 * Royal tax rate (percent) for one tier on one island: none below 1000
 * residents, then floor(1 + residents / 125), capped at 40% from 4875.
 */
export const royalTaxRate = (residents: number) => (residents < 1000 ? 0 : Math.min(40, Math.floor(1 + residents / 125)));

/**
 * Coins per minute: taxes (MoneyValue / 100 per resident per met need, times
 * the Revenue multiplier), minus royal taxes per tier, minus production-building
 * upkeep. Public buildings, warehouses and ships are not counted.
 */
export function islandIncome(island: Island, settings: Settings, shortGoods: Set<Id> = new Set()): Income {
  const factor = 1 + REVENUE_BONUS[settings.revenue];
  const tiers: TierIncome[] = [];
  for (const [levelId, residents] of Object.entries(island.residents)) {
    const level = levelById.get(Number(levelId));
    if (!level || residents <= 0) continue;
    let taxes = 0;
    let atRisk = 0;
    for (const n of taxedNeeds(level, residents, island, settings)) {
      const t = (n.money / 100) * residents * factor;
      taxes += t;
      if (shortGoods.has(n.product)) atRisk += t;
    }
    const royalTax = Math.floor((taxes * royalTaxRate(residents)) / 100);
    tiers.push({ level: level.id, residents, taxes, royalTax, atRisk });
  }
  let maintenance = 0;
  for (const [fid, count] of Object.entries(island.buildings)) maintenance += (factoryById.get(Number(fid))?.maintenance ?? 0) * count;
  const taxes = tiers.reduce((s, t) => s + t.taxes, 0);
  const royalTaxes = tiers.reduce((s, t) => s + t.royalTax, 0);
  const atRisk = tiers.reduce((s, t) => s + t.atRisk, 0);
  return { tiers, taxes, royalTaxes, atRisk, maintenance, net: taxes - royalTaxes - maintenance };
}
