import { useState, type ReactNode } from 'react';
import icons from '../data/icons.json';
import { productById, regionById, type Id } from '../model/gameData';

const iconMap: Record<string, string> = icons;

export function Icon({ path, size = 22, title }: { path: string | null; size?: number; title?: string }) {
  const src = path ? iconMap[path] : undefined;
  if (!src) return <span className="icon icon-empty" style={{ width: size, height: size }} />;
  return <img className="icon" src={src} width={size} height={size} alt={title ?? ''} title={title} />;
}

export function ProductLabel({ id }: { id: Id }) {
  const p = productById.get(id);
  return (
    <span className="label">
      <Icon path={p?.icon ?? null} title={p?.name} />
      {p?.name ?? `#${id}`}
    </span>
  );
}

export function RegionBadge({ id }: { id: Id }) {
  const r = regionById.get(id);
  return <span className={`badge region-${id}`}>{r?.name.replace(/^The /, '') ?? id}</span>;
}

export function NumberInput({
  value,
  onChange,
  step = 1,
  min = 0,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  ariaLabel: string;
}) {
  // Text being typed; null while not editing, so the field mirrors `value`.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    const n = Number(raw);
    setDraft(null);
    onChange(Number.isFinite(n) ? Math.max(min, n) : value);
  };
  return (
    <span className="stepper">
      <button type="button" aria-label={`Decrease ${ariaLabel}`} onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <input
        inputMode="numeric"
        aria-label={ariaLabel}
        value={draft ?? String(value)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(e.currentTarget.value);
          if (e.key === 'ArrowUp') onChange(value + step);
          if (e.key === 'ArrowDown') onChange(Math.max(min, value - step));
        }}
      />
      <button type="button" aria-label={`Increase ${ariaLabel}`} onClick={() => onChange(value + step)}>
        +
      </button>
    </span>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: ReactNode }[];
  active: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === active}
          className={t.id === active ? 'active' : ''}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
