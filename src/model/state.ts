import { factoryById, game, levelById, productById, regionById, type Id } from './gameData';

export const SCHEMA_VERSION = 1;
export const APP_ID = 'anno1800-planner';

export interface Island {
  id: string;
  name: string;
  region: Id;
  /** Residents per population level. */
  residents: Record<string, number>;
  /** Built count per factory. */
  buildings: Record<string, number>;
  /** Bonus-need products this island supplies to its residents. */
  bonusNeeds: Id[];
  notes: string;
}

/** The game's "Revenue" difficulty setting, which adds a tax bonus. */
export type Revenue = 'plenty' | 'medium' | 'spare';
export const REVENUES: Revenue[] = ['plenty', 'medium', 'spare'];

export interface Settings {
  /** Hide needs whose resident threshold the island has not reached. */
  applyUnlocks: boolean;
  revenue: Revenue;
}

export interface PlannerState {
  islands: Island[];
  settings: Settings;
}

export interface ExportFile extends PlannerState {
  app: typeof APP_ID;
  version: number;
  exportedAt: string;
}

export const newId = () => Math.random().toString(36).slice(2, 10);

export function newIsland(name: string, region: Id = game.regions[0].id): Island {
  return { id: newId(), name, region, residents: {}, buildings: {}, bonusNeeds: [], notes: '' };
}

export const initialState = (): PlannerState => ({
  islands: [newIsland('Home island')],
  settings: { applyUnlocks: true, revenue: 'medium' },
});

export type Action =
  | { type: 'addIsland'; island: Island }
  | { type: 'updateIsland'; id: string; patch: Partial<Omit<Island, 'id'>> }
  | { type: 'setResidents'; id: string; level: Id; value: number }
  | { type: 'setBuildings'; id: string; factory: Id; value: number }
  | { type: 'toggleBonusNeed'; id: string; product: Id }
  | { type: 'removeIsland'; id: string }
  | { type: 'moveIsland'; id: string; delta: -1 | 1 }
  | { type: 'setSettings'; patch: Partial<Settings> }
  | { type: 'replace'; state: PlannerState };

const setCount = (rec: Record<string, number>, key: Id, value: number) => {
  const next = { ...rec };
  const v = Math.max(0, Math.floor(value) || 0);
  if (v === 0) delete next[key];
  else next[key] = v;
  return next;
};

export function reducer(state: PlannerState, action: Action): PlannerState {
  const mapIsland = (id: string, fn: (i: Island) => Island) => ({
    ...state,
    islands: state.islands.map((i) => (i.id === id ? fn(i) : i)),
  });
  switch (action.type) {
    case 'addIsland':
      return { ...state, islands: [...state.islands, action.island] };
    case 'updateIsland':
      return mapIsland(action.id, (i) => ({ ...i, ...action.patch }));
    case 'setResidents':
      return mapIsland(action.id, (i) => ({ ...i, residents: setCount(i.residents, action.level, action.value) }));
    case 'setBuildings':
      return mapIsland(action.id, (i) => ({ ...i, buildings: setCount(i.buildings, action.factory, action.value) }));
    case 'toggleBonusNeed':
      return mapIsland(action.id, (i) => ({
        ...i,
        bonusNeeds: i.bonusNeeds.includes(action.product)
          ? i.bonusNeeds.filter((p) => p !== action.product)
          : [...i.bonusNeeds, action.product],
      }));
    case 'removeIsland':
      return { ...state, islands: state.islands.filter((i) => i.id !== action.id) };
    case 'moveIsland': {
      const from = state.islands.findIndex((i) => i.id === action.id);
      const to = from + action.delta;
      if (from < 0 || to < 0 || to >= state.islands.length) return state;
      const islands = [...state.islands];
      [islands[from], islands[to]] = [islands[to], islands[from]];
      return { ...state, islands };
    }
    case 'setSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case 'replace':
      return action.state;
  }
}

export function toExportFile(state: PlannerState): ExportFile {
  return { app: APP_ID, version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), ...state };
}

export interface ParseResult {
  state: PlannerState;
  warnings: string[];
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Validates an imported file. Throws on a file that is not a planner export;
 * drops (with a warning) entries that reference unknown game ids, so a file
 * still loads after the game data changes.
 */
export function parseExportFile(input: unknown): ParseResult {
  if (!isObject(input) || input.app !== APP_ID) throw new Error('Not an Anno 1800 planner file.');
  if (typeof input.version !== 'number' || input.version > SCHEMA_VERSION)
    throw new Error(`Unsupported file version: ${String(input.version)}.`);
  if (!Array.isArray(input.islands)) throw new Error('File has no islands list.');

  const warnings: string[] = [];
  const counts = (raw: unknown, valid: (id: Id) => boolean, what: string, island: string) => {
    const out: Record<string, number> = {};
    if (!isObject(raw)) return out;
    for (const [k, v] of Object.entries(raw)) {
      const n = Number(v);
      if (!valid(Number(k))) warnings.push(`${island}: dropped unknown ${what} ${k}.`);
      else if (Number.isFinite(n) && n > 0) out[k] = Math.floor(n);
    }
    return out;
  };

  const islands = input.islands.map((rawIsland, idx): Island => {
    if (!isObject(rawIsland)) throw new Error(`Island #${idx + 1} is malformed.`);
    const name = typeof rawIsland.name === 'string' && rawIsland.name ? rawIsland.name : `Island ${idx + 1}`;
    let region = Number(rawIsland.region);
    if (!regionById.has(region)) {
      warnings.push(`${name}: unknown region ${String(rawIsland.region)}, set to ${game.regions[0].name}.`);
      region = game.regions[0].id;
    }
    const bonusNeeds = Array.isArray(rawIsland.bonusNeeds)
      ? rawIsland.bonusNeeds.map(Number).filter((p) => productById.has(p))
      : [];
    return {
      id: typeof rawIsland.id === 'string' && rawIsland.id ? rawIsland.id : newId(),
      name,
      region,
      residents: counts(rawIsland.residents, (id) => levelById.has(id), 'population level', name),
      buildings: counts(rawIsland.buildings, (id) => factoryById.has(id), 'building', name),
      bonusNeeds,
      notes: typeof rawIsland.notes === 'string' ? rawIsland.notes : '',
    };
  });

  const s = isObject(input.settings) ? input.settings : {};
  return {
    state: {
      islands,
      settings: {
        applyUnlocks: s.applyUnlocks !== false,
        revenue: REVENUES.includes(s.revenue as Revenue) ? (s.revenue as Revenue) : 'medium',
      },
    },
    warnings,
  };
}

const STORAGE_KEY = `${APP_ID}:state`;

export function loadSaved(): PlannerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return parseExportFile(JSON.parse(raw)).state;
  } catch {
    // Corrupt or unavailable storage falls back to a fresh plan.
  }
  return initialState();
}

export function save(state: PlannerState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toExportFile(state)));
  } catch {
    // Storage can be full or blocked; the in-memory plan stays usable.
  }
}
