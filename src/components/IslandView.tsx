import { useMemo, useState, type Dispatch } from 'react';
import {
  ceilWhole,
  empireShortGoods,
  housesFor,
  islandIncome,
  islandPlan,
  residentDemand,
  shortages,
  workforceBalance,
  type Analysis,
  type ProductBalance,
  type Shortage,
  type Utilization,
} from '../model/calc';
import {
  constructionFeeders,
  factoryById,
  FACTORY_GROUPS,
  factoriesOfRegion,
  factoryGroup,
  game,
  levelsOfRegion,
  outputRate,
  productById,
  workforceById,
  type Factory,
  type Id,
} from '../model/gameData';
import { newId, type Action, type Island, type Settings, type TradeRoute } from '../model/state';
import { bestSource } from '../model/suggest';
import { Icon, NumberInput, RegionBadge, Tabs } from './common';
import { fmt, fmtSigned } from './format';
import { usePref } from './usePref';
import { BalanceTable, IncomeTable, PlanTable, WorkforceTable } from './tables';

type Tab = 'setup' | 'balance' | 'plan' | 'workforce' | 'income';

/** What the Setup tab marks on residents and buildings. */
interface Marks {
  shortage: Map<Id, Shortage>;
  net: Map<Id, number>;
  /** Whole buildings the plan says to add, per factory. */
  missing: Map<Id, number>;
  /** Workers short, per population level. */
  workersShort: Map<Id, number>;
  utilization: Utilization;
  /** Buildings auto-build adds, per factory. */
  auto: Map<Id, number>;
  /** Plan requirement per factory (fractional). */
  required: Map<Id, number>;
}

const SHORTAGE_TEXT: Record<Shortage, string> = {
  short: 'Short across the empire',
  import: 'Short here; another island has a surplus',
};

export function IslandView({
  island,
  islands,
  routes,
  settings,
  analysis,
  dispatch,
  onOpenTrade,
}: {
  island: Island;
  islands: Island[];
  routes: TradeRoute[];
  settings: Settings;
  analysis: Analysis;
  dispatch: Dispatch<Action>;
  onOpenTrade: () => void;
}) {
  const [tab, setTab] = usePref<Tab>('islandTab', 'setup');
  const empire = analysis.empire;
  const balance = useMemo(() => analysis.byIsland.get(island.id) ?? [], [analysis, island.id]);
  const built = analysis.effective.get(island.id) ?? island;
  const plan = useMemo(() => islandPlan(analysis, island), [analysis, island]);
  const workforce = useMemo(() => workforceBalance(built), [built]);
  const income = useMemo(() => islandIncome(built, settings, empireShortGoods(empire)), [built, settings, empire]);

  const marks = useMemo<Marks>(() => {
    const workersShort = new Map<Id, number>();
    for (const w of workforce) {
      if (w.available < w.required) workersShort.set(workforceById.get(w.workforce)!.populationLevel, w.required - w.available);
    }
    return {
      shortage: shortages(balance, empire),
      net: new Map(balance.map((b) => [b.product, b.net])),
      missing: new Map(plan.filter((p) => p.missing > 0).map((p) => [p.factory.id, p.missing])),
      workersShort,
      utilization: analysis.utilization,
      auto: analysis.auto.get(island.id) ?? new Map(),
      required: analysis.plan.byIsland.get(island.id) ?? new Map(),
    };
  }, [balance, empire, plan, workforce, analysis, island.id]);

  const deficits = marks.shortage.size;
  const toBuild = plan.filter((p) => p.missing > 0).reduce((s, p) => s + p.missing, 0);
  const residents = Object.values(island.residents).reduce((s, n) => s + n, 0);

  return (
    <section className="view">
      <IslandHeader island={island} dispatch={dispatch} />
      <div className="stats">
        <Stat label="Residents" value={fmt(residents, 0)} onClick={() => setTab('setup')} />
        <Stat label="Goods in deficit" value={String(deficits)} tone={deficits ? 'neg' : 'pos'} onClick={() => setTab('balance')} />
        <Stat label="Buildings to add" value={String(toBuild)} tone={toBuild ? 'neg' : 'pos'} onClick={() => setTab('plan')} />
        <Stat
          label="Workforce short"
          value={String(marks.workersShort.size)}
          tone={marks.workersShort.size ? 'neg' : 'pos'}
          onClick={() => setTab('workforce')}
        />
        <Stat label="Coins / min" value={fmtSigned(income.net, 0)} tone={income.net < 0 ? 'neg' : 'pos'} onClick={() => setTab('income')} />
      </div>
      <ShortageStrip
        balance={balance}
        shortage={marks.shortage}
        sourceFor={(product) => bestSource(analysis, islands, island.id, product)?.island ?? null}
        onRoute={(from, product) =>
          dispatch({ type: 'addRoute', route: { id: newId(), from: from.id, to: island.id, product, amount: null } })
        }
      />
      <Tabs<Tab>
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'setup', label: 'Setup' },
          { id: 'balance', label: <CountLabel text="Balance" n={deficits} /> },
          { id: 'plan', label: <CountLabel text="Needs plan" n={toBuild} /> },
          { id: 'workforce', label: <CountLabel text="Workforce" n={marks.workersShort.size} /> },
          { id: 'income', label: 'Income' },
        ]}
      />
      {tab === 'setup' && <Setup island={island} settings={settings} marks={marks} dispatch={dispatch} />}
      {tab === 'balance' && (
        <>
          <p className="lede">What this island's buildings make, against what its residents and factories use.</p>
          <BalanceTable rows={balance} region={island.region} shortage={marks.shortage} />
          <IslandRoutes island={island} islands={islands} routes={routes} analysis={analysis} onOpenTrade={onOpenTrade} />
        </>
      )}
      {tab === 'plan' && (
        <>
          <p className="lede">
            Every building the residents' needs call for, through the full chain, against what is built here.
          </p>
          {island.autoBuild ? (
            <p className="hint">Auto-build is on: this island’s own buildings follow this plan. Other-region rows need a route.</p>
          ) : (
          <div className="toolbar">
            <button
              type="button"
              disabled={plan.length === 0}
              onClick={() => {
                if (!confirm('Set this island’s building counts to the plan’s rounded-up requirement? Buildings from the other region are skipped.')) return;
                for (const p of plan.filter((x) => x.factory.region === island.region)) dispatch({ type: 'setBuildings', id: island.id, factory: p.factory.id, value: ceilWhole(p.required) });
              }}
            >
              Fill buildings from plan
            </button>
          </div>
          )}
          <PlanTable rows={plan} region={island.region} />
        </>
      )}
      {tab === 'workforce' && (
        <>
          <p className="lede">Workers the buildings need against residents of each tier. Each resident is one worker.</p>
          <WorkforceTable rows={workforce} />
        </>
      )}
      {tab === 'income' && (
        <>
          <p className="lede">
            Coins per minute with every unlocked need met, after royal taxes. “At risk” is the tax tied to goods the whole empire is short of.
          </p>
          <IncomeTable income={income} />
        </>
      )}
    </section>
  );
}

function CountLabel({ text, n }: { text: string; n: number }) {
  return (
    <>
      {text}
      {n > 0 && <span className="count-badge">{n}</span>}
    </>
  );
}

function Stat({ label, value, tone, onClick }: { label: string; value: string; tone?: 'neg' | 'pos'; onClick?: () => void }) {
  return (
    <button type="button" className={`stat ${tone ?? ''}`} onClick={onClick}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </button>
  );
}

/** Every good this island is short of, worst first. Amber chips add a route from the best source. */
function ShortageStrip({
  balance,
  shortage,
  sourceFor,
  onRoute,
}: {
  balance: ProductBalance[];
  shortage: Map<Id, Shortage>;
  sourceFor: (product: Id) => Island | null;
  onRoute: (from: Island, product: Id) => void;
}) {
  if (shortage.size === 0) return null;
  const rows = balance.filter((b) => shortage.has(b.product)).sort((a, b) => a.net - b.net);
  return (
    <div className="shortage-strip" aria-label="Goods in deficit">
      <span className="strip-label">Missing</span>
      {rows.map((b) => {
        const s = shortage.get(b.product)!;
        const p = productById.get(b.product);
        const content = (
          <>
            <Icon path={p?.icon ?? null} size={18} />
            {p?.name}
            <span className="chip-amount">{fmt(b.net)}</span>
          </>
        );
        const src = s === 'import' ? sourceFor(b.product) : null;
        if (src) {
          return (
            <button
              key={b.product}
              type="button"
              className={`chip shortage-${s} chip-action`}
              title={`${SHORTAGE_TEXT[s]}: ${fmt(-b.net)} t/min. Click to add an auto route from ${src.name}.`}
              onClick={() => onRoute(src, b.product)}
            >
              {content}
              <span className="chip-hint">+ route from {src.name}</span>
            </button>
          );
        }
        return (
          <span key={b.product} className={`chip shortage-${s}`} title={`${SHORTAGE_TEXT[s]}: ${fmt(-b.net)} t/min`}>
            {content}
          </span>
        );
      })}
    </div>
  );
}

function IslandRoutes({
  island,
  islands,
  routes,
  analysis,
  onOpenTrade,
}: {
  island: Island;
  islands: Island[];
  routes: TradeRoute[];
  analysis: Analysis;
  onOpenTrade: () => void;
}) {
  const mine = routes.filter((r) => r.from === island.id || r.to === island.id);
  const names = new Map(islands.map((i) => [i.id, i.name]));
  const flows = new Map(analysis.flows.map((f) => [f.route.id, f]));
  return (
    <section className="panel">
      <h3>Trade routes</h3>
      {mine.length === 0 ? (
        <p className="hint">This island has no routes. Click an amber “Missing” chip, or use the Trade routes page.</p>
      ) : (
        <ul className="route-list">
          {mine.map((r) => {
            const incoming = r.to === island.id;
            const f = flows.get(r.id);
            return (
              <li key={r.id}>
                <span className={`badge ${incoming ? 'pos' : 'warn'}`}>{incoming ? 'In' : 'Out'}</span>
                <span className="label">
                  <Icon path={productById.get(r.product)?.icon ?? null} size={18} />
                  {productById.get(r.product)?.name}
                </span>
                <span className="muted">
                  {incoming ? `from ${names.get(r.from)}` : `to ${names.get(r.to)}`} · {fmt(f?.actual ?? 0)} t/min
                  {r.amount === null ? ' (auto)' : ''}
                </span>
                {f?.sourceShort && <span className="flag flag-short">source lacks surplus</span>}
              </li>
            );
          })}
        </ul>
      )}
      <div>
        <button type="button" onClick={onOpenTrade}>
          Manage routes
        </button>
      </div>
    </section>
  );
}

function IslandHeader({ island, dispatch }: { island: Island; dispatch: Dispatch<Action> }) {
  const update = (patch: Partial<Island>) => dispatch({ type: 'updateIsland', id: island.id, patch });
  return (
    <div className="island-header">
      <input
        className="island-name"
        aria-label="Island name"
        value={island.name}
        onChange={(e) => update({ name: e.target.value })}
      />
      <select
        aria-label="Region"
        value={island.region}
        onChange={(e) => {
          const region = Number(e.target.value);
          const hasData = Object.keys(island.residents).length + Object.keys(island.buildings).length > 0;
          if (hasData && !confirm('Changing the region clears this island’s residents and buildings. Continue?')) return;
          update({ region, residents: {}, buildings: {}, bonusNeeds: [] });
        }}
      >
        {game.regions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="danger"
        onClick={() => confirm(`Delete “${island.name}”?`) && dispatch({ type: 'removeIsland', id: island.id })}
      >
        Delete island
      </button>
    </div>
  );
}

function Setup({
  island,
  settings,
  marks,
  dispatch,
}: {
  island: Island;
  settings: Settings;
  marks: Marks;
  dispatch: Dispatch<Action>;
}) {
  return (
    <div className="setup">
      <Residents island={island} settings={settings} marks={marks} dispatch={dispatch} />
      <Targets island={island} marks={marks} dispatch={dispatch} />
      <Buildings island={island} marks={marks} dispatch={dispatch} />
      <section className="panel">
        <h3>Notes</h3>
        <textarea
          aria-label="Notes"
          rows={3}
          placeholder="Fertility, mines, plans…"
          value={island.notes}
          onChange={(e) => dispatch({ type: 'updateIsland', id: island.id, patch: { notes: e.target.value } })}
        />
      </section>
    </div>
  );
}

function Residents({
  island,
  settings,
  marks,
  dispatch,
}: {
  island: Island;
  settings: Settings;
  marks: Marks;
  dispatch: Dispatch<Action>;
}) {
  const levels = levelsOfRegion(island.region);
  const demand = residentDemand(island, settings);
  return (
    <section className="panel">
      <h3>Residents</h3>
      <p className="hint">
        Enter residents, or houses at full capacity (all needs met). Red needs are short across the empire; amber ones
        are short here but another island has a surplus.
      </p>
      <div className="residents">
        {levels.map((l) => {
          const residents = island.residents[l.id] ?? 0;
          const set = (value: number) => dispatch({ type: 'setResidents', id: island.id, level: l.id, value });
          const bonus = l.needs.filter((n) => n.bonus && n.tpmin !== null);
          const goods = l.needs.filter((n) => !n.bonus && n.tpmin !== null);
          const workersShort = marks.workersShort.get(l.id);
          return (
            <div className="resident-row" key={l.id}>
              <div className="resident-main">
                <span className="label strong">
                  <Icon path={l.icon} size={28} />
                  {l.name}
                </span>
                <label>
                  Houses
                  <NumberInput ariaLabel={`${l.name} houses`} value={housesFor(l, residents)} onChange={(h) => set(h * l.fullHouse)} />
                </label>
                <label>
                  Residents
                  <NumberInput ariaLabel={`${l.name} residents`} step={l.fullHouse} value={residents} onChange={set} />
                </label>
                {workersShort !== undefined && (
                  <span className="flag flag-short" title="Buildings on this island need more workers of this tier">
                    {fmt(workersShort, 0)} workers short
                  </span>
                )}
              </div>
              {residents > 0 && (
                <div className="need-chips">
                  {goods.map((n) => {
                    const locked = settings.applyUnlocks && n.unlockAt !== null && residents < n.unlockAt;
                    const s = locked ? undefined : marks.shortage.get(n.product);
                    const title = locked
                      ? `Unlocks at ${n.unlockAt} ${l.name}`
                      : `${fmt(demand.get(n.product) ?? 0)} t/min on this island` +
                        (s ? ` — ${SHORTAGE_TEXT[s]} (${fmt(marks.net.get(n.product) ?? 0)} t/min)` : '');
                    return (
                      <span key={n.product} className={`chip ${locked ? 'locked' : ''} ${s ? `shortage-${s}` : ''}`} title={title}>
                        <Icon path={productById.get(n.product)?.icon ?? null} size={18} />
                        {productById.get(n.product)?.name}
                        {locked && <span className="muted"> @{n.unlockAt}</span>}
                      </span>
                    );
                  })}
                  {bonus.map((n) => {
                    const on = island.bonusNeeds.includes(n.product);
                    const s = on ? marks.shortage.get(n.product) : undefined;
                    return (
                      <label
                        key={n.product}
                        className={`chip bonus ${s ? `shortage-${s}` : ''}`}
                        title={'Bonus need — counted only when ticked' + (s ? ` — ${SHORTAGE_TEXT[s]}` : '')}
                      >
                        <input type="checkbox" checked={on} onChange={() => dispatch({ type: 'toggleBonusNeed', id: island.id, product: n.product })} />
                        <Icon path={productById.get(n.product)?.icon ?? null} size={18} />
                        {productById.get(n.product)?.name}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Buildings({ island, marks, dispatch }: { island: Island; marks: Marks; dispatch: Dispatch<Action> }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = usePref<'all' | 'built' | 'attention'>('buildingFilter', 'all');
  const q = query.trim().toLowerCase();
  const total = (f: Factory) => (island.buildings[f.id] ?? 0) + (marks.auto.get(f.id) ?? 0);
  const needsAttention = (f: Factory) =>
    marks.missing.has(f.id) || marks.shortage.has(f.outputs[0].product) || (total(f) > 0 && f.inputs.some((i) => marks.shortage.has(i.product)));
  const factories = factoriesOfRegion(island.region).filter(
    (f) =>
      (filter !== 'built' || total(f) > 0) &&
      (filter !== 'attention' || needsAttention(f)) &&
      (!q || f.name.toLowerCase().includes(q) || f.outputs.some((o) => productById.get(o.product)?.name.toLowerCase().includes(q))),
  );
  return (
    <section className="panel">
      <h3>
        Buildings <RegionBadge id={island.region} />
      </h3>
      <AutoBuildToggle island={island} marks={marks} dispatch={dispatch} />
      <div className="toolbar">
        <input type="search" placeholder="Search buildings or goods" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Show buildings" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">All buildings</option>
          <option value="built">Built only</option>
          <option value="attention">Needs attention</option>
        </select>
      </div>
      {factories.length === 0 && filter === 'attention' && <p className="hint">Nothing needs attention.</p>}
      {FACTORY_GROUPS.map((g) => {
        const list = factories.filter((f) => factoryGroup(f) === g).sort((a, b) => a.name.localeCompare(b.name));
        if (list.length === 0) return null;
        return (
          <div key={g} className="building-group">
            <h4>{g}</h4>
            <div className="buildings">
              {list.map((f) => (
                <BuildingRow
                  key={f.id}
                  f={f}
                  count={island.buildings[f.id] ?? 0}
                  auto={marks.auto.get(f.id) ?? 0}
                  autoMode={island.autoBuild}
                  marks={marks}
                  onChange={(value) => dispatch({ type: 'setBuildings', id: island.id, factory: f.id, value })}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function BuildingRow({
  f,
  count: manual,
  auto,
  autoMode,
  marks,
  onChange,
}: {
  f: Factory;
  count: number;
  auto: number;
  autoMode: boolean;
  marks: Marks;
  onChange: (v: number) => void;
}) {
  const count = manual + auto;
  const out = f.outputs[0];
  const missing = marks.missing.get(f.id);
  const outShort = marks.shortage.get(out.product);
  const shortInputs = count > 0 ? f.inputs.filter((i) => marks.shortage.has(i.product)) : [];
  const run = marks.utilization.get(out.product) ?? 0;
  const idle = count > 0 && run < 0.995;
  const tone = missing || outShort === 'short' ? 'short' : outShort === 'import' || shortInputs.length ? 'import' : '';
  return (
    <div className={`building-row ${count > 0 ? 'built' : ''} ${tone ? `attention-${tone}` : ''}`}>
      <Icon path={f.icon} size={30} title={f.name} />
      <div className="building-info">
        <span className="building-name">{f.name}</span>
        <span className="muted small">
          {fmt(outputRate(f))} t/min {productById.get(out.product)?.name}
          {f.inputs.length > 0 && (
            <>
              {' ← '}
              {f.inputs.map((i) => productById.get(i.product)?.name).join(' + ')}
            </>
          )}
        </span>
        {(missing || outShort || shortInputs.length > 0 || idle) && (
          <span className="flags">
            {missing !== undefined && (
              <span className="flag flag-short" title="Residents' needs call for more of this building">
                +{missing} needed
              </span>
            )}
            {outShort && (
              <span className={`flag flag-${outShort}`} title={SHORTAGE_TEXT[outShort]}>
                {productById.get(out.product)?.name} {fmt(marks.net.get(out.product) ?? 0)} t/min
              </span>
            )}
            {idle && (
              <span className="flag flag-idle" title="Demand across the empire keeps these buildings below full capacity">
                Runs at {fmt(run * 100, 0)}%
              </span>
            )}
            {shortInputs.length > 0 && (
              <span className="flag flag-import" title="This building lacks input on this island">
                Input short: {shortInputs.map((i) => productById.get(i.product)?.name).join(', ')}
              </span>
            )}
          </span>
        )}
      </div>
      {autoMode ? (
        <span className="auto-count">
          {auto > 0 && (
            <span className="flag flag-auto" title="Built by auto-build for residents and targets">
              Auto {auto}
            </span>
          )}
          <label className="extra-label" title="Manual buildings on top of auto-build">
            + extra
            <NumberInput ariaLabel={`${f.name} extra`} value={manual} onChange={onChange} />
          </label>
        </span>
      ) : (
        <NumberInput ariaLabel={f.name} value={manual} onChange={onChange} />
      )}
    </div>
  );
}

function AutoBuildToggle({ island, marks, dispatch }: { island: Island; marks: Marks; dispatch: Dispatch<Action> }) {
  return (
    <div className={`auto-toggle ${island.autoBuild ? 'on' : ''}`}>
      <label className="check">
        <input
          type="checkbox"
          checked={island.autoBuild}
          onChange={(e) => {
            if (!e.target.checked) {
              dispatch({ type: 'setAutoBuild', id: island.id, on: false });
              return;
            }
            // Manual counts for consumer-only chains would double up with auto-build.
            const overlap = Object.entries(island.buildings)
              .map(([fid, n]) => ({ f: factoryById.get(Number(fid))!, n }))
              .filter(({ f, n }) => f && n > 0 && marks.required.has(f.id) && !constructionFeeders.has(f.outputs[0].product) && !(f.outputs[0].product in island.targets));
            let clear: Id[] = [];
            if (
              overlap.length > 0 &&
              confirm(
                `Auto-build now covers these buildings:\n\n${overlap.map(({ f, n }) => `${n}× ${f.name}`).join('\n')}\n\n` +
                  'Clear their manual counts so they are not doubled? (Bricks, timber, weapons and other construction chains keep their counts either way.)',
              )
            )
              clear = overlap.map(({ f }) => f.id);
            dispatch({ type: 'setAutoBuild', id: island.id, on: true, clear });
          }}
        />
        <strong>Auto-build</strong>
      </label>
      <span className="hint">
        {island.autoBuild
          ? 'Buildings for residents’ needs and targets are placed automatically; counts you enter are extras on top.'
          : 'Place the buildings residents and targets need automatically, through the full chain.'}
      </span>
    </div>
  );
}

const targetGoods = (region: Id) =>
  game.products
    .filter((p) => factoriesOfRegion(region).some((f) => f.outputs[0].product === p.id))
    .sort((a, b) => Number(constructionFeeders.has(b.id)) - Number(constructionFeeders.has(a.id)) || a.name.localeCompare(b.name));

function Targets({ island, marks, dispatch }: { island: Island; marks: Marks; dispatch: Dispatch<Action> }) {
  const goods = useMemo(() => targetGoods(island.region), [island.region]);
  const unused = goods.filter((g) => !(g.id in island.targets));
  const [pick, setPick] = useState<Id | ''>('');
  const entries = Object.entries(island.targets).map(([p, v]) => [Number(p), v] as const);
  const set = (product: Id, value: number) => dispatch({ type: 'setTarget', id: island.id, product, value });
  return (
    <section className="panel">
      <h3>Targets</h3>
      <p className="hint">
        Spare output to keep on this island, e.g. 2 t/min of bricks. Targets count as demand in the balance and the needs plan
        {island.autoBuild ? ', and auto-build places their chains.' : '.'}
      </p>
      {entries.length > 0 && (
        <ul className="target-list">
          {entries.map(([product, value]) => {
            const net = marks.net.get(product) ?? -value;
            return (
              <li key={product}>
                <span className="label">
                  <Icon path={productById.get(product)?.icon ?? null} size={20} />
                  {productById.get(product)?.name}
                </span>
                <NumberInput ariaLabel={`${productById.get(product)?.name} target`} step={0.5} value={value} onChange={(v) => set(product, v)} />
                <span className="muted small">t/min</span>
                <span className={`flag ${net < -1e-4 ? 'flag-short' : 'flag-ok'}`}>{net < -1e-4 ? `${fmt(net)} short` : 'met'}</span>
                <button type="button" className="danger" onClick={() => set(product, 0)}>
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="toolbar">
        <select aria-label="Good" value={pick} onChange={(e) => setPick(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Add a target…</option>
          {unused.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pick === ''}
          onClick={() => {
            if (pick === '') return;
            set(pick, 1);
            setPick('');
          }}
        >
          Add 1 t/min
        </button>
      </div>
    </section>
  );
}
