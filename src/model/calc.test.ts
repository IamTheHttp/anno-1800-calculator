import { describe, expect, it } from 'vitest';
import {
  collectBuildings,
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

const unlocks: Settings = { applyUnlocks: true };
const noUnlocks: Settings = { applyUnlocks: false };

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
  it('nets production against residents and factory inputs', () => {
    const i = island({
      residents: { [FARMERS]: 400 },
      buildings: { [FISHERY]: 1, [SCHNAPPS_DISTILLERY]: 1, [POTATO_FARM]: 1 },
    });
    const bal = islandBalance(i, unlocks);
    const fish = byProduct(bal, FISH)!;
    expect(fish.produced).toBe(2);
    expect(fish.residents).toBeCloseTo(1, 3);
    expect(fish.net).toBeCloseTo(1, 3);
    const potatoes = byProduct(bal, 1010195)!;
    expect(potatoes.produced).toBe(2);
    expect(potatoes.factories).toBe(2);
    expect(potatoes.net).toBe(0);
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
