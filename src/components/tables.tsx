import { useMemo, useState } from 'react';
import { ceilWhole, royalTaxRate, type BuildingPlan, type Income, type ProductBalance, type Shortage, type WorkforceBalance } from '../model/calc';
import { levelById, outputRate, producerFor, workforceById, type Id } from '../model/gameData';
import { Empty, Icon, ProductLabel, RegionBadge } from './common';
import { fmt, fmtSigned, signClass } from './format';

/** Buildings of the usual producer that `net` t/min corresponds to. */
const asBuildings = (product: Id, net: number, region: Id) => {
  const f = producerFor(product, region);
  return f ? net / outputRate(f) : null;
};

export function BalanceTable({
  rows,
  region,
  shortage,
}: {
  rows: ProductBalance[];
  region: Id;
  /** Island shortages; without it, any deficit counts as short. */
  shortage?: Map<Id, Shortage>;
}) {
  const [deficitsOnly, setDeficitsOnly] = useState(false);
  const sorted = useMemo(
    () =>
      rows
        .filter((r) => !deficitsOnly || r.net < -1e-4)
        .sort((a, b) => a.net - b.net),
    [rows, deficitsOnly],
  );
  const hasTrade = rows.some((r) => Math.abs(r.trade) > 1e-9);
  const hasTarget = rows.some((r) => r.target > 0);
  return (
    <>
      <div className="toolbar">
        <label className="check">
          <input type="checkbox" checked={deficitsOnly} onChange={(e) => setDeficitsOnly(e.target.checked)} />
          Deficits only
        </label>
        <span className="hint">All rates in tons per minute.</span>
      </div>
      {sorted.length === 0 ? (
        <Empty>{deficitsOnly ? 'No deficits.' : 'Add residents or buildings to see a balance.'}</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Good</th>
                <th className="num">Produced</th>
                <th className="num">Residents use</th>
                <th className="num">Factories use</th>
                {hasTarget && <th className="num">Target</th>}
                {hasTrade && <th className="num" title="+ imports − exports over trade routes">Trade</th>}
                <th className="num">Net</th>
                <th className="num" title="Net expressed in buildings of the usual producer">≈ Buildings</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const b = asBuildings(r.product, r.net, region);
                const s = shortage ? shortage.get(r.product) : r.net < -1e-4 ? 'short' : undefined;
                return (
                  <tr key={r.product} className={s ? `row-${s}` : ''}>
                    <td>
                      <ProductLabel id={r.product} />
                    </td>
                    <td className="num">{fmt(r.produced)}</td>
                    <td className="num">{fmt(r.residents)}</td>
                    <td className="num">{fmt(r.factories)}</td>
                    {hasTarget && <td className="num">{r.target > 0 ? fmt(r.target) : ''}</td>}
                    {hasTrade && <td className={`num ${signClass(r.trade)}`}>{fmtSigned(r.trade)}</td>}
                    <td className={`num strong ${signClass(r.net)}`}>{fmtSigned(r.net)}</td>
                    <td className={`num ${signClass(r.net)}`}>{b === null ? '—' : fmtSigned(b, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function PlanTable({
  rows,
  region,
  onlyMissing = false,
}: {
  rows: BuildingPlan[];
  region?: Id;
  onlyMissing?: boolean;
}) {
  const shown = rows.filter((r) => r.required > 1e-6 || r.existing > 0).filter((r) => !onlyMissing || r.missing > 0);
  if (shown.length === 0)
    return <Empty>{onlyMissing ? 'Nothing to build — every need is covered.' : 'Add residents to see what they need.'}</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Building</th>
            <th className="num">Required</th>
            <th className="num">Have</th>
            <th className="num">To build</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.factory.id} className={r.missing > 0 ? 'row-short' : ''}>
              <td>
                <span className="label">
                  <Icon path={r.factory.icon} />
                  {r.factory.name}
                  {(region === undefined || r.factory.region !== region) && <RegionBadge id={r.factory.region} />}
                </span>
              </td>
              <td className="num">
                {fmt(r.required)} <span className="muted">({ceilWhole(r.required)})</span>
              </td>
              <td className="num">{r.existing}</td>
              <td className={`num strong ${signClass(-r.missing)}`}>
                {r.missing > 0 ? `+${r.missing}` : r.missing < 0 ? `${r.missing} spare` : '✓'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WorkforceTable({ rows }: { rows: WorkforceBalance[] }) {
  if (rows.length === 0) return <Empty>No residents or buildings yet.</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Workforce</th>
            <th className="num">Required</th>
            <th className="num">Available</th>
            <th className="num">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const w = workforceById.get(r.workforce)!;
            const net = r.available - r.required;
            return (
              <tr key={r.workforce}>
                <td>
                  <span className="label">
                    <Icon path={w.icon} />
                    {w.name}
                  </span>
                </td>
                <td className="num">{fmt(r.required, 0)}</td>
                <td className="num">{fmt(r.available, 0)}</td>
                <td className={`num strong ${signClass(net)}`}>{fmtSigned(net, 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function IncomeTable({ income }: { income: Income }) {
  if (income.tiers.length === 0 && income.maintenance === 0) return <Empty>No residents or buildings yet.</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th className="num">Residents</th>
            <th className="num">Coins / min</th>
            <th className="num" title="Crown's share of this tier's taxes: from 9% at 1,000 residents up to 40% at 4,875">
              Royal tax
            </th>
            <th className="num" title="Tax tied to goods the empire is short of">At risk</th>
          </tr>
        </thead>
        <tbody>
          {income.tiers.map((t) => {
            const l = levelById.get(t.level)!;
            return (
              <tr key={t.level}>
                <td>
                  <span className="label">
                    <Icon path={l.icon} />
                    {l.name} taxes
                  </span>
                </td>
                <td className="num">{fmt(t.residents, 0)}</td>
                <td className="num pos">{fmtSigned(t.taxes, 0)}</td>
                <td className={`num ${t.royalTax > 0 ? 'neg' : 'zero'}`}>
                  {t.royalTax > 0 ? `−${fmt(t.royalTax, 0)} (${royalTaxRate(t.residents)}%)` : '—'}
                </td>
                <td className={`num ${t.atRisk > 0 ? 'neg' : 'zero'}`}>{t.atRisk > 0 ? `−${fmt(t.atRisk, 0)}` : '—'}</td>
              </tr>
            );
          })}
          <tr>
            <td>Production building upkeep</td>
            <td />
            <td className="num neg">{income.maintenance > 0 ? `−${fmt(income.maintenance, 0)}` : '0'}</td>
            <td />
            <td />
          </tr>
          <tr className="total">
            <td>Balance</td>
            <td />
            <td className={`num strong ${signClass(income.net)}`}>{fmtSigned(income.net, 0)}</td>
            <td className={`num ${income.royalTaxes > 0 ? 'neg' : 'zero'}`}>{income.royalTaxes > 0 ? `−${fmt(income.royalTaxes, 0)}` : '—'}</td>
            <td className={`num ${income.atRisk > 0 ? 'neg' : 'zero'}`}>
              {income.atRisk > 0 ? `${fmtSigned(income.net - income.atRisk, 0)} if unsupplied` : '—'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
