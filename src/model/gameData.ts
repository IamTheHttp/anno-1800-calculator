import raw from '../data/game-data.json';

export type Id = number;

export interface Region {
  id: Id;
  name: string;
  icon: string | null;
}

export interface Product {
  id: Id;
  name: string;
  icon: string | null;
}

export interface Flow {
  product: Id;
  amount: number;
}

export interface Factory {
  id: Id;
  name: string;
  region: Id;
  icon: string | null;
  /** Production cycles per minute. */
  tpmin: number;
  inputs: Flow[];
  outputs: Flow[];
  workforce: { type: Id; amount: number };
  /** Coin upkeep per minute. */
  maintenance: number;
}

export interface Need {
  product: Id;
  /** Tons per minute per resident; null for public-service needs. */
  tpmin: number | null;
  /** Residents a house gains when this need is met. */
  residents: number;
  /** Residents of this tier on the island before the need appears. */
  unlockAt: number | null;
  bonus: boolean;
  /** The game's MoneyValue: tax per full house is money / 10. */
  money: number;
}

export interface PopulationLevel {
  id: Id;
  name: string;
  region: Id;
  icon: string | null;
  fullHouse: number;
  needs: Need[];
}

export interface Workforce {
  id: Id;
  name: string;
  icon: string | null;
  populationLevel: Id;
}

export interface GameData {
  regions: Region[];
  workforce: Workforce[];
  populationLevels: PopulationLevel[];
  factories: Factory[];
  products: Product[];
}

export const game: GameData = raw;

const byId = <T extends { id: Id }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));

export const regionById = byId(game.regions);
export const productById = byId(game.products);
export const factoryById = byId(game.factories);
export const levelById = byId(game.populationLevels);
export const workforceById = byId(game.workforce);

export const producersOf = new Map<Id, Factory[]>();
for (const f of game.factories) {
  for (const o of f.outputs) {
    const list = producersOf.get(o.product) ?? [];
    list.push(f);
    producersOf.set(o.product, list);
  }
}

/** Products some population tier consumes as a good. */
export const consumerGoods = new Set(
  game.populationLevels.flatMap((l) => l.needs.filter((n) => n.tpmin !== null).map((n) => n.product)),
);

/** Products some factory takes as an input. */
export const intermediateGoods = new Set(game.factories.flatMap((f) => f.inputs.map((i) => i.product)));

export type FactoryGroup = 'Consumer goods' | 'Intermediates' | 'Construction & other';
export const FACTORY_GROUPS: FactoryGroup[] = ['Consumer goods', 'Intermediates', 'Construction & other'];

export function factoryGroup(f: Factory): FactoryGroup {
  const out = f.outputs[0].product;
  if (consumerGoods.has(out)) return 'Consumer goods';
  if (intermediateGoods.has(out)) return 'Intermediates';
  return 'Construction & other';
}

export const levelsOfRegion = (region: Id) => game.populationLevels.filter((l) => l.region === region);
export const factoriesOfRegion = (region: Id) => game.factories.filter((f) => f.region === region);

/** Tons per minute one building produces of its first output. */
export const outputRate = (f: Factory) => f.tpmin * f.outputs[0].amount;

/**
 * The building that makes `product` for a consumer in `region`. Prefers a
 * producer in the same region, since goods made elsewhere must be shipped.
 */
export function producerFor(product: Id, region: Id): Factory | undefined {
  const list = producersOf.get(product);
  if (!list) return undefined;
  return list.find((f) => f.region === region) ?? list[0];
}
