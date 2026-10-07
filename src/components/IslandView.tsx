import { useMemo, useState, type Dispatch } from 'react';
import { ceilWhole, housesFor, islandBalance, requiredBuildings, residentDemand, workforceBalance } from '../model/calc';
import {
  FACTORY_GROUPS,
  factoriesOfRegion,
  factoryGroup,
  game,
  levelsOfRegion,
  outputRate,
  productById,
  type Factory,
} from '../model/gameData';
import type { Action, Island, Settings } from '../model/state';
import { Icon, NumberInput, RegionBadge, Tabs } from './common';
import { fmt } from './format';
import { usePref } from './usePref';
import { BalanceTable, PlanTable, WorkforceTable } from './tables';

type Tab = 'setup' | 'balance' | 'plan' | 'workforce';

export function IslandView({
  island,
  settings,
  dispatch,
}: {
  island: Island;
  settings: Settings;
  dispatch: Dispatch<Action>;
}) {
  const [tab, setTab] = usePref<Tab>('islandTab', 'setup');
  const balance = useMemo(() => islandBalance(island, settings), [island, settings]);
  const plan = useMemo(() => requiredBuildings(island, settings), [island, settings]);
  const workforce = useMemo(() => workforceBalance(island), [island]);

  const deficits = balance.filter((b) => b.net < -1e-4).length;
  const toBuild = plan.filter((p) => p.missing > 0).reduce((s, p) => s + p.missing, 0);
  const shortWorkers = workforce.filter((w) => w.available < w.required).length;
  const residents = Object.values(island.residents).reduce((s, n) => s + n, 0);

  return (
    <section className="view">
      <IslandHeader island={island} dispatch={dispatch} />
      <div className="stats">
        <Stat label="Residents" value={fmt(residents, 0)} />
        <Stat label="Buildings" value={fmt(Object.values(island.buildings).reduce((s, n) => s + n, 0), 0)} />
        <Stat label="Goods in deficit" value={String(deficits)} tone={deficits ? 'neg' : 'pos'} />
        <Stat label="Buildings to add" value={String(toBuild)} tone={toBuild ? 'neg' : 'pos'} />
        <Stat label="Workforce short" value={String(shortWorkers)} tone={shortWorkers ? 'neg' : 'pos'} />
      </div>
      <Tabs<Tab>
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'setup', label: 'Setup' },
          { id: 'balance', label: 'Balance' },
          { id: 'plan', label: 'Needs plan' },
          { id: 'workforce', label: 'Workforce' },
        ]}
      />
      {tab === 'setup' && <Setup island={island} settings={settings} dispatch={dispatch} />}
      {tab === 'balance' && (
        <>
          <p className="lede">What this island's buildings make, against what its residents and factories use.</p>
          <BalanceTable rows={balance} region={island.region} />
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
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'neg' | 'pos' }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
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

function Setup({ island, settings, dispatch }: { island: Island; settings: Settings; dispatch: Dispatch<Action> }) {
  return (
    <div className="setup">
      <Residents island={island} settings={settings} dispatch={dispatch} />
      <Buildings island={island} dispatch={dispatch} />
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

function Residents({ island, settings, dispatch }: { island: Island; settings: Settings; dispatch: Dispatch<Action> }) {
  const levels = levelsOfRegion(island.region);
  const demand = residentDemand(island, settings);
  return (
    <section className="panel">
      <h3>Residents</h3>
      <p className="hint">Enter residents, or houses at full capacity (all needs met).</p>
      <div className="residents">
        {levels.map((l) => {
          const residents = island.residents[l.id] ?? 0;
          const set = (value: number) => dispatch({ type: 'setResidents', id: island.id, level: l.id, value });
          const bonus = l.needs.filter((n) => n.bonus && n.tpmin !== null);
          const goods = l.needs.filter((n) => !n.bonus && n.tpmin !== null);
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
              </div>
              {residents > 0 && (
                <div className="need-chips">
                  {goods.map((n) => {
                    const locked = settings.applyUnlocks && n.unlockAt !== null && residents < n.unlockAt;
                    return (
                      <span
                        key={n.product}
                        className={`chip ${locked ? 'locked' : ''}`}
                        title={locked ? `Unlocks at ${n.unlockAt} ${l.name}` : `${fmt(demand.get(n.product) ?? 0)} t/min on this island`}
                      >
                        <Icon path={productById.get(n.product)?.icon ?? null} size={18} />
                        {productById.get(n.product)?.name}
                        {locked && <span className="muted"> @{n.unlockAt}</span>}
                      </span>
                    );
                  })}
                  {bonus.map((n) => (
                    <label key={n.product} className="chip bonus" title="Bonus need — counted only when ticked">
                      <input
                        type="checkbox"
                        checked={island.bonusNeeds.includes(n.product)}
                        onChange={() => dispatch({ type: 'toggleBonusNeed', id: island.id, product: n.product })}
                      />
                      <Icon path={productById.get(n.product)?.icon ?? null} size={18} />
                      {productById.get(n.product)?.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Buildings({ island, dispatch }: { island: Island; dispatch: Dispatch<Action> }) {
  const [query, setQuery] = useState('');
  const [builtOnly, setBuiltOnly] = usePref('builtOnly', false);
  const q = query.trim().toLowerCase();
  const factories = factoriesOfRegion(island.region).filter(
    (f) =>
      (!builtOnly || (island.buildings[f.id] ?? 0) > 0) &&
      (!q || f.name.toLowerCase().includes(q) || f.outputs.some((o) => productById.get(o.product)?.name.toLowerCase().includes(q))),
  );
  return (
    <section className="panel">
      <h3>
        Buildings <RegionBadge id={island.region} />
      </h3>
      <div className="toolbar">
        <input type="search" placeholder="Search buildings or goods" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={builtOnly} onChange={(e) => setBuiltOnly(e.target.checked)} />
          Built only
        </label>
      </div>
      {FACTORY_GROUPS.map((g) => {
        const list = factories.filter((f) => factoryGroup(f) === g).sort((a, b) => a.name.localeCompare(b.name));
        if (list.length === 0) return null;
        return (
          <div key={g} className="building-group">
            <h4>{g}</h4>
            <div className="buildings">
              {list.map((f) => (
                <BuildingRow key={f.id} f={f} count={island.buildings[f.id] ?? 0} onChange={(value) => dispatch({ type: 'setBuildings', id: island.id, factory: f.id, value })} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function BuildingRow({ f, count, onChange }: { f: Factory; count: number; onChange: (v: number) => void }) {
  const out = f.outputs[0];
  return (
    <div className={`building-row ${count > 0 ? 'built' : ''}`}>
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
      </div>
      <NumberInput ariaLabel={f.name} value={count} onChange={onChange} />
    </div>
  );
}
