import { useMemo } from 'react';
import { empireBalance, empireRequiredBuildings, islandBalance, workforceBalance } from '../model/calc';
import { game, levelById } from '../model/gameData';
import type { Island, Settings } from '../model/state';
import { Empty, Icon, RegionBadge, Tabs } from './common';
import { fmt } from './format';
import { usePref } from './usePref';
import { BalanceTable, PlanTable } from './tables';

type Tab = 'next' | 'balance' | 'plan';

export function EmpireView({
  islands,
  settings,
  onOpenIsland,
}: {
  islands: Island[];
  settings: Settings;
  onOpenIsland: (id: string) => void;
}) {
  const [tab, setTab] = usePref<Tab>('empireTab', 'next');
  const balance = useMemo(() => empireBalance(islands, settings), [islands, settings]);
  const plan = useMemo(() => empireRequiredBuildings(islands, settings), [islands, settings]);

  return (
    <section className="view">
      <h2>Empire</h2>
      <p className="lede">
        All islands together, as if every surplus could reach every deficit. Trade routes are not modelled yet.
      </p>
      <IslandSummary islands={islands} settings={settings} onOpenIsland={onOpenIsland} />
      <Tabs<Tab>
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'next', label: 'What to build next' },
          { id: 'balance', label: 'Balance' },
          { id: 'plan', label: 'Needs plan' },
        ]}
      />
      {tab === 'next' && <PlanTable rows={plan} onlyMissing />}
      {tab === 'balance' && <BalanceTable rows={balance} region={game.regions[0].id} />}
      {tab === 'plan' && <PlanTable rows={plan} />}
    </section>
  );
}

function IslandSummary({
  islands,
  settings,
  onOpenIsland,
}: {
  islands: Island[];
  settings: Settings;
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
            <th className="num">Deficits</th>
            <th className="num">Workforce short</th>
          </tr>
        </thead>
        <tbody>
          {islands.map((i) => {
            const deficits = islandBalance(i, settings).filter((b) => b.net < -1e-4).length;
            const short = workforceBalance(i).filter((w) => w.available < w.required).length;
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
                <td className={`num ${deficits ? 'neg' : 'pos'}`}>{deficits}</td>
                <td className={`num ${short ? 'neg' : 'pos'}`}>{short}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
