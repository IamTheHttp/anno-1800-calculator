import { describe, expect, it } from 'vitest';
import {
  analyze,
  collectBuildings,
  empireShortGoods,
  islandIncome,
  shortages,
  empireBalance,
  empireRequiredBuildings,
  islandBalance,
  requiredBuildings,
  residentDemand,
  supplyChain,
  workforceBalance,
} from './calc';
import { newIsland, type Island, type Settings } from './state';

const OLD_WORLD = 5000000;
const NEW_WORLD = 5000001;
const FARMERS = 15000000;
const WORKERS = 15000001;
const FISH = 1010200;
const SCHNAPPS = 1010216;
const WORK_CLOTHES = 1010237;
const BREAD = 1010213;
const RUM = 1010257;
const FISHERY = 1010278;
const SCHNAPPS_DISTILLERY = 1010294;
const POTATO_FARM = 1010265;
const GRAIN_FARM = 1010262;
const FLOUR_MILL = 1010313;
const BAKERY = 1010291;
const RUM_DISTILLERY = 1010340;
const NW_LUMBERJACK = 101260;
const OW_LUMBERJACK = 1010266;
const SUGAR_CANE = 1010329;
const BREWERY = 1010292;
const MALTHOUSE = 1010314;
const HOP_FARM = 1010264;
const SAWMILL = 100451;
const BEER = 1010214;
const GRAIN = 1010192;
const HOPS = 1010194;

const unlocks: Settings = { applyUnlocks: true, revenue: 'spare' };
const noUnlocks: Settings = { applyUnlocks: false, revenue: 'spare' };

const island = (patch: Partial<Island>): Island => ({ ...newIsland('Test', OLD_WORLD), ...patch });
const byProduct = <T extends { product: number }>(xs: T[], id: number) => xs.find((x) => x.product === id);

describe('residentDemand', () => {
  it('800 farmers eat 2 t/min of fish, one fishery', () => {
    const demand = residentDemand(island({ residents: { [FARMERS]: 800 } }), unlocks);
    expect(demand.get(FISH)).toBeCloseTo(2, 3);
  });

  it('respects unlock thresholds only when enabled', () => {
    const small = island({ residents: { [FARMERS]: 60 } });
    expect(residentDemand(small, unlocks).has(SCHNAPPS)).toBe(false);
    expect(residentDemand(small, noUnlocks).has(SCHNAPPS)).toBe(true);
    expect(residentDemand(small, unlocks).has(FISH)).toBe(true);
  });

  it('counts bonus needs only when the island supplies them', () => {
    const base = island({ residents: { [WORKERS]: 1000 } });
    expect(residentDemand(base, unlocks).has(RUM)).toBe(false);
    expect(residentDemand({ ...base, bonusNeeds: [RUM] }, unlocks).has(RUM)).toBe(true);
  });
});

describe('islandBalance', () => {
  it('nets production against residents and the inputs factories need', () => {
    const i = island({
      residents: { [FARMERS]: 400 },
      buildings: { [FISHERY]: 1, [SCHNAPPS_DISTILLERY]: 1, [POTATO_FARM]: 1 },
    });
    const bal = islandBalance(i, unlocks);
    const fish = byProduct(bal, FISH)!;
    expect(fish.produced).toBe(2);
    expect(fish.residents).toBeCloseTo(1, 3);
    expect(fish.net).toBeCloseTo(1, 3);
    // 400 farmers drink 1.33 t/min of schnapps, so the distillery runs at 2/3
    // and draws 1.33 t/min of potatoes, not its full 2.
    const potatoes = byProduct(bal, 1010195)!;
    expect(potatoes.produced).toBe(2);
    expect(potatoes.factories).toBeCloseTo(4 / 3, 3);
    expect(potatoes.net).toBeCloseTo(2 / 3, 3);
  });

  it('does not flag inputs of an overbuilt chain', () => {
    // 1000 workers drink ~0.77 t/min of beer; 3 breweries could make 3.
    const i = island({
      residents: { [WORKERS]: 1000 },
      buildings: { [BREWERY]: 3, [MALTHOUSE]: 2, [HOP_FARM]: 2, [GRAIN_FARM]: 1 },
    });
    const bal = islandBalance(i, unlocks);
    expect(byProduct(bal, BEER)!.net).toBeGreaterThan(0);
    expect(byProduct(bal, GRAIN)!.net).toBeGreaterThan(0);
    expect(byProduct(bal, HOPS)!.net).toBeGreaterThan(0);
  });

  it('flags inputs when the output is actually needed', () => {
    const i = island({ residents: { [WORKERS]: 4000 }, buildings: { [BREWERY]: 3, [MALTHOUSE]: 2, [HOP_FARM]: 5, [GRAIN_FARM]: 1 } });
    expect(byProduct(islandBalance(i, unlocks), GRAIN)!.net).toBeLessThan(0);
  });

  it('runs goods nobody consumes at full capacity', () => {
    const i = island({ buildings: { [SAWMILL]: 1, [OW_LUMBERJACK]: 1 } });
    expect(byProduct(islandBalance(i, unlocks), 120008)!.factories).toBe(4);
  });

  it('runs exporting factories for demand on other islands', () => {
    const a = island({ residents: { [WORKERS]: 4000 } });
    const b = island({ buildings: { [BREWERY]: 3, [MALTHOUSE]: 2, [HOP_FARM]: 5, [GRAIN_FARM]: 1 } });
    const { byIsland } = analyze([a, b], unlocks);
    expect(byProduct(byIsland.get(b.id)!, GRAIN)!.net).toBeLessThan(0);
    // On its own, island B has no beer demand and needs no grain.
    expect(byProduct(islandBalance(b, unlocks), GRAIN)!.net).toBeGreaterThan(0);
  });

  it('empire balance sums islands', () => {
    const a = island({ buildings: { [FISHERY]: 1 } });
    const b = island({ residents: { [FARMERS]: 800 } });
    expect(byProduct(empireBalance([a, b], unlocks), FISH)!.net).toBeCloseTo(0, 3);
  });
});

describe('supplyChain', () => {
  it('expands bread into bakery → flour mill → grain farms', () => {
    const chain = supplyChain(BREAD, 1, OLD_WORLD);
    expect(chain.factory!.id).toBe(BAKERY);
    expect(chain.buildings).toBe(1);
    const counts = collectBuildings(chain);
    expect(counts.get(FLOUR_MILL)).toBe(0.5);
    expect(counts.get(GRAIN_FARM)).toBe(1);
  });

  it('sources inputs from the region of the consuming building', () => {
    const counts = collectBuildings(supplyChain(RUM, 2, OLD_WORLD));
    expect(counts.get(RUM_DISTILLERY)).toBe(1);
    expect(counts.get(SUGAR_CANE)).toBe(1);
    expect(counts.get(NW_LUMBERJACK)).toBe(0.5);
    expect(counts.has(OW_LUMBERJACK)).toBe(false);
  });

  it('prefers a producer in the consumer region', () => {
    expect(supplyChain(120008, 4, NEW_WORLD).factory!.id).toBe(NW_LUMBERJACK);
    expect(supplyChain(120008, 4, OLD_WORLD).factory!.id).toBe(OW_LUMBERJACK);
  });
});

describe('requiredBuildings', () => {
  it('rounds up to whole buildings and subtracts existing ones', () => {
    const i = island({ residents: { [FARMERS]: 1000 }, buildings: { [FISHERY]: 1 } });
    const fishery = requiredBuildings(i, unlocks).find((p) => p.factory.id === FISHERY)!;
    expect(fishery.required).toBeCloseTo(1.25, 3);
    expect(fishery.missing).toBe(1);
  });

  it('reports surplus buildings as negative', () => {
    const i = island({ residents: { [FARMERS]: 100 }, buildings: { [FISHERY]: 3 } });
    expect(requiredBuildings(i, unlocks).find((p) => p.factory.id === FISHERY)!.missing).toBe(-2);
  });

  it('empire plan pools buildings across islands', () => {
    const a = island({ residents: { [FARMERS]: 800 } });
    const b = island({ buildings: { [FISHERY]: 1 } });
    expect(empireRequiredBuildings([a, b], unlocks).find((p) => p.factory.id === FISHERY)!.missing).toBe(0);
  });

  it('includes the full chain behind work clothes', () => {
    const i = island({ residents: { [FARMERS]: 1000 } });
    const names = requiredBuildings(i, unlocks).map((p) => p.factory.name);
    expect(residentDemand(i, unlocks).has(WORK_CLOTHES)).toBe(true);
    expect(names).toContain('Framework Knitters');
    expect(names).toContain('Sheep Farm');
  });
});

describe('workforceBalance', () => {
  it('compares worker demand with residents of the tier', () => {
    const i = island({ residents: { [FARMERS]: 30 }, buildings: { [FISHERY]: 2 } });
    const farmers = workforceBalance(i).find((w) => w.workforce === 1010052)!;
    expect(farmers.required).toBe(50);
    expect(farmers.available).toBe(30);
  });
});

describe('shortages', () => {
  it('marks a deficit as import when another island has the surplus', () => {
    const a = island({ residents: { [FARMERS]: 800 } });
    const b = island({ buildings: { [FISHERY]: 2 } });
    const empire = empireBalance([a, b], unlocks);
    expect(shortages(islandBalance(a, unlocks), empire).get(FISH)).toBe('import');
  });

  it('marks a deficit as short when the empire lacks the good', () => {
    const a = island({ residents: { [FARMERS]: 800 } });
    const empire = empireBalance([a], unlocks);
    expect(shortages(islandBalance(a, unlocks), empire).get(FISH)).toBe('short');
    expect(empireShortGoods(empire).has(FISH)).toBe(true);
  });
});

describe('islandIncome', () => {
  it('pays MoneyValue / 10 per full farmer house', () => {
    // 150 farmers = 15 full houses; fish 10 + schnapps 30 + work clothes 30 + pub 12 = 82 → 8.2 per house.
    const inc = islandIncome(island({ residents: { [FARMERS]: 150 } }), unlocks);
    expect(inc.taxes).toBeCloseTo(15 * 8.2, 6);
  });

  it('applies the revenue bonus to taxes only', () => {
    const i = island({ residents: { [FARMERS]: 150 }, buildings: { [FISHERY]: 1 } });
    const spare = islandIncome(i, unlocks);
    const plenty = islandIncome(i, { ...unlocks, revenue: 'plenty' });
    expect(plenty.taxes).toBeCloseTo(spare.taxes * 1.25, 6);
    expect(plenty.maintenance).toBe(40);
    expect(plenty.net).toBeCloseTo(plenty.taxes - 40, 6);
  });

  it('skips locked needs and unticked bonus needs', () => {
    const small = islandIncome(island({ residents: { [FARMERS]: 60 } }), unlocks);
    // Only fish is unlocked at 60 farmers: 6 houses × 1.
    expect(small.taxes).toBeCloseTo(6, 6);
    const rum = island({ residents: { [WORKERS]: 1000 } });
    expect(islandIncome({ ...rum, bonusNeeds: [RUM] }, unlocks).taxes).toBeGreaterThan(islandIncome(rum, unlocks).taxes);
  });

  it('reports taxes at risk from goods the empire lacks', () => {
    const inc = islandIncome(island({ residents: { [FARMERS]: 150 } }), unlocks, new Set([FISH]));
    expect(inc.atRisk).toBeCloseTo(15, 6);
  });
});
