import { useEffect, useReducer, useRef, useState } from 'react';
import { ChainView } from './components/ChainView';
import { RegionBadge } from './components/common';
import { usePref } from './components/usePref';
import { EmpireView } from './components/EmpireView';
import { IslandView } from './components/IslandView';
import { game } from './model/gameData';
import { loadSaved, newIsland, parseExportFile, reducer, save, toExportFile } from './model/state';

type View = { kind: 'empire' } | { kind: 'chains' } | { kind: 'island'; id: string };

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, loadSaved);
  const [view, setView] = usePref<View>('view', { kind: 'empire' });
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => save(state), [state]);

  const island = view.kind === 'island' ? state.islands.find((i) => i.id === view.id) : undefined;
  const current: View = view.kind === 'island' && !island ? { kind: 'empire' } : view;

  const addIsland = (region: number) => {
    const i = newIsland(`Island ${state.islands.length + 1}`, region);
    dispatch({ type: 'addIsland', island: i });
    setView({ kind: 'island', id: i.id });
  };

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(toExportFile(state), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `anno1800-plan-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importFile = async (file: File) => {
    try {
      const { state: next, warnings } = parseExportFile(JSON.parse(await file.text()));
      if (!confirm(`Replace the current plan with ${next.islands.length} island(s) from “${file.name}”?`)) return;
      dispatch({ type: 'replace', state: next });
      setView({ kind: 'empire' });
      setNotice({
        tone: 'ok',
        text: `Imported ${next.islands.length} island(s).` + (warnings.length ? ` ${warnings.join(' ')}` : ''),
      });
    } catch (e) {
      setNotice({ tone: 'error', text: `Import failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>Anno 1800 Planner</h1>
        <div className="topbar-actions">
          <label className="check" title="Hide needs an island has not unlocked yet by resident count">
            <input
              type="checkbox"
              checked={state.settings.applyUnlocks}
              onChange={(e) => dispatch({ type: 'setSettings', patch: { applyUnlocks: e.target.checked } })}
            />
            Apply need unlocks
          </label>
          <button type="button" onClick={() => fileInput.current?.click()}>
            Import JSON
          </button>
          <button type="button" className="primary" onClick={exportFile}>
            Export JSON
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>
      {notice && (
        <div className={`notice ${notice.tone}`} role="status">
          {notice.text}
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}
      <div className="layout">
        <nav className="sidebar">
          <button type="button" className={`nav ${current.kind === 'empire' ? 'active' : ''}`} onClick={() => setView({ kind: 'empire' })}>
            Empire overview
          </button>
          <button type="button" className={`nav ${current.kind === 'chains' ? 'active' : ''}`} onClick={() => setView({ kind: 'chains' })}>
            Supply chains
          </button>
          <h2 className="nav-heading">Islands</h2>
          {state.islands.map((i, idx) => (
            <div key={i.id} className={`nav island-nav ${current.kind === 'island' && current.id === i.id ? 'active' : ''}`}>
              <button type="button" className="island-link" onClick={() => setView({ kind: 'island', id: i.id })}>
                <span>{i.name}</span>
                <RegionBadge id={i.region} />
              </button>
              <span className="reorder">
                <button type="button" aria-label="Move up" disabled={idx === 0} onClick={() => dispatch({ type: 'moveIsland', id: i.id, delta: -1 })}>
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={idx === state.islands.length - 1}
                  onClick={() => dispatch({ type: 'moveIsland', id: i.id, delta: 1 })}
                >
                  ↓
                </button>
              </span>
            </div>
          ))}
          <div className="add-island">
            {game.regions.map((r) => (
              <button key={r.id} type="button" onClick={() => addIsland(r.id)}>
                + {r.name.replace(/^The /, '')} island
              </button>
            ))}
          </div>
        </nav>
        <main>
          {current.kind === 'empire' && (
            <EmpireView islands={state.islands} settings={state.settings} onOpenIsland={(id) => setView({ kind: 'island', id })} />
          )}
          {current.kind === 'chains' && <ChainView />}
          {current.kind === 'island' && island && <IslandView island={island} settings={state.settings} dispatch={dispatch} />}
        </main>
      </div>
    </div>
  );
}
