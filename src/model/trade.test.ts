import { describe, expect, it } from 'vitest';
import { analyze, empirePlan, islandPlan, shortages } from './calc';
import { initialState, newIsland, parseExportFile, reducer, toExportFile, type Island, type Settings, type TradeRoute } from './state';
import { resolveRoutes } from './trade';

const OLD_WORLD = 5000000;
const FARMERS = 15000000;
const FISH = 1010200;
const SCHNAPPS = 1010216;
const FISHERY = 1010278;
const SCHNAPPS_DISTILLERY = 1010294;
const POTATO_FARM = 1010265;

const settings: Settings = { applyUnlocks: true, revenue: 'spare' };
const island = (name: string, patch: Partial<Island>): Island => ({ ...newIsland(name, OLD_WORLD), ...patch });
const route = (from: Island, to: Island, product: number, amount: number | null): TradeRoute => ({
  id: `${from.name}-${to.name}-${product}`,
  from: from.id,
  to: to.id,
  product,
  amount,
});
const row = (a: ReturnType<typeof analyze>, i: Island, product: number) => a.byIsland.get(i.id)!.find((b) => b.product === product);

// 800 farmers eat 2 t/min of fish and drink 2.67 t/min of schnapps.
const home = island('Home', { residents: { [FARMERS]: 800 } });
const fishIsle = island('Fish', { buildings: { [FISHERY]: 3 } });
const booze = island('Booze', { buildings: { [SCHNAPPS_DISTILLERY]: 2, [POTATO_FARM]: 2 } });

describe('resolveRoutes', () => {
  const pre = new Map([
    ['a', new Map([[FISH, 4]])],
    ['b', new Map([[FISH, -3]])],
    ['c', new Map([[FISH, -3]])],
  ]);

  it('auto routes ship what the destination lacks, up to the source surplus, in order', () => {
    const r = resolveRoutes(
      [
        { id: '1', from: 'a', to: 'b', product: FISH, amount: null },
        { id: '2', from: 'a', to: 'c', product: FISH, amount: null },
      ],
      pre,
    );
    expect(r.flows.map((f) => f.actual)).toEqual([3, 1]);
    expect(r.net.get('a')!.get(FISH)).toBe(-4);
  });

  it('fixed routes ship their amount and flag a short source', () => {
    const r = resolveRoutes([{ id: '1', from: 'a', to: 'b', product: FISH, amount: 5 }], pre);
    expect(r.flows[0]).toMatchObject({ actual: 5, sourceShort: true });
  });

  it('fixed routes run before auto routes', () => {
    const r = resolveRoutes(
      [
        { id: 'auto', from: 'a', to: 'c', product: FISH, amount: null },
        { id: 'fixed', from: 'a', to: 'b', product: FISH, amount: 3 },
      ],
      pre,
    );
    expect(r.flows.find((f) => f.route.id === 'auto')!.actual).toBe(1);
  });
});

describe('analyze with routes', () => {
  it('moves goods between islands and clears the shortage', () => {
    const without = analyze([home, fishIsle], settings);
    expect(shortages(without.byIsland.get(home.id)!, without.empire).get(FISH)).toBe('import');

    const a = analyze([home, fishIsle], settings, [route(fishIsle, home, FISH, null)]);
    expect(row(a, home, FISH)!.trade).toBeCloseTo(2, 3);
    expect(row(a, home, FISH)!.net).toBeCloseTo(0, 3);
    expect(row(a, fishIsle, FISH)!.net).toBeCloseTo(4, 3);
    expect(shortages(a.byIsland.get(home.id)!, a.empire).has(FISH)).toBe(false);
  });

  it('leaves the empire balance unchanged', () => {
    const a = analyze([home, fishIsle], settings);
    const b = analyze([home, fishIsle], settings, [route(fishIsle, home, FISH, 1)]);
    expect(b.empire).toEqual(a.empire);
  });
});

describe('needs plan with routes', () => {
  const req = (a: ReturnType<typeof analyze>, i: Island, factory: number) =>
    islandPlan(a, i).find((p) => p.factory.id === factory)?.required ?? 0;

  it('drops the chain of an imported good from the home island', () => {
    const a = analyze([home, booze], settings, [route(booze, home, SCHNAPPS, null)]);
    expect(req(a, home, SCHNAPPS_DISTILLERY)).toBeCloseTo(0, 6);
    expect(req(a, home, POTATO_FARM)).toBeCloseTo(0, 6);
  });

  it('puts the exported chain on the producing island', () => {
    const a = analyze([home, booze], settings, [route(booze, home, SCHNAPPS, null)]);
    // 2.67 t/min of schnapps = 1.33 distilleries and 1.33 potato farms.
    expect(req(a, booze, SCHNAPPS_DISTILLERY)).toBeCloseTo(4 / 3, 2);
    expect(req(a, booze, POTATO_FARM)).toBeCloseTo(4 / 3, 2);
  });

  it('routes demand even when the source has built nothing yet', () => {
    const empty = island('Empty', {});
    const a = analyze([home, empty], settings, [route(empty, home, SCHNAPPS, null)]);
    expect(req(a, empty, SCHNAPPS_DISTILLERY)).toBeCloseTo(4 / 3, 2);
    expect(a.plan.transfers.get(`Empty-Home-${SCHNAPPS}`)).toBeCloseTo(8 / 3, 3);
  });

  it('chains routes through several islands', () => {
    const potatoes = island('Potatoes', {});
    const a = analyze([home, booze, potatoes], settings, [
      route(booze, home, SCHNAPPS, null),
      route(potatoes, booze, 1010195, null),
    ]);
    expect(req(a, booze, POTATO_FARM)).toBeCloseTo(0, 6);
    expect(req(a, potatoes, POTATO_FARM)).toBeCloseTo(4 / 3, 2);
  });

  it('a fixed route moves only its amount', () => {
    const a = analyze([home, booze], settings, [route(booze, home, SCHNAPPS, 2)]);
    expect(req(a, booze, SCHNAPPS_DISTILLERY)).toBeCloseTo(1, 3);
    expect(req(a, home, SCHNAPPS_DISTILLERY)).toBeCloseTo(1 / 3, 2);
  });

  it('empire plan is the same with or without routes', () => {
    const totals = (a: ReturnType<typeof analyze>) =>
      Object.fromEntries(empirePlan(a).filter((p) => p.required > 1e-6).map((p) => [p.factory.id, Math.round(p.required * 1e4)]));
    expect(totals(analyze([home, booze], settings, [route(booze, home, SCHNAPPS, null)]))).toEqual(totals(analyze([home, booze], settings)));
  });
});

describe('route state', () => {
  it('removing an island removes its routes', () => {
    let s = initialState();
    const other = newIsland('Other');
    s = reducer(s, { type: 'addIsland', island: other });
    s = reducer(s, { type: 'addRoute', route: { id: 'r', from: other.id, to: s.islands[0].id, product: FISH, amount: null } });
    expect(s.routes).toHaveLength(1);
    s = reducer(s, { type: 'removeIsland', id: other.id });
    expect(s.routes).toHaveLength(0);
  });

  it('round-trips routes and drops broken ones on import', () => {
    let s = initialState();
    const other = newIsland('Other');
    s = reducer(s, { type: 'addIsland', island: other });
    s = reducer(s, { type: 'addRoute', route: { id: 'r', from: other.id, to: s.islands[0].id, product: FISH, amount: 1.5 } });
    const file = JSON.parse(JSON.stringify(toExportFile(s)));
    expect(parseExportFile(file).state.routes).toEqual(s.routes);

    file.routes.push({ from: other.id, to: other.id, product: FISH, amount: null }, { from: 'nope', to: other.id, product: FISH });
    const parsed = parseExportFile(file);
    expect(parsed.state.routes).toHaveLength(1);
    expect(parsed.warnings).toHaveLength(2);
  });

  it('loads version 1 files without routes', () => {
    const parsed = parseExportFile({ app: 'anno1800-planner', version: 1, islands: [{ name: 'X', region: OLD_WORLD }] });
    expect(parsed.state.routes).toEqual([]);
  });
});
