import { workforceBalance, type Analysis } from '../model/calc';
import { productById, workforceById, type Id } from '../model/gameData';
import type { Island } from '../model/state';
import { Icon, RegionBadge } from './common';
import { fmt, fmtSigned, signClass } from './format';

/** Construction goods pinned to the status bar. */
const PINNED_GOODS: Id[] = [1010218 /* Steel Beams */, 1010207 /* Windows */];

/** Sticky summary of one island: workforce balance and pinned construction goods. */
export function StatusBar({
  island,
  analysis,
  onOpen,
}: {
  island: Island;
  analysis: Analysis;
  onOpen: () => void;
}) {
  const workforce = workforceBalance(island);
  const balance = analysis.byIsland.get(island.id) ?? [];
  const empireNet = new Map(analysis.empire.map((b) => [b.product, b.net]));
  return (
    <div className="status-bar" aria-label={`${island.name} summary`}>
      <button type="button" className="link label status-island" onClick={onOpen} title="Open island">
        {island.name} <RegionBadge id={island.region} />
      </button>
      <span className="status-group" aria-label="Workforce">
        <span className="status-label">Workforce</span>
        {workforce.length === 0 ? (
          <span className="muted small">—</span>
        ) : (
          workforce.map((w) => {
            const wf = workforceById.get(w.workforce)!;
            const net = w.available - w.required;
            return (
              <span
                key={w.workforce}
                className={`status-chip ${signClass(net)}`}
                title={`${wf.name}: ${fmt(w.available, 0)} available, ${fmt(w.required, 0)} required`}
              >
                <Icon path={wf.icon} size={18} />
                {fmtSigned(net, 0)}
              </span>
            );
          })
        )}
      </span>
      <span className="status-group" aria-label="Construction goods">
        {PINNED_GOODS.map((id) => {
          const p = productById.get(id)!;
          const row = balance.find((b) => b.product === id);
          const net = row?.net ?? 0;
          return (
            <span
              key={id}
              className={`status-chip ${signClass(net)}`}
              title={
                `${p.name} on ${island.name}: ${fmt(row?.produced ?? 0)} made, ${fmt((row?.residents ?? 0) + (row?.factories ?? 0))} used, ` +
                `${fmtSigned(row?.trade ?? 0)} trade. Empire: ${fmtSigned(empireNet.get(id) ?? 0)} t/min`
              }
            >
              <Icon path={p.icon} size={18} />
              {p.name} {fmtSigned(net)} t/min
            </span>
          );
        })}
      </span>
    </div>
  );
}
