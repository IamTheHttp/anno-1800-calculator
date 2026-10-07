import { useMemo } from 'react';
import { ceilWhole, collectBuildings, supplyChain, type ChainNode } from '../model/calc';
import { factoryById, game, outputRate, producerFor, producersOf, productById, type Id } from '../model/gameData';
import { Icon, NumberInput, RegionBadge } from './common';
import { fmt } from './format';
import { usePref } from './usePref';

const chainProducts = game.products
  .filter((p) => producersOf.has(p.id))
  .sort((a, b) => a.name.localeCompare(b.name));

export function ChainView() {
  const [product, setProduct] = usePref<Id>('chainProduct', chainProducts[0].id);
  const [region, setRegion] = usePref<Id>('chainRegion', game.regions[0].id);
  const [buildings, setBuildings] = usePref<number>('chainBuildings', 1);

  const top = producerFor(product, region);
  const rate = top ? buildings * outputRate(top) : 0;
  const chain = useMemo(() => supplyChain(product, rate, region), [product, rate, region]);
  const totals = useMemo(() => [...collectBuildings(chain)].sort((a, b) => b[1] - a[1]), [chain]);

  return (
    <section className="view">
      <h2>Supply chains</h2>
      <p className="lede">Pick a good and how many final buildings you want; the chain shows exact counts behind them.</p>
      <div className="toolbar chain-controls">
        <label>
          Good
          <select value={product} onChange={(e) => setProduct(Number(e.target.value))}>
            {chainProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Consumed in
          <select value={region} onChange={(e) => setRegion(Number(e.target.value))}>
            {game.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Final buildings
          <NumberInput ariaLabel="Final buildings" min={1} value={buildings} onChange={(v) => setBuildings(Math.max(1, v))} />
        </label>
        <span className="hint">= {fmt(rate)} t/min</span>
      </div>
      <div className="chain-layout">
        <div className="panel chain-tree">
          <ul className="tree">
            <ChainRow node={chain} region={region} />
          </ul>
        </div>
        <div className="panel">
          <h3>Totals</h3>
          <table>
            <tbody>
              {totals.map(([fid, n]) => {
                const f = factoryById.get(fid)!;
                return (
                  <tr key={fid}>
                    <td>
                      <span className="label">
                        <Icon path={f.icon} />
                        {f.name}
                        {f.region !== region && <RegionBadge id={f.region} />}
                      </span>
                    </td>
                    <td className="num">{fmt(n)}</td>
                    <td className="num strong">{ceilWhole(n)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ChainRow({ node, region }: { node: ChainNode; region: Id }) {
  const p = productById.get(node.product);
  return (
    <li>
      <div className="tree-node">
        <Icon path={node.factory?.icon ?? p?.icon ?? null} size={26} />
        <span className="strong">{node.factory?.name ?? p?.name}</span>
        {node.factory && node.factory.region !== region && <RegionBadge id={node.factory.region} />}
        <span className="tree-count">×{fmt(node.buildings)}</span>
        <span className="muted small">
          {fmt(node.rate)} t/min {p?.name}
        </span>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((c) => (
            <ChainRow key={c.product} node={c} region={region} />
          ))}
        </ul>
      )}
    </li>
  );
}
