import {
  factoryById,
  game,
  levelById,
  outputRate,
  producerFor,
  type Factory,
  type Id,
  type Need,
  type PopulationLevel,
} from './gameData';
import type { Island, Revenue, Settings } from './state';

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
  /** produced − residents − factories, in tons per minute. */
  net: number;
}

/** Building-driven view: what the island's buildings make vs. what it uses up. */
export function islandBalance(island: Island, settings: Settings): ProductBalance[] {
  const produced: Rates = new Map();
  const factoryUse: Rates = new Map();
  for (const [fid, count] of Object.entries(island.buildings)) {
    const f = factoryById.get(Number(fid));
    if (!f || count <= 0) continue;
    for (const o of f.outputs) add(produced, o.product, count * f.tpmin * o.amount);
    for (const i of f.inputs) add(factoryUse, i.product, count * f.tpmin * i.amount);
  }
  return mergeBalance(produced, residentDemand(island, settings), factoryUse);
}

function mergeBalance(produced: Rates, residents: Rates, factories: Rates): ProductBalance[] {
  const ids = new Set([...produced.keys(), ...residents.keys(), ...factories.keys()]);
  return [...ids].map((product) => {
    const p = produced.get(product) ?? 0;
    const r = residents.get(product) ?? 0;
    const f = factories.get(product) ?? 0;
    return { product, produced: p, residents: r, factories: f, net: p - r - f };
  });
}

/** Sums island balances, as if every island could ship to every other one. */
export function empireBalance(islands: Island[], settings: Settings): ProductBalance[] {
  const produced: Rates = new Map();
  const residents: Rates = new Map();
  const factories: Rates = new Map();
  for (const island of islands) {
    for (const b of islandBalance(island, settings)) {
      add(produced, b.product, b.produced);
      add(residents, b.product, b.residents);
      add(factories, b.product, b.factories);
    }
  }
  return mergeBalance(produced, residents, factories);
}

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

/** Population-driven view: buildings needed for an island's residents. */
export function requiredBuildings(island: Island, settings: Settings): BuildingPlan[] {
  const need = new Map<Id, number>();
  for (const [product, rate] of residentDemand(island, settings)) {
    collectBuildings(supplyChain(product, rate, island.region), need);
  }
  return planFrom(need, island.buildings);
}

/** Population-driven view across all islands, against all existing buildings. */
export function empireRequiredBuildings(islands: Island[], settings: Settings): BuildingPlan[] {
  const need = new Map<Id, number>();
  const existing: Record<string, number> = {};
  for (const island of islands) {
    for (const p of requiredBuildings(island, settings)) add(need, p.factory.id, p.required);
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
  /** Part of `taxes` that depends on goods the empire is short of. */
  atRisk: number;
}

export interface Income {
  tiers: TierIncome[];
  taxes: number;
  atRisk: number;
  maintenance: number;
  /** taxes − maintenance. */
  net: number;
}

/**
 * Coins per minute: taxes (MoneyValue / 10 per full house, scaled by
 * occupancy, plus the Revenue bonus) minus production-building upkeep.
 * Public buildings, warehouses and ships are not counted.
 */
export function islandIncome(island: Island, settings: Settings, shortGoods: Set<Id> = new Set()): Income {
  const factor = 1 + REVENUE_BONUS[settings.revenue];
  const tiers: TierIncome[] = [];
  for (const [levelId, residents] of Object.entries(island.residents)) {
    const level = levelById.get(Number(levelId));
    if (!level || residents <= 0) continue;
    const houses = residents / level.fullHouse;
    let taxes = 0;
    let atRisk = 0;
    for (const n of taxedNeeds(level, residents, island, settings)) {
      const t = (n.money / 10) * houses * factor;
      taxes += t;
      if (shortGoods.has(n.product)) atRisk += t;
    }
    tiers.push({ level: level.id, residents, taxes, atRisk });
  }
  let maintenance = 0;
  for (const [fid, count] of Object.entries(island.buildings)) maintenance += (factoryById.get(Number(fid))?.maintenance ?? 0) * count;
  const taxes = tiers.reduce((s, t) => s + t.taxes, 0);
  const atRisk = tiers.reduce((s, t) => s + t.atRisk, 0);
  return { tiers, taxes, atRisk, maintenance, net: taxes - maintenance };
}
