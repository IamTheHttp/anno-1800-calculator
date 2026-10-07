import { useMemo } from 'react';
import {
  empirePlan,
  empireShortGoods,
  islandIncome,
  shortages,
  workforceBalance,
  type Analysis,
  type Income,
} from '../model/calc';
import { game, levelById } from '../model/gameData';
import type { Island, Settings } from '../model/state';
import { Empty, Icon, RegionBadge, Tabs } from './common';
import { fmt, fmtSigned, signClass } from './format';
import { usePref } from './usePref';
import { BalanceTable, PlanTable } from './tables';

type Tab = 'next' | 'balance' | 'plan' | 'income';

export function EmpireView({
  islands,
  settings,
  analysis,
  onOpenIsland,
}: {
  islands: Island[];
  settings: Settings;
  analysis: Analysis;
  onOpenIsland: (id: string) => void;
}) {
  const balance = analysis.empire;
  const [tab, setTab] = usePref<Tab>('empireTab', 'next');
  const short = useMemo(() => empireShortGoods(balance), [balance]);
  const incomes = useMemo(
    () => islands.map((i) => islandIncome(analysis.effective.get(i.id) ?? i, settings, short)),
    [islands, settings, short, analysis.effective],
  );
  const plan = useMemo(() => empirePlan(analysis), [analysis]);

  return (
    <section className="view">
      <h2>Empire</h2>
      <p className="lede">
        All islands together, as if every surplus could reach every deficit. Island-level shortages and routes are on each island and the Trade routes page.
      </p>
      <IslandSummary islands={islands} analysis={analysis} incomes={incomes} onOpenIsland={onOpenIsland} />
      <Tabs<Tab>
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'next', label: 'What to build next' },
          { id: 'balance', label: 'Balance' },
          { id: 'plan', label: 'Needs plan' },
          { id: 'income', label: 'Income' },
        ]}
      />
      {tab === 'next' && <PlanTable rows={plan} onlyMissing />}
      {tab === 'balance' && <BalanceTable rows={balance} region={game.regions[0].id} />}
      {tab === 'plan' && <PlanTable rows={plan} />}
      {tab === 'income' && <EmpireIncome islands={islands} incomes={incomes} onOpenIsland={onOpenIsland} />}
    </section>
  );
}

function IslandSummary({
  islands,
  analysis,
  incomes,
  onOpenIsland,
}: {
  islands: Island[];
  analysis: Analysis;
  incomes: Income[];
  onOpenIsland: (id: string) => void;
}) {
  if (islands.length === 0) return <Empty>No islands yet.</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Island</th>
            <th>Population</th>
            <th className="num">Buildings</th>
            <th className="num" title="Short across the empire">Short</th>
            <th className="num" title="Short here; another island has a surplus">Import</th>
            <th className="num">Workforce short</th>
            <th className="num">Coins / min</th>
          </tr>
        </thead>
        <tbody>
          {islands.map((i, idx) => {
            const s = [...shortages(analysis.byIsland.get(i.id) ?? [], analysis.empire).values()];
            const shortCount = s.filter((x) => x === 'short').length;
            const importCount = s.length - shortCount;
            const net = incomes[idx].net;
            const short = workforceBalance(analysis.effective.get(i.id) ?? i).filter((w) => w.available < w.required).length;
            return (
              <tr key={i.id} className="clickable" onClick={() => onOpenIsland(i.id)}>
                <td>
                  <span className="label strong">
                    {i.name} <RegionBadge id={i.region} />
                  </span>
                </td>
                <td>
                  <span className="pop-list">
                    {Object.entries(i.residents).map(([lid, n]) => {
                      const l = levelById.get(Number(lid));
                      return (
                        <span key={lid} className="label" title={l?.name}>
                          <Icon path={l?.icon ?? null} size={18} />
                          {fmt(n, 0)}
                        </span>
                      );
                    })}
                  </span>
                </td>
                <td className="num">{Object.values(i.buildings).reduce((s, n) => s + n, 0)}</td>
                <td className={`num ${shortCount ? 'neg' : 'zero'}`}>{shortCount}</td>
                <td className={`num ${importCount ? 'warn' : 'zero'}`}>{importCount}</td>
                <td className={`num ${short ? 'neg' : 'zero'}`}>{short}</td>
                <td className={`num ${signClass(net)}`}>{fmtSigned(net, 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmpireIncome({
  islands,
  incomes,
  onOpenIsland,
}: {
  islands: Island[];
  incomes: Income[];
  onOpenIsland: (id: string) => void;
}) {
  if (islands.length === 0) return <Empty>No islands yet.</Empty>;
  const sum = (k: 'taxes' | 'royalTaxes' | 'maintenance' | 'atRisk' | 'net') => incomes.reduce((s, i) => s + i[k], 0);
  return (
    <>
      <p className="lede">
        Coins per minute with every unlocked need met, including the Revenue difficulty multiplier and royal taxes. Public buildings, warehouses and
        ships are not counted.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Island</th>
              <th className="num">Taxes</th>
              <th className="num" title="Crown's share of each tier's taxes on the island">Royal taxes</th>
              <th className="num">Upkeep</th>
              <th className="num">Balance</th>
              <th className="num" title="Tax tied to goods the empire is short of">At risk</th>
            </tr>
          </thead>
          <tbody>
            {islands.map((i, idx) => {
              const inc = incomes[idx];
              return (
                <tr key={i.id} className="clickable" onClick={() => onOpenIsland(i.id)}>
                  <td>
                    <span className="label strong">
                      {i.name} <RegionBadge id={i.region} />
                    </span>
                  </td>
                  <td className="num">{fmt(inc.taxes, 0)}</td>
                  <td className="num">{fmt(inc.royalTaxes, 0)}</td>
                  <td className="num">{fmt(inc.maintenance, 0)}</td>
                  <td className={`num strong ${signClass(inc.net)}`}>{fmtSigned(inc.net, 0)}</td>
                  <td className={`num ${inc.atRisk > 0 ? 'neg' : 'zero'}`}>{inc.atRisk > 0 ? `−${fmt(inc.atRisk, 0)}` : '—'}</td>
                </tr>
              );
            })}
            <tr className="total">
              <td>Empire</td>
              <td className="num">{fmt(sum('taxes'), 0)}</td>
              <td className="num">{fmt(sum('royalTaxes'), 0)}</td>
              <td className="num">{fmt(sum('maintenance'), 0)}</td>
              <td className={`num strong ${signClass(sum('net'))}`}>{fmtSigned(sum('net'), 0)}</td>
              <td className={`num ${sum('atRisk') > 0 ? 'neg' : 'zero'}`}>{sum('atRisk') > 0 ? `−${fmt(sum('atRisk'), 0)}` : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
