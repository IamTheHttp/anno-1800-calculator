import { useMemo, useState, type Dispatch } from 'react';
import {
  ceilWhole,
  empireShortGoods,
  housesFor,
  islandIncome,
  requiredBuildings,
  residentDemand,
  shortages,
  workforceBalance,
  type Analysis,
  type ProductBalance,
  type Shortage,
  type Utilization,
} from '../model/calc';
import {
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
import type { Action, Island, Settings } from '../model/state';
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
}

const SHORTAGE_TEXT: Record<Shortage, string> = {
  short: 'Short across the empire',
  import: 'Short here; another island has a surplus',
};

export function IslandView({
  island,
  settings,
  analysis,
  dispatch,
}: {
  island: Island;
  settings: Settings;
  analysis: Analysis;
  dispatch: Dispatch<Action>;
}) {
  const [tab, setTab] = usePref<Tab>('islandTab', 'setup');
  const empire = analysis.empire;
  const balance = useMemo(() => analysis.byIsland.get(island.id) ?? [], [analysis, island.id]);
  const plan = useMemo(() => requiredBuildings(island, settings), [island, settings]);
  const workforce = useMemo(() => workforceBalance(island), [island]);
  const income = useMemo(() => islandIncome(island, settings, empireShortGoods(empire)), [island, settings, empire]);

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
    };
  }, [balance, empire, plan, workforce, analysis.utilization]);

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
      <ShortageStrip balance={balance} shortage={marks.shortage} />
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
        </>
      )}
      {tab === 'plan' && (
        <>
          <p className="lede">
            Every building the residents' needs call for, through the full chain, against what is built here.
          </p>
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

/** Every good this island is short of, worst first. */
function ShortageStrip({ balance, shortage }: { balance: ProductBalance[]; shortage: Map<Id, Shortage> }) {
  if (shortage.size === 0) return null;
  const rows = balance.filter((b) => shortage.has(b.product)).sort((a, b) => a.net - b.net);
  return (
    <div className="shortage-strip" aria-label="Goods in deficit">
      <span className="strip-label">Missing</span>
      {rows.map((b) => {
        const s = shortage.get(b.product)!;
        const p = productById.get(b.product);
        return (
          <span key={b.product} className={`chip shortage-${s}`} title={`${SHORTAGE_TEXT[s]}: ${fmt(-b.net)} t/min`}>
            <Icon path={p?.icon ?? null} size={18} />
            {p?.name}
            <span className="chip-amount">{fmt(b.net)}</span>
          </span>
        );
      })}
    </div>
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
  const needsAttention = (f: Factory) =>
    marks.missing.has(f.id) || marks.shortage.has(f.outputs[0].product) || ((island.buildings[f.id] ?? 0) > 0 && f.inputs.some((i) => marks.shortage.has(i.product)));
  const factories = factoriesOfRegion(island.region).filter(
    (f) =>
      (filter !== 'built' || (island.buildings[f.id] ?? 0) > 0) &&
      (filter !== 'attention' || needsAttention(f)) &&
      (!q || f.name.toLowerCase().includes(q) || f.outputs.some((o) => productById.get(o.product)?.name.toLowerCase().includes(q))),
  );
  return (
    <section className="panel">
      <h3>
        Buildings <RegionBadge id={island.region} />
      </h3>
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

function BuildingRow({ f, count, marks, onChange }: { f: Factory; count: number; marks: Marks; onChange: (v: number) => void }) {
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
      <NumberInput ariaLabel={f.name} value={count} onChange={onChange} />
    </div>
  );
}
