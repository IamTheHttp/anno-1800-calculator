import { useMemo, useState, type Dispatch } from 'react';
import type { Analysis } from '../model/calc';
import { game, producersOf, type Id } from '../model/gameData';
import { newId, type Action, type Island, type TradeRoute } from '../model/state';
import { suggestRoutes } from '../model/suggest';
import { Empty, NumberInput, ProductLabel, RegionBadge } from './common';
import { fmt } from './format';

const tradeGoods = game.products.filter((p) => producersOf.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));

export function TradeView({
  islands,
  routes,
  analysis,
  dispatch,
  onOpenIsland,
}: {
  islands: Island[];
  routes: TradeRoute[];
  analysis: Analysis;
  dispatch: Dispatch<Action>;
  onOpenIsland: (id: string) => void;
}) {
  const byId = new Map(islands.map((i) => [i.id, i]));
  const flows = new Map(analysis.flows.map((f) => [f.route.id, f]));
  const suggestions = useMemo(() => suggestRoutes(analysis, islands), [analysis, islands]);

  return (
    <section className="view">
      <h2>Trade routes</h2>
      <p className="lede">
        Ship goods from one island to another. <strong>Auto</strong> sends what the destination lacks, up to the source’s surplus;
        a fixed amount always ships. Ship capacity and travel time are not modelled.
      </p>

      {islands.length < 2 ? (
        <Empty>Add a second island to create routes.</Empty>
      ) : (
        <>
          <AddRoute islands={islands} dispatch={dispatch} />
          {routes.length === 0 ? (
            <Empty>No routes yet.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>From</th>
                    <th>To</th>
                    <th>Good</th>
                    <th>Amount (t/min)</th>
                    <th className="num">Ships</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {routes.map((r) => {
                    const flow = flows.get(r.id);
                    const from = byId.get(r.from);
                    const to = byId.get(r.to);
                    const update = (patch: Partial<TradeRoute>) => dispatch({ type: 'updateRoute', id: r.id, patch });
                    return (
                      <tr key={r.id} className={flow?.sourceShort ? 'row-short' : ''}>
                        <td>
                          <IslandLink island={from} onOpen={onOpenIsland} />
                        </td>
                        <td>
                          <IslandLink island={to} onOpen={onOpenIsland} />
                        </td>
                        <td>
                          <ProductLabel id={r.product} />
                        </td>
                        <td>
                          <span className="route-amount">
                            <label className="check">
                              <input
                                type="checkbox"
                                checked={r.amount === null}
                                onChange={(e) => update({ amount: e.target.checked ? null : Math.round((flow?.actual ?? 1) * 100) / 100 || 1 })}
                              />
                              Auto
                            </label>
                            {r.amount !== null && (
                              <NumberInput ariaLabel="Tons per minute" step={0.5} value={r.amount} onChange={(v) => update({ amount: v })} />
                            )}
                          </span>
                        </td>
                        <td className="num">
                          <span className={flow?.sourceShort ? 'neg strong' : flow && flow.actual === 0 ? 'zero' : 'strong'}>
                            {fmt(flow?.actual ?? 0)}
                          </span>
                          {flow?.sourceShort && <div className="small neg">source lacks surplus</div>}
                          {r.amount === null && flow?.actual === 0 && <div className="small muted">nothing to send</div>}
                        </td>
                        <td>
                          <button type="button" className="danger" onClick={() => dispatch({ type: 'removeRoute', id: r.id })}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <section className="panel">
            <h3>Suggested routes</h3>
            <p className="hint">Shortages on one island that another island’s surplus can cover.</p>
            {suggestions.length === 0 ? (
              <p className="hint">None — every coverable shortage already has a route.</p>
            ) : (
              <ul className="suggestions">
                {suggestions.map((s) => (
                  <li key={`${s.to.id}-${s.product}`}>
                    <ProductLabel id={s.product} />
                    <span className="muted">
                      {s.to.name} lacks <span className="neg">{fmt(s.lacking)}</span> · {s.from.name} has{' '}
                      <span className="pos">{fmt(s.spare)}</span> spare
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'addRoute',
                          route: { id: newId(), from: s.from.id, to: s.to.id, product: s.product, amount: null },
                        })
                      }
                    >
                      Add {s.from.name} → {s.to.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  );
}

function IslandLink({ island, onOpen }: { island: Island | undefined; onOpen: (id: string) => void }) {
  if (!island) return <span className="muted">—</span>;
  return (
    <button type="button" className="link label" onClick={() => onOpen(island.id)}>
      {island.name} <RegionBadge id={island.region} />
    </button>
  );
}

function AddRoute({ islands, dispatch }: { islands: Island[]; dispatch: Dispatch<Action> }) {
  const [from, setFrom] = useState(islands[1]?.id ?? '');
  const [to, setTo] = useState(islands[0]?.id ?? '');
  const [product, setProduct] = useState<Id>(tradeGoods[0].id);
  const valid = from && to && from !== to && islands.some((i) => i.id === from) && islands.some((i) => i.id === to);
  return (
    <div className="toolbar add-route">
      <label>
        From
        <select value={from} onChange={(e) => setFrom(e.target.value)}>
          {islands.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        To
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          {islands.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Good
        <select value={product} onChange={(e) => setProduct(Number(e.target.value))}>
          {tradeGoods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="primary"
        disabled={!valid}
        title={from === to ? 'Pick two different islands' : undefined}
        onClick={() => dispatch({ type: 'addRoute', route: { id: newId(), from, to, product, amount: null } })}
      >
        Add auto route
      </button>
    </div>
  );
}
