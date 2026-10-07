import { describe, expect, it } from 'vitest';
import { analyze, islandPlan, workforceBalance } from './calc';
import { constructionFeeders } from './gameData';
import { newIsland, reducer, initialState, type Island, type Settings } from './state';

const OLD_WORLD = 5000000;
const NEW_WORLD = 5000001;
const WORKERS = 15000001;
const ENGINEERS = 15000003;
const FISHERY = 1010278;
const BRICK_FACTORY = 1010283;
const CLAY_PIT = 100416;
const LUMBERJACK = 1010266;
const SAILMAKERS = 1010288;
const SHEEP_FARM = 1010267;
const WEAPON_FACTORY = 1010299;
const COFFEE_ROASTER = 101252;
const BRICKS = 1010205;
const SAILS = 1010210;
const WOOD = 120008;
const FISH = 1010200;

const settings: Settings = { applyUnlocks: true, revenue: 'spare' };
const island = (patch: Partial<Island>): Island => ({ ...newIsland('Test', OLD_WORLD), ...patch });

describe('auto-build', () => {
  it('builds every consumer chain for the residents', () => {
    const i = island({ residents: { [WORKERS]: 2000 }, autoBuild: true });
    const a = analyze([i], settings);
    const auto = a.auto.get(i.id)!;
    // 2000 workers eat 5 t/min of fish → 3 fisheries (2.5 rounded up).
    expect(auto.get(FISHERY)).toBe(3);
    expect(islandPlan(a, i).filter((p) => p.factory.region === OLD_WORLD && p.missing > 0)).toEqual([]);
    expect(a.byIsland.get(i.id)!.filter((b) => b.residents > 0 && b.net < -1e-4)).toEqual([]);
  });

  it('keeps manual buildings as extras on top', () => {
    const i = island({ residents: { [WORKERS]: 2000 }, autoBuild: true, buildings: { [BRICK_FACTORY]: 2, [WEAPON_FACTORY]: 1, [FISHERY]: 1 } });
    const built = analyze([i], settings).effective.get(i.id)!;
    expect(built.buildings[BRICK_FACTORY]).toBe(2);
    expect(built.buildings[WEAPON_FACTORY]).toBe(1);
    expect(built.buildings[FISHERY]).toBe(4);
  });

  it('does nothing when off', () => {
    const i = island({ residents: { [WORKERS]: 2000 } });
    const a = analyze([i], settings);
    expect(a.auto.get(i.id)!.size).toBe(0);
    expect(a.effective.get(i.id)!.buildings).toEqual({});
  });

  it('leaves other-region buildings to routes', () => {
    const i = island({ residents: { [ENGINEERS]: 2000 }, autoBuild: true });
    const a = analyze([i], settings);
    expect(a.auto.get(i.id)!.has(COFFEE_ROASTER)).toBe(false);
    expect(islandPlan(a, i).find((p) => p.factory.id === COFFEE_ROASTER)!.missing).toBeGreaterThan(0);
  });

  it('counts auto-built buildings in the workforce', () => {
    const i = island({ residents: { [WORKERS]: 2000 }, autoBuild: true });
    const wf = workforceBalance(analyze([i], settings).effective.get(i.id)!);
    expect(wf.find((w) => w.workforce === 1010052)!.required).toBeGreaterThan(0);
  });

  it('enabling with clear drops only the listed manual counts', () => {
    let s = initialState();
    const id = s.islands[0].id;
    s = reducer(s, { type: 'setBuildings', id, factory: FISHERY, value: 3 });
    s = reducer(s, { type: 'setBuildings', id, factory: BRICK_FACTORY, value: 2 });
    s = reducer(s, { type: 'setAutoBuild', id, on: true, clear: [FISHERY] });
    expect(s.islands[0].autoBuild).toBe(true);
    expect(s.islands[0].buildings).toEqual({ [BRICK_FACTORY]: 2 });
  });

  it('treats wood, clay and bricks as construction feeders, not fish', () => {
    expect(constructionFeeders.has(WOOD)).toBe(true);
    expect(constructionFeeders.has(BRICKS)).toBe(true);
    expect(constructionFeeders.has(FISH)).toBe(false);
  });
});

describe('targets', () => {
  it('plans the chain for a target', () => {
    const i = island({ targets: { [BRICKS]: 2 } });
    const a = analyze([i], settings);
    const plan = islandPlan(a, i);
    expect(plan.find((p) => p.factory.id === BRICK_FACTORY)!.required).toBeCloseTo(2, 6);
    expect(plan.find((p) => p.factory.id === CLAY_PIT)!.required).toBeCloseTo(1, 6);
  });

  it('counts the target as demand in the balance', () => {
    const i = island({ targets: { [BRICKS]: 2 }, buildings: { [BRICK_FACTORY]: 1, [CLAY_PIT]: 1 } });
    const row = analyze([i], settings).byIsland.get(i.id)!.find((b) => b.product === BRICKS)!;
    expect(row.target).toBe(2);
    expect(row.net).toBeCloseTo(-1, 6);
  });

  it('auto-builds the target chain', () => {
    const i = island({ targets: { [SAILS]: 2 }, autoBuild: true });
    const auto = analyze([i], settings).auto.get(i.id)!;
    expect(auto.get(SAILMAKERS)).toBe(1);
    expect(auto.get(SHEEP_FARM)).toBe(1);
  });

  it('a target on another region good routes like any demand', () => {
    const nw = { ...newIsland('NW', NEW_WORLD), targets: { [WOOD]: 4 }, autoBuild: true };
    expect(analyze([nw], settings).auto.get(nw.id)!.get(101260)).toBe(1);
    expect(analyze([nw], settings).auto.get(nw.id)!.has(LUMBERJACK)).toBe(false);
  });
});
