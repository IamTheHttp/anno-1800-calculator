import { describe, expect, it } from 'vitest';
import { initialState, newIsland, parseExportFile, reducer, toExportFile } from './state';

const FARMERS = 15000000;
const FISHERY = 1010278;

describe('reducer', () => {
  it('sets counts and drops zeroes', () => {
    let s = initialState();
    const id = s.islands[0].id;
    s = reducer(s, { type: 'setBuildings', id, factory: FISHERY, value: 3 });
    expect(s.islands[0].buildings[FISHERY]).toBe(3);
    s = reducer(s, { type: 'setBuildings', id, factory: FISHERY, value: 0 });
    expect(FISHERY in s.islands[0].buildings).toBe(false);
  });

  it('clamps negative and fractional input', () => {
    const s = initialState();
    const id = s.islands[0].id;
    const next = reducer(s, { type: 'setResidents', id, level: FARMERS, value: -5 });
    expect(next.islands[0].residents[FARMERS]).toBeUndefined();
    expect(reducer(s, { type: 'setResidents', id, level: FARMERS, value: 12.7 }).islands[0].residents[FARMERS]).toBe(12);
  });

  it('moves islands within bounds', () => {
    let s = initialState();
    s = reducer(s, { type: 'addIsland', island: newIsland('B') });
    const [a, b] = s.islands;
    s = reducer(s, { type: 'moveIsland', id: b.id, delta: -1 });
    expect(s.islands.map((i) => i.id)).toEqual([b.id, a.id]);
    expect(reducer(s, { type: 'moveIsland', id: b.id, delta: -1 })).toBe(s);
  });

  it('toggles bonus needs', () => {
    let s = initialState();
    const id = s.islands[0].id;
    s = reducer(s, { type: 'toggleBonusNeed', id, product: 1010257 });
    expect(s.islands[0].bonusNeeds).toEqual([1010257]);
    s = reducer(s, { type: 'toggleBonusNeed', id, product: 1010257 });
    expect(s.islands[0].bonusNeeds).toEqual([]);
  });
});

describe('import/export', () => {
  it('round-trips through JSON', () => {
    let s = initialState();
    const id = s.islands[0].id;
    s = reducer(s, { type: 'setResidents', id, level: FARMERS, value: 500 });
    s = reducer(s, { type: 'setBuildings', id, factory: FISHERY, value: 2 });
    const parsed = parseExportFile(JSON.parse(JSON.stringify(toExportFile(s))));
    expect(parsed.warnings).toEqual([]);
    expect(parsed.state).toEqual(s);
  });

  it('rejects foreign files and future versions', () => {
    expect(() => parseExportFile({ foo: 1 })).toThrow(/Not an Anno/);
    expect(() => parseExportFile({ app: 'anno1800-planner', version: 99, islands: [] })).toThrow(/version/);
  });

  it('drops unknown ids with warnings', () => {
    const parsed = parseExportFile({
      app: 'anno1800-planner',
      version: 1,
      islands: [{ name: 'X', region: 123, residents: { 999: 5, [FARMERS]: 10 }, buildings: { 42: 1 } }],
    });
    const island = parsed.state.islands[0];
    expect(island.region).toBe(5000000);
    expect(island.residents).toEqual({ [FARMERS]: 10 });
    expect(island.buildings).toEqual({});
    expect(parsed.warnings).toHaveLength(3);
  });
});
